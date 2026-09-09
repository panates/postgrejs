import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import DoublyLinked from 'doublylinked';
import promisify from 'putil-promisify';
import { ConnectionState } from '../constants.js';
import type { ConnectionConfiguration } from '../interfaces/database-connection-params.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import type { Callback, Maybe } from '../types.js';
import { Backend } from './backend.js';
import { signatureHashOfCertificate } from './cert-signature.js';
import { DatabaseError } from './database-error.js';
import { Frontend } from './frontend.js';
import { Protocol } from './protocol.js';
import { SASL } from './sasl.js';

const DEFAULT_PORT_NUMBER = 5432;
const COMMAND_RESULT_PATTERN = /^([^\d]+)(?: (\d+)(?: (\d+))?)?$/;

export type CaptureCallback = (
  code: Protocol.BackendMessageCode,
  msg: any,
  done: (err: Maybe<Error>, result?: any) => void,
) => void | Promise<void>;

export interface SocketError extends Error {
  code: string;
}

interface CaptureEntry {
  callback: CaptureCallback;
  resolve: (result: any) => void;
  reject: (err: Error) => void;
}

export class PgSocket extends SafeEventEmitter {
  private _state = ConnectionState.CLOSED;
  private _socket?: net.Socket;
  private _backend = new Backend();
  private _frontend: Frontend;
  private _sessionParameters: Record<string, string> = {};
  private _saslSession?: SASL.Session;
  private _processID?: number;
  private _secretKey?: number;
  private _protocolNegotiation?: Protocol.NegotiateProtocolVersionMessage;
  private _captureQueue = new DoublyLinked<CaptureEntry>();
  private _pendingWrites: { data: Buffer; cb?: Callback }[] = [];
  private _flushScheduled = false;
  private _hosts: { host: string; port?: number }[] = [];
  private _hostIndex = 0;
  private _sessionAttrsChecked = false;
  private _standbyState?: { standby: boolean; readOnly: boolean };

  constructor(public options: ConnectionConfiguration) {
    super();
    this._frontend = new Frontend({ buffer: options.buffer });
    this.setMaxListeners(99);
  }

  get state(): ConnectionState {
    if (!this._socket || this._socket.destroyed)
      this._state = ConnectionState.CLOSED;
    return this._state;
  }

  get processID(): Maybe<number> {
    return this._processID;
  }

  get secretKey(): Maybe<number> {
    return this._secretKey;
  }

  /**
   * The server's NegotiateProtocolVersion reply, if it sent one -
   * undefined means everything this client asked for in its startup
   * packet (protocol minor version, any `_pq_.*` options) was fully
   * recognized. Present only when the server is older/stricter than what
   * was requested, or didn't recognize one of the startup options.
   */
  get protocolNegotiation(): Maybe<Protocol.NegotiateProtocolVersionMessage> {
    return this._protocolNegotiation;
  }

  get sessionParameters(): Record<string, string> {
    return this._sessionParameters;
  }

  connect() {
    if (this._socket) return;
    const options = this.options;
    this._hosts = options.hosts?.length
      ? options.hosts
      : [{ host: options.host || 'localhost', port: options.port }];
    this._hostIndex = 0;
    this._connectToHost();
  }

  protected _connectToHost() {
    this._sessionAttrsChecked = false;
    this._state = ConnectionState.CONNECTING;
    const target = this._hosts[this._hostIndex];
    const socket = (this._socket = new net.Socket());

    const errorHandler = (err: Error) => {
      this._state = ConnectionState.CLOSED;
      this._removeListeners();
      this._reset();
      socket.destroy();
      this._socket = undefined;
      if (this._hostIndex + 1 < this._hosts.length) {
        this._hostIndex++;
        this._connectToHost();
        return;
      }
      this.emit('error', err);
    };

    const connectHandler = () => {
      socket.setTimeout(0);
      if (this.options.keepAlive || this.options.keepAlive == null)
        socket.setKeepAlive(true);
      this._negotiateTls(
        socket,
        target,
        readySocket => {
          this._socket = readySocket;
          this._removeListeners();
          this._handleConnect();
        },
        errorHandler,
      );
    };

    socket.setNoDelay(true);
    socket.setTimeout(this.options.connectTimeoutMs || 30000, () =>
      errorHandler(new Error('Connection timed out')),
    );
    socket.once('error', errorHandler);
    socket.once('connect', connectHandler);

    this.emit('connecting');
    const port = target.port || DEFAULT_PORT_NUMBER;
    if (target.host && target.host.startsWith('/')) {
      socket.connect(path.join(target.host, '/.s.PGSQL.' + port));
    } else socket.connect(port, target.host || 'localhost');
  }

