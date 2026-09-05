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

/**
 * One outstanding request awaiting its (possibly multi-message) response.
 * The PostgreSQL wire protocol carries no request/response id - responses
 * arrive strictly in the order requests were sent - so this FIFO queue IS
 * the correlation mechanism: the head is always the oldest still-open
 * request, i.e. the one the next incoming message belongs to. Backed by a
 * doubly-linked list rather than an Array or Set: `head` is a plain O(1)
 * property read (Set.values().next() allocates a fresh iterator on every
 * call - measured ~4.7x slower here, since this is read once per incoming
 * message, not once per request), and shift()/push() are O(1) too (an
 * Array.shift() is O(n), only cheap for this at low queue depth).
 */
interface CaptureEntry {
  callback: CaptureCallback;
  resolve: (result: any) => void;
  reject: (err: Error) => void;
}

/**
 * There is no public `capture()` method - a caller could otherwise call it
 * independently of sending anything, attach to every message the socket
 * ever emits, and decide for itself when to stop, with nothing stopping two
 * callers from doing this concurrently and both receiving the same
 * messages. Here, capturing a response is only possible by sending a
 * message for it: send*Message() takes a mandatory CaptureCallback, pushes
 * it onto `_captureQueue` in the same call, and the socket dispatches each
 * incoming message to whichever capture is at the front of that queue.
 */
export class PgSocket extends SafeEventEmitter {
  private _state = ConnectionState.CLOSED;
  private _socket?: net.Socket;
  private _backend = new Backend();
  private _frontend: Frontend;
  private _sessionParameters: Record<string, string> = {};
  private _saslSession?: SASL.Session;
  private _processID?: number;
  private _secretKey?: number;
  private _captureQueue = new DoublyLinked<CaptureEntry>();
  // Outgoing messages queued by _send() but not yet handed to the socket -
  // see _send()/_flushPendingWrites() for why they're batched per tick
  // rather than written straight through.
  private _pendingWrites: { data: Buffer; cb?: Callback }[] = [];
  private _flushScheduled = false;

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

  get sessionParameters(): Record<string, string> {
    return this._sessionParameters;
  }

  connect() {
    if (this._socket) return;
    this._state = ConnectionState.CONNECTING;
    const options = this.options;
    const socket = (this._socket = new net.Socket());

    const errorHandler = (err: Error) => {
      this._state = ConnectionState.CLOSED;
      this._removeListeners();
      this._reset();
      socket.destroy();
      this._socket = undefined;
      this.emit('error', err);
    };

    const connectHandler = () => {
      socket.setTimeout(0);
      if (this.options.keepAlive || this.options.keepAlive == null)
        socket.setKeepAlive(true);
      socket.write(this._frontend.getSSLRequestMessage());
      socket.once('data', x => {
        this._removeListeners();
        const command = x.toString();
        if (command === 'S') {
          const tslOptions = { ...options.ssl, socket };
          if (options.host && net.isIP(options.host) === 0)
            tslOptions.servername = options.host;
          const tlsSocket = (this._socket = tls.connect(tslOptions));
          tlsSocket.once('error', errorHandler);
          tlsSocket.once('secureConnect', () => {
            this._removeListeners();
            this._handleConnect();
          });
          return;
        }
        if (command === 'N') {
          if (options.requireSSL) {
            return errorHandler(
              new Error('Server does not support SSL connections'),
            );
          }
          this._removeListeners();
          this._handleConnect();
          return;
        }
        return errorHandler(
          new Error('There was an error establishing an SSL connection'),
        );
      });
    };

    socket.setNoDelay(true);
    socket.setTimeout(options.connectTimeoutMs || 30000, () =>
      errorHandler(new Error('Connection timed out')),
    );
    socket.once('error', errorHandler);
    socket.once('connect', connectHandler);

    this.emit('connecting');
    const port = options.port || DEFAULT_PORT_NUMBER;
    if (options.host && options.host.startsWith('/')) {
      socket.connect(path.join(options.host, '/.s.PGSQL.' + port));
    } else
      socket.connect(
        options.port || DEFAULT_PORT_NUMBER,
        options.host || 'localhost',
      );
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

  sendParseMessage(
    args: Frontend.ParseMessageArgs,
    cb: CaptureCallback,
  ): Promise<any> {
    return this._sendAndCapture(
      this._frontend.getParseMessage(args),
      cb,
      'sendParseMessage',
      args,
    );
  }

  sendBindMessage(
    args: Frontend.BindMessageArgs,
    cb: CaptureCallback,
  ): Promise<any> {
    return this._sendAndCapture(
      this._frontend.getBindMessage(args),
      cb,
      'sendBindMessage',
      args,
    );
  }

  sendDescribeMessage(
    args: Frontend.DescribeMessageArgs,
    cb: CaptureCallback,
  ): Promise<any> {
    return this._sendAndCapture(
      this._frontend.getDescribeMessage(args),
      cb,
      'sendDescribeMessage',
      args,
    );
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
      }),
    );
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
              // Routed to whichever request is at the front of the FIFO
              // rather than treated as a connection-wide fatal error - only
              // the request that actually failed should reject, matching
              // how PostgreSQL itself scopes an ErrorResponse to the
              // message that produced it, not to the whole connection.
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
            case Protocol.BackendMessageCode.BackendKeyData:
              this._handleBackendKeyData(
                payload as Protocol.BackendKeyDataMessage,
              );
              break;
            case Protocol.BackendMessageCode.ReadyForQuery:
              if (this._state !== ConnectionState.READY) {
                this._state = ConnectionState.READY;
                this.emit('ready');
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
      // No public capture() exists to register one out of band, so this
      // can only mean a bug in this class's own send/dispatch bookkeeping.
      this.emit(
        'error',
        new Error(
          `PgSocket: received message code=${String(code)} with an empty capture queue`,
        ),
      );
      return;
    }
    const done = (err: Maybe<Error>, result?: any) => {
      // Guards a stale done() firing after _failPendingCaptures already
      // rejected and cleared this entry - that swap makes `head` a fresh,
      // empty list, so this entry can no longer be its head.
      if (this._captureQueue.head?.value !== entry) return;
      this._captureQueue.shift();
      if (err) entry.reject(err);
      else entry.resolve(result);
    };
    // A synchronous throw here must be converted to done(err) immediately,
    // before returning to Backend.parse()'s loop - if the callback were an
    // async function that threw instead, the throw would become a
    // *rejected promise* rather than propagating synchronously, and if
    // later messages for the same request (e.g. CommandComplete,
    // ReadyForQuery) arrive in the same data chunk, that synchronous loop
    // would resolve and dequeue this entry via done() before the deferred
    // .catch() microtask ever ran - silently swallowing the error instead
    // of rejecting the request. Callbacks passed in are plain functions
    // for exactly this reason; the isPromise branch below only exists to
    // not lose a rejection if a caller ever hands in a genuinely async one.
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
        if (!msg.mechanisms.includes('SCRAM-SHA-256')) {
          throw new Error(
            'SASL: Only mechanism SCRAM-SHA-256 is currently supported',
          );
        }
        const saslSession = (this._saslSession = SASL.createSession(
          this.options.user || '',
          'SCRAM-SHA-256',
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
        break;
    }
  }

  protected _handleParameterStatus(msg: Protocol.ParameterStatusMessage): void {
    this._sessionParameters[msg.name] = msg.value;
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

    // Batch only when there is actually something to batch with. A request
    // is pushed onto _captureQueue before its bytes reach here, so a depth
    // of 1 means this is the only one in flight - a strictly sequential
    // caller, awaiting each query before sending the next. Deferring that
    // write buys nothing (there is no second message coming this tick) and
    // measurably costs: it pushes the write past the current event-loop
    // turn, which on a sequential prepared-statement loop showed up as a
    // ~18% median regression and occasional ~2x runs. A depth above 1 means
    // other requests are already outstanding - a concurrent burst, where
    // the rest of this tick's messages are worth waiting for.
    if (this._captureQueue.length > 1) {
      if (!this._flushScheduled) {
        this._flushScheduled = true;
        process.nextTick(this._flushPendingWrites);
      }
    } else this._flushPendingWrites();
    return true;
  }

  /** Arrow property, not a method: used as a bare process.nextTick callback. */
  private _flushPendingWrites = (): void => {
    this._flushScheduled = false;
    const pending = this._pendingWrites;
    if (!pending.length) return;
    this._pendingWrites = [];
    const socket = this._socket;
    // A socket that went away between queueing and here takes the pending
    // captures with it (_handleClose/_handleError -> _failPendingCaptures),
    // so dropping these bytes doesn't strand a caller.
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