  /**
   * Negotiates TLS on an already TCP-connected `socket`, if configured -
   * shared between the long-lived connection above (_connectToHost) and
   * cancel() below, which needs the exact same host/TLS handling for its
   * own short-lived socket, just without ever sending a StartupMessage
   * afterwards. Resolves `onReady` with whichever socket ends up ready to
   * speak the PostgreSQL protocol: the plain one, or its TLS upgrade.
   */
  protected _negotiateTls(
    socket: net.Socket,
    target: { host: string; port?: number },
    onReady: (socket: net.Socket | tls.TLSSocket) => void,
    onError: (err: Error) => void,
  ): void {
    const options = this.options;
    const startTls = () => {
      const tlsOptions: tls.ConnectionOptions = { ...options.ssl, socket };
      if (target.host && net.isIP(target.host) === 0)
        tlsOptions.servername = target.host;
      if (options.sslNegotiation === 'direct')
        tlsOptions.ALPNProtocols = ['postgresql'];
      const tlsSocket = tls.connect(tlsOptions);
      tlsSocket.once('error', onError);
      tlsSocket.once('secureConnect', () => onReady(tlsSocket));
    };
    const wantsSSL =
      !!options.ssl ||
      !!options.requireSSL ||
      options.sslNegotiation === 'direct';
    if (!wantsSSL) return onReady(socket);
    if (options.sslNegotiation === 'direct') {
      // Straight into the handshake: no SSLRequest, nothing in the clear.
      return startTls();
    }
    socket.write(this._frontend.getSSLRequestMessage());
    socket.once('data', x => {
      const command = x.toString();
      if (command === 'S') return startTls();
      if (command === 'N') {
        if (options.requireSSL) {
          return onError(new Error('Server does not support SSL connections'));
        }
        return onReady(socket);
      }
      return onError(
        new Error('There was an error establishing an SSL connection'),
      );
    });
  }

  /**
   * Asks the server to cancel whatever this session is currently running.
   *
   * Opens its own short-lived connection and closes it again: a backend busy
   * with a query is not reading its own socket, so the request cannot travel
   * down the connection it is meant to interrupt. The server answers nothing
   * - it either finds a matching session and signals it or does not - so
   * this resolves once the bytes are out, and the cancelled query reports
   * the outcome itself, as an ordinary error on its own connection.
   *
   * No StartupMessage or authentication is ever sent here - the
   * CancelRequest is the only message this socket carries, and it is
   * self-authorized by the processID/secretKey pair BackendKeyData handed
   * out to the session being cancelled, not by a separate login. TLS is
   * still negotiated via _negotiateTls() when configured, because a
   * `hostssl` pg_hba.conf rule can reject a plaintext connection outright
   * before the server ever reads what request it carries - and the target
   * is `_hosts[_hostIndex]`, the host this session actually ended up
   * connected to, not `options.host`, which after a multi-host failover may
   * name a candidate this session never used.
   */
  cancel(): Promise<void> {
    const processID = this._processID;
    const secretKey = this._secretKey;
    // Nothing to cancel before the session is established.
    if (processID == null || secretKey == null) return Promise.resolve();
    const data = this._frontend.getCancelRequestMessage(processID, secretKey);
    const target = this._hosts[this._hostIndex];

    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      const fail = (err: Error) => {
        socket.destroy();
        reject(err);
      };
      const send = (readySocket: net.Socket | tls.TLSSocket) => {
        readySocket.end(data, () => {
          readySocket.destroy();
          resolve();
        });
      };
      socket.setNoDelay(true);
      socket.once('error', fail);
      socket.once('connect', () =>
        this._negotiateTls(socket, target, send, fail),
      );
      const port = target.port || DEFAULT_PORT_NUMBER;
      if (target.host && target.host.startsWith('/'))
        socket.connect(path.join(target.host, '/.s.PGSQL.' + port));
      else socket.connect(port, target.host || 'localhost');
    });
  }

  close(): void {
    if (!this._socket || this._socket.destroyed) {
      this._state = ConnectionState.CLOSED;
      this._socket = undefined;
      this._reset();
      return;
    }
    if (this._state === ConnectionState.CLOSING) return;
    const socket = this._socket;
    this._state = ConnectionState.CLOSING;
    this._removeListeners();
    socket.once('close', () => this._handleClose());
    socket.destroy();
  }

  sendExecuteMessage(
    args: Frontend.ExecuteMessageArgs,
    cb: CaptureCallback,
  ): Promise<any> {
    return this._sendAndCapture(
      this._frontend.getExecuteMessage(args),
      cb,
      'sendExecuteMessage',
      args,
    );
  }

  sendCloseMessage(
    args: Frontend.CloseMessageArgs,
    cb: CaptureCallback,
  ): Promise<any> {
    return this._sendAndCapture(
      this._frontend.getCloseMessage(args),
      cb,
      'sendCloseMessage',
      args,
    );
  }

  /**
   * Sends Parse+Bind+Describe+Execute+Sync as a single write with a single
   * FIFO capture entry, instead of 5 separate sendXMessage() round trips -
   * the one-shot Extended Query fast path (IntlConnection.queryOnce()).
   * Callers pass unnamed statement/portal (omit statement/portal/name) so
   * no Close message is needed at all: PostgreSQL auto-clears an unnamed
   * statement/portal at the next Parse/Bind referencing the unnamed name.
   */
  sendExtendedQueryMessages(
    args: {
      parse: Frontend.ParseMessageArgs;
      bind: Frontend.BindMessageArgs;
      describe: Frontend.DescribeMessageArgs;
      execute: Frontend.ExecuteMessageArgs;
    },
    cb: CaptureCallback,
  ): Promise<any> {
    const data = [
      this._frontend.getParseMessage(args.parse),
      this._frontend.getBindMessage(args.bind),
      this._frontend.getDescribeMessage(args.describe),
      this._frontend.getExecuteMessage(args.execute),
      this._frontend.getSyncMessage(),
    ];
    return this._sendAndCapture(data, cb, 'sendExtendedQueryMessages', args);
  }

  /**
   * Parse + Describe(statement) + Sync as a single round trip - used by
   * PreparedStatement.prepare() instead of a separate awaited Parse then a
   * separate awaited Sync, and fetches the RowDescription/NoData in the
   * same round trip so PreparedStatement can cache it instead of every
   * later execute() re-Describing its own portal.
   */
  sendPrepareMessages(
    args: {
      parse: Frontend.ParseMessageArgs;
      describe: Frontend.DescribeMessageArgs;
    },
    cb: CaptureCallback,
  ): Promise<any> {
    const data = [
      this._frontend.getParseMessage(args.parse),
      this._frontend.getDescribeMessage(args.describe),
      this._frontend.getSyncMessage(),
    ];
    return this._sendAndCapture(data, cb, 'sendPrepareMessages', args);
  }

  /**
   * Bind + Execute + Sync as a single round trip, against an UNNAMED
   * portal (args.bind.portal/args.execute.portal left unset) - used by
   * PreparedStatement._execute() to reuse an already-prepared (named)
   * statement without the per-call Describe/Close that Portal's own
   * bind()/retrieveFields()/execute()/close() sequence needs for a
   * freshly-created named portal. No Close message is needed: PostgreSQL
   * auto-clears an unnamed portal at the next Bind naming it.
   */
  sendBindExecuteMessages(
    args: {
      bind: Frontend.BindMessageArgs;
      execute: Frontend.ExecuteMessageArgs;
    },
    cb: CaptureCallback,
  ): Promise<any> {
    const data = [
      this._frontend.getBindMessage(args.bind),
      this._frontend.getExecuteMessage(args.execute),
      this._frontend.getSyncMessage(),
    ];
    return this._sendAndCapture(data, cb, 'sendBindExecuteMessages', args);
  }

  /**
   * Bind + Describe(portal) + Flush as a single round trip (NOT Sync - see
   * Portal.bindAndRetrieveFields()'s doc comment for why a Sync here would
   * be unsafe: it would commit an implicit/autocommit transaction and
   * destroy the just-bound named portal before any fetch() could use it).
   * Used by PreparedStatement._execute()'s cursor branch instead of two
   * separately-awaited Portal.bind()/retrieveFields() round trips.
   */
  sendBindDescribeMessages(
    args: {
      bind: Frontend.BindMessageArgs;
      describe: Frontend.DescribeMessageArgs;
    },
    cb: CaptureCallback,
  ): Promise<any> {
    const data = [
      this._frontend.getBindMessage(args.bind),
      this._frontend.getDescribeMessage(args.describe),
      this._frontend.getFlushMessage(),
    ];
    return this._sendAndCapture(data, cb, 'sendBindDescribeMessages', args);
  }

  /**
   * Close + Sync under ONE capture, rather than a Close capture followed by
   * a separate Sync capture. That split is unsafe after an ErrorResponse:
   * the server then skips every message until Sync, so the only reply is
   * the Sync's ReadyForQuery - which the FIFO hands to the *Close* capture
   * (the older entry), making it fail with "unexpected response message
   * (Z)" and leaving the Sync capture orphaned, to silently swallow the
   * first message of whatever request comes next. With one capture,
   * ReadyForQuery is simply this request's end marker whether or not the
   * Close itself was honoured.
   */
  sendCloseAndSyncMessages(
    args: Frontend.CloseMessageArgs,
    cb: CaptureCallback,
  ): Promise<any> {
    const data = [
      this._frontend.getCloseMessage(args),
      this._frontend.getSyncMessage(),
    ];
    return this._sendAndCapture(data, cb, 'sendCloseAndSyncMessages', args);
  }

  /**
   * Close(portal) + Close(statement) + Sync as a single round trip - used
   * by PreparedStatement._maybeCloseWithPortal() when a Cursor's close()
   * brings the owning PreparedStatement's refcount to 0, instead of two
   * separately-batched Close+Sync round trips (Portal.close() then
   * PreparedStatement._close()). Sync here is safe/intended: this is final
   * teardown, no portal needs to survive past it.
   */
  sendClosePortalAndStatementMessages(
    args: {
      portal: Frontend.CloseMessageArgs;
      statement: Frontend.CloseMessageArgs;
    },
    cb: CaptureCallback,
  ): Promise<any> {
    const data = [
      this._frontend.getCloseMessage(args.portal),
      this._frontend.getCloseMessage(args.statement),
      this._frontend.getSyncMessage(),
    ];
    return this._sendAndCapture(
      data,
      cb,
      'sendClosePortalAndStatementMessages',
      args,
    );
  }

  sendQueryMessage(sql: string, cb: CaptureCallback): Promise<any> {
    return this._sendAndCapture(
      this._frontend.getQueryMessage(sql),
      cb,
      'sendQueryMessage',
      sql,
    );
  }

  /**
   * COPY IN data. Unlike every other send*() here this pushes nothing onto
   * the capture queue: while a COPY is in progress the server answers no
   * individual CopyData message, so the response still belongs to the
   * Query capture that opened the copy.
   *
   * Returns false when the socket's buffer is full, exactly as
   * net.Socket.write() does - the caller is expected to stop writing until
   * `cb` fires, which is what CopyFromStream hands straight to its own
   * Writable callback.
   */
  sendCopyData(data: Buffer, cb?: Callback): boolean {
    return this._sendCopy(this._frontend.getCopyDataMessage(data), cb);
  }

  /** Ends a COPY IN normally; the server replies CommandComplete. */
  sendCopyDone(cb?: Callback): boolean {
    return this._sendCopy(this._frontend.getCopyDoneMessage(), cb);
  }

  /**
   * Aborts a COPY IN. The server discards the copy, reports `message` as an
   * ErrorResponse and returns to its normal state - without this a failed
   * import would leave the connection waiting for data forever.
   */
  sendCopyFail(message: string, cb?: Callback): boolean {
    return this._sendCopy(this._frontend.getCopyFailMessage(message), cb);
  }

  /**
   * Stops reading from the socket, so a COPY OUT consumer that cannot keep
   * up doesn't buffer the whole export in memory. Safe to call repeatedly.
   */
  pause(): void {
    this._socket?.pause();
  }

  resume(): void {
    this._socket?.resume();
  }

  sendFlushMessage(cb?: Callback): void {
    if (this.listenerCount('debug'))
      this.emit('debug', { location: 'PgSocket.sendFlushMessage' });

    this._send(this._frontend.getFlushMessage(), cb);
  }

  sendTerminateMessage(cb?: Callback): void {
    if (this.listenerCount('debug'))
      this.emit('debug', { location: 'PgSocket.sendTerminateMessage' });

    this._send(this._frontend.getTerminateMessage(), cb);
  }

  sendSyncMessage(cb: CaptureCallback): Promise<any> {
    return this._sendAndCapture(
      this._frontend.getSyncMessage(),
      cb,
      'sendSyncMessage',
      undefined,
    );
  }

  /**
   * The only way anything outside this class can receive a correlated
   * backend response. Sends `data` and pushes `cb` onto the FIFO capture
   * queue in the same call, so a response can never arrive before its
   * capturer is registered, and a capturer can never be registered without
   * a message actually going out for it - there is no separate, decoupled
   * "start listening" step to race or misuse.
   */
  private _sendAndCapture(
    data: Buffer | Buffer[],
    cb: CaptureCallback,
    location: string,
    args: unknown,
  ): Promise<any> {
    if (typeof cb !== 'function')
      throw new TypeError(`${location}() requires a CaptureCallback`);
    if (this.listenerCount('debug'))
      this.emit('debug', { location: `PgSocket.${location}`, args });

    return new Promise((resolve, reject) => {
      const entry: CaptureEntry = { callback: cb, resolve, reject };
      this._captureQueue.push(entry);
      if (!this._send(data)) {
        // Nothing else can have run between the push above and here (fully
        // synchronous), so the entry just pushed is still the tail.
        this._captureQueue.pop();
        reject(new Error('Socket is not writable'));
      }
    });
  }

  protected _removeListeners(): void {
    if (!this._socket) return;
    this._socket.removeAllListeners('error');
    this._socket.removeAllListeners('connect');
    this._socket.removeAllListeners('data');
    this._socket.removeAllListeners('close');
  }

  protected _reset(): void {
    this._backend.reset();
    this._sessionParameters = {};
    this._processID = undefined;
    this._secretKey = undefined;
    this._saslSession = undefined;
    // Anything still queued belonged to the connection being reset - it
    // must never reach a freshly connected socket.
    this._pendingWrites = [];
  }

  protected _handleConnect(): void {
    const socket = this._socket;
    if (!socket) return;
    this._state = ConnectionState.AUTHORIZING;
    this._reset();
    socket.on('data', (data: Buffer) => this._handleData(data));
    socket.on('error', (err: SocketError) => this._handleError(err));
    socket.on('close', () => this._handleClose());
    this._send(
      this._frontend.getStartupMessage({
        user: this.options.user || 'postgres',
        database: this.options.database || '',
        application_name: this.options.applicationName || '',
        ...(this.options.replication
          ? { replication: this.options.replication }
          : undefined),
      }),
    );
  }

  /**
   * Called once the server is ready. With `targetSessionAttrs` set, the
   * session has to be checked before it is handed over: a server that does
   * not match is dropped and the next candidate tried, which is how
   * `read-write` finds whichever node is currently the primary.
   */
  protected _finishConnect(): void {
    const wanted = this.options.targetSessionAttrs;
    if (!wanted || this._sessionAttrsChecked) {
      this.emit('ready');
      return;
    }
    this._sessionAttrsChecked = true;
    const reported = this._sessionParameters;
    if (
      reported.in_hot_standby != null &&
      reported.default_transaction_read_only != null
    ) {
      this._applySessionAttrs(
        wanted,
        reported.in_hot_standby === 'on',
        reported.default_transaction_read_only === 'on',
      );
      return;
    }
    this.sendQueryMessage(
      'select pg_catalog.pg_is_in_recovery()::text as a,' +
        " current_setting('transaction_read_only') as b",
      (code, msg, done) => {
        if (code === Protocol.BackendMessageCode.DataRow) {
          // Two text columns, each length-prefixed within the row buffer.
          const data: Buffer = msg.data;
          const aLen = data.readInt32BE(0);
          const a = data.toString('utf8', 4, 4 + aLen);
          const bOffset = 4 + aLen;
          const bLen = data.readInt32BE(bOffset);
          const b = data.toString('utf8', bOffset + 4, bOffset + 4 + bLen);
          this._standbyState = { standby: a === 'true', readOnly: b === 'on' };
        } else if (code === Protocol.BackendMessageCode.ReadyForQuery) {
          done(undefined);
          const st = this._standbyState;
          this._applySessionAttrs(wanted, !!st?.standby, !!st?.readOnly);
        }
      },
    ).catch(err => this.emit('error', err));
  }

  /** Accepts this server, or drops it and moves to the next candidate. */
  protected _applySessionAttrs(
    wanted: string,
    standby: boolean,
    readOnly: boolean,
  ): void {
    const rejected =
      (wanted === 'read-write' && readOnly) ||
      (wanted === 'read-only' && !readOnly) ||
      (wanted === 'primary' && standby) ||
      (wanted === 'standby' && !standby) ||
      // prefer-standby settles for a primary, but only once nothing else
      // is left to try.
      (wanted === 'prefer-standby' &&
        !standby &&
        this._hostIndex + 1 < this._hosts.length);
    if (!rejected) {
      this.emit('ready');
      return;
    }
    const target = this._hosts[this._hostIndex];
    if (this._hostIndex + 1 >= this._hosts.length) {
      this.close();
      this.emit(
        'error',
        new Error(
          `No server matched target_session_attrs "${wanted}" ` +
            `(last tried ${target.host}:${target.port ?? this.options.port ?? DEFAULT_PORT_NUMBER})`,
        ),
      );
      return;
    }
    this._hostIndex++;
    const socket = this._socket;
    this._removeListeners();
    this._socket = undefined;
    this._reset();
    socket?.destroy();
    this._connectToHost();
  }

  protected _handleClose(): void {
    this._failPendingCaptures(new Error('Connection closed'));
    this._reset();
    this._socket = undefined;
    this._state = ConnectionState.CLOSED;
    this.emit('close');
  }

  protected _handleError(err: unknown): void {
    this._failPendingCaptures(
      err instanceof Error ? err : new Error(String(err)),
    );
    if (this._state !== ConnectionState.READY) {
      this._socket?.end();
    }
    this.emit('error', err);
  }

  /** Rejects and clears every still-open capture, e.g. on close/error. */
  private _failPendingCaptures(err: Error): void {
    const pending = this._captureQueue;
    this._captureQueue = new DoublyLinked();
    pending.forEach(entry => entry.reject(err));
  }

  protected _handleData(data: Buffer): void {
    this._backend.parse(
      data,
      (code: Protocol.BackendMessageCode, payload?: any) => {
        try {
          switch (code) {
            case Protocol.BackendMessageCode.Authentication:
              this._handleAuthenticationMessage(payload);
              break;
            case Protocol.BackendMessageCode.ErrorResponse:
              this._dispatch(code, new DatabaseError(payload));
              break;
            case Protocol.BackendMessageCode.NoticeResponse:
              this.emit('notice', payload);
              break;
            case Protocol.BackendMessageCode.NotificationResponse:
              this.emit('notification', payload);
              break;
            case Protocol.BackendMessageCode.ParameterStatus:
              this._handleParameterStatus(
                payload as Protocol.ParameterStatusMessage,
              );
              break;
            case Protocol.BackendMessageCode.NegotiateProtocolVersion:
              this._handleNegotiateProtocolVersion(
                payload as Protocol.NegotiateProtocolVersionMessage,
              );
              break;
            case Protocol.BackendMessageCode.BackendKeyData:
              this._handleBackendKeyData(
                payload as Protocol.BackendKeyDataMessage,
              );
              break;
            case Protocol.BackendMessageCode.ReadyForQuery:
              if (this._state !== ConnectionState.READY) {
                this._state = ConnectionState.READY;
                this._finishConnect();
              } else this._dispatch(code, payload);
              break;
            case Protocol.BackendMessageCode.CommandComplete: {
              const msg = this._handleCommandComplete(payload);
              this._dispatch(code, msg);
              break;
            }
            default:
              this._dispatch(code, payload);
          }
        } catch (e) {
          this._handleError(e);
        }
      },
    );
  }

  /**
   * Routes one backend message to the capture at the front of the FIFO -
   * the oldest still-open request, i.e. the one whose turn it is given the
   * order messages were written to the socket. This *is* the request/
   * response correlation, since the wire protocol has no id of its own.
   * The same entry keeps receiving messages (ParseComplete, BindComplete,
   * RowDescription, DataRow*, CommandComplete, ReadyForQuery, ...) until
   * its callback calls `done()`, at which point it is dequeued and the
   * next entry becomes the one messages are routed to.
   */
  private _dispatch(code: Protocol.BackendMessageCode, payload: any): void {
    const entry = this._captureQueue.head?.value;
    if (!entry) {
      if (payload instanceof DatabaseError) {
        this.emit('error', payload);
        return;
      }
      this.emit(
        'error',
        new Error(
          `PgSocket: received message code=${String(code)} with an empty capture queue`,
        ),
      );
      return;
    }
    const done = (err: Maybe<Error>, result?: any) => {
      if (this._captureQueue.head?.value !== entry) return;
      this._captureQueue.shift();
      if (err) entry.reject(err);
      else entry.resolve(result);
    };
    try {
      const x = entry.callback(code, payload, done);
      if (promisify.isPromise(x)) (x as Promise<void>).catch(err => done(err));
    } catch (err) {
      done(err as Error);
    }
  }

  protected _resolvePassword(cb: (password: string) => void): void {
    (async (): Promise<void> => {
      const pass =
        typeof this.options.password === 'function'
          ? await this.options.password()
          : this.options.password;
      cb(pass || '');
    })().catch(err => this._handleError(err));
  }

  protected _handleAuthenticationMessage(msg?: any): void {
    if (!msg) {
      this.emit('authenticate');
      return;
    }

    switch (msg.kind) {
      case Protocol.AuthenticationMessageKind.CleartextPassword:
        this._resolvePassword(password => {
          this._send(this._frontend.getPasswordMessage(password));
        });
        break;
      case Protocol.AuthenticationMessageKind.MD5Password:
        this._resolvePassword(password => {
          const md5 = (x: any) =>
            crypto.createHash('md5').update(x, 'utf8').digest('hex');
          const l = md5(password + this.options.user);
          const r = md5(Buffer.concat([Buffer.from(l), msg.salt]));
          const pass = 'md5' + r;
          this._send(this._frontend.getPasswordMessage(pass));
        });
        break;
      case Protocol.AuthenticationMessageKind.SASL: {
        const mode = this.options.channelBinding || 'prefer';
        const tlsSocket =
          mode !== 'disable' && this._socket instanceof tls.TLSSocket
            ? this._socket
            : undefined;
        const offersBinding = !!msg.mechanisms?.includes('SCRAM-SHA-256-PLUS');
        const useBinding = !!tlsSocket && offersBinding;
        if (mode === 'require' && !useBinding) {
          throw new Error(
            tlsSocket
              ? 'SASL: channelBinding is "require" but the server does not offer SCRAM-SHA-256-PLUS'
              : 'SASL: channelBinding is "require" but the connection is not using TLS',
          );
        }
        if (!useBinding && !msg.mechanisms?.includes('SCRAM-SHA-256')) {
          throw new Error(
            'SASL: Only mechanisms SCRAM-SHA-256 and SCRAM-SHA-256-PLUS are supported',
          );
        }
        const saslSession = (this._saslSession = SASL.createSession(
          this.options.user || '',
          useBinding ? 'SCRAM-SHA-256-PLUS' : 'SCRAM-SHA-256',
          useBinding ? this._channelBindingData(tlsSocket!) : undefined,
          !!tlsSocket,
        ));
        this._send(this._frontend.getSASLMessage(saslSession));
        break;
      }
      case Protocol.AuthenticationMessageKind.SASLContinue: {
        const saslSession = this._saslSession;
        if (!saslSession) throw new Error('SASL: Session not started yet');
        this._resolvePassword(password => {
          SASL.continueSession(saslSession, password, msg.data);
          const buf = this._frontend.getSASLFinalMessage(saslSession);
          this._send(buf);
        });
        break;
      }
      case Protocol.AuthenticationMessageKind.SASLFinal: {
        const session = this._saslSession;
        if (!session) throw new Error('SASL: Session not started yet');
        SASL.finalizeSession(session, msg.data);
        this._saslSession = undefined;
        break;
      }
      default:
        throw new Error(
          `Authentication method "${msg.kind}" is not supported. ` +
            'Supported methods are cleartext password, MD5 and SCRAM-SHA-256 ' +
            '(with or without channel binding).',
        );
    }
  }

  /**
   * tls-server-end-point: the server certificate hashed with the algorithm
   * its own signature used (RFC 5929), which is why the DER has to be read
   * rather than one of Node's fixed fingerprints taken.
   */
  protected _channelBindingData(socket: tls.TLSSocket): Buffer {
    const cert = socket.getPeerX509Certificate?.();
    if (!cert)
      throw new Error(
        'SASL: SCRAM-SHA-256-PLUS needs the server certificate, which this connection did not provide',
      );
    const der = cert.raw;
    return crypto
      .createHash(signatureHashOfCertificate(der))
      .update(der)
      .digest();
  }

  protected _handleParameterStatus(msg: Protocol.ParameterStatusMessage): void {
    this._sessionParameters[msg.name] = msg.value;
  }

  protected _handleNegotiateProtocolVersion(
    msg: Protocol.NegotiateProtocolVersionMessage,
  ): void {
    this._protocolNegotiation = msg;
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'PgSocket._handleNegotiateProtocolVersion',
        message:
          `server supports protocol 3.${msg.supportedVersionMinor}` +
          (msg.unrecognizedOptions.length
            ? `; did not recognize startup option(s): ${msg.unrecognizedOptions.join(', ')}`
            : ''),
        ...msg,
      });
    }
    /* c8 ignore stop */
  }

  protected _handleBackendKeyData(msg: Protocol.BackendKeyDataMessage): void {
    this._processID = msg.processID;
    this._secretKey = msg.secretKey;
  }

  protected _handleCommandComplete(msg: any): Protocol.CommandCompleteMessage {
    const m = msg.command && msg.command.match(COMMAND_RESULT_PATTERN);
    const result: Protocol.CommandCompleteMessage = {
      command: m[1],
    };
    if (m[3] != null) {
      result.oid = parseInt(m[2], 10);
      result.rowCount = parseInt(m[3], 10);
    } else if (m[2]) result.rowCount = parseInt(m[2], 10);
    return result;
  }

  /**
   * Queues `data` for the socket instead of writing it straight through:
   * everything handed to _send() during the same synchronous burst (e.g.
   * many concurrent query() calls fired via Promise.all over one
   * connection) is flushed together on the next tick, corked, so Node
   * turns the whole batch into a single underlying writev rather than one
   * socket write per call. Measured against postgres.js, which coalesces
   * the same way at the application level (its connection.js write()/
   * nextWrite() pair, flushing on a 1KB threshold or setImmediate): 50
   * concurrent prepared executes cost it 3 socket writes where this cost
   * us 50, and that write path was the single largest non-idle item in a
   * CPU profile of the scenario.
   *
   * nextTick rather than setImmediate, deliberately: it still batches a
   * whole synchronous burst, but a lone query doesn't have to wait for the
   * event loop's check phase before its bytes go out - which would trade
   * away the sequential/single-query scenarios to win the concurrent ones.
   *
   * Returns whether the socket could accept the data at all; the write
   * itself is reported through `cb` (and a socket that dies before the
   * flush rejects every pending capture via _failPendingCaptures()).
   */
  protected _send(data: Buffer | Buffer[], cb?: Callback): boolean {
    if (!this._socket || !this._socket.writable) return false;

    if (Array.isArray(data)) {
      const l = data.length;
      for (let i = 0; i < l; i++)
        this._pendingWrites.push({
          data: data[i],
          cb: i === l - 1 ? cb : undefined,
        });
    } else this._pendingWrites.push({ data, cb });
    if (this._captureQueue.length > 1) {
      if (!this._flushScheduled) {
        this._flushScheduled = true;
        process.nextTick(this._flushPendingWrites);
      }
    } else this._flushPendingWrites();
    return true;
  }

  /**
   * Writes COPY bytes straight through instead of queueing them for the
   * next tick like _send() does. Two reasons: during a copy the capture
   * queue holds exactly one entry (the Query that opened it), so _send()'s
   * "batch only when more than one request is in flight" test would never
   * fire and every chunk would be written on its own anyway; and the
   * caller needs write()'s own return value to know when to stop, which a
   * deferred write cannot give it.
   */
  protected _sendCopy(data: Buffer | Buffer[], cb?: Callback): boolean {
    const socket = this._socket;
    if (!socket || !socket.writable) return false;
    this._flushPendingWrites();
    if (!Array.isArray(data)) return socket.write(data, cb);
    socket.cork();
    try {
      const l = data.length;
      let writable = true;
      let i: number;
      for (i = 0; i < l; i++)
        writable = socket.write(data[i], i === l - 1 ? cb : undefined);
      return writable;
    } finally {
      socket.uncork();
    }
  }

  /** Arrow property, not a method: used as a bare process.nextTick callback. */
  private _flushPendingWrites = (): void => {
    this._flushScheduled = false;
    const pending = this._pendingWrites;
    if (!pending.length) return;
    this._pendingWrites = [];
    const socket = this._socket;
    if (!socket || !socket.writable) return;
    socket.cork();
    try {
      const l = pending.length;
      let i: number;
      for (i = 0; i < l; i++) {
        const { data, cb } = pending[i];
        socket.write(data, cb);
      }
    } finally {
      socket.uncork();
    }
  };
}
