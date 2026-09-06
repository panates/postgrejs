import { coerceToBoolean } from 'putil-varhelpers';
import { ConnectionState, DataTypeOIDs } from '../constants.js';
import { GlobalTypeMap } from '../data-type-map.js';
import type { ConnectionConfiguration } from '../interfaces/database-connection-params.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import type { QueryResult } from '../interfaces/query-result.js';
import type { ScriptExecuteOptions } from '../interfaces/script-execute-options.js';
import type { ScriptResult } from '../interfaces/script-result.js';
import type { StatementPrepareOptions } from '../interfaces/statement-prepare-options.js';
import type { DatabaseError } from '../protocol/database-error.js';
import type { Protocol } from '../protocol/protocol.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import type { Maybe, OID } from '../types.js';
import { withAbortSignal } from '../util/abort-signal.js';
import { QueryRequest } from '../util/sql-tag.js';
import { BindParam } from './bind-param.js';
import type { CopyFromStream, CopyToStream } from './copy-stream.js';
import { IntlConnection } from './intl-connection.js';
import { LargeObject, LargeObjectMode } from './large-object.js';
import type { Pool } from './pool.js';
import { PreparedStatement } from './prepared-statement.js';

export type NotificationMessage = Protocol.NotificationResponseMessage;
export type NotificationCallback = (msg: NotificationMessage) => any;

const CAPTURE_STACK_TRACE_LIMIT = 5;

export class Connection extends SafeEventEmitter implements AsyncDisposable {
  protected _pool?: Pool;
  protected _intlCon: IntlConnection;
  protected _notificationListeners?: SafeEventEmitter;
  protected _closing = false;

  constructor(pool: Pool, intlCon: IntlConnection);
  constructor(config?: ConnectionConfiguration | string);
  constructor(arg0: any, arg1?: any) {
    super();
    if (
      arg0 &&
      typeof arg0 === 'object' &&
      typeof arg0.acquire === 'function'
    ) {
      this._pool = arg0;
      this._intlCon = arg1;
    } else {
      this._intlCon = new IntlConnection(arg0);
    }
    this._intlCon.owner = this;
  }

  /**
   * Returns configuration object
   */
  get config(): ConnectionConfiguration {
    return this._intlCon.config;
  }

  /**
   * Returns true if the connection is in a transaction
   */
  get inTransaction(): boolean {
    return this._intlCon.inTransaction;
  }

  /**
   * Returns the current state of the connection
   */
  get state(): ConnectionState {
    return this._intlCon.state;
  }

  /**
   * Returns processId of the current session
   */
  get processID(): Maybe<number> {
    return this._intlCon.processID;
  }

  /**
   * Returns information parameters for the current session
   */
  get sessionParameters(): Record<string, string> {
    return this._intlCon.sessionParameters;
  }

  /**
   * Returns the secret key of the current session
   */
  get secretKey(): Maybe<number> {
    return this._intlCon.secretKey;
  }

  get runningQueryCount(): number {
    return this._intlCon.runningQueryCount;
  }

  /**
   * Connects to the server
   */
  async connect(): Promise<void> {
    await this._captureErrorStack(this._intlCon.connect());
    if (this.state === ConnectionState.READY) this._closing = false;
  }

  /**
   * Closes connection. You can define how long time the connection will
   * wait for active queries before terminating the connection.
   * At the end of the given time, it forces to close the socket and then emits the ` terminate ` event.
   *
   * @param terminateWait {number} - Determines how long the connection will wait for active queries before terminating.
   */
  async close(terminateWait?: number): Promise<void> {
    this._notificationListeners?.removeAllListeners();
    if (this.state === ConnectionState.CLOSED || this._closing) return;
    /* istanbul ignore next */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.close',
        connection: this,
        message: `[${this.processID}] closing`,
      });
    }

    this._closing = true;
    if (
      this._intlCon.refCount > 0 &&
      typeof terminateWait === 'number' &&
      terminateWait > 0
    ) {
      const startTime = Date.now();
      return this._captureErrorStack(
        new Promise((resolve, reject) => {
          /* istanbul ignore next */
          if (this.listenerCount('debug')) {
            this.emit('debug', {
              location: 'Connection.close',
              connection: this,
              message: `[${this.processID}] waiting active queries`,
            });
          }
          const timer = setInterval(() => {
            if (
              this._intlCon.refCount <= 0 ||
              Date.now() > startTime + terminateWait
            ) {
              clearInterval(timer);
              if (this._intlCon.refCount > 0) {
                /* istanbul ignore next */
                if (this.listenerCount('debug')) {
                  this.emit('debug', {
                    location: 'Connection.close',
                    connection: this,
                    message: `[${this.processID}] terminate`,
                  });
                }
                this.emit('terminate');
              }
              this._close().then(resolve).catch(reject);
            }
          }, 50);
        }),
      );
    }
    await this._close();
  }

  /**
   * Executes single or multiple SQL scripts using Simple Query protocol.
   *
   * @param sql {string} - SQL script that will be executed
   * @param options {ScriptExecuteOptions} - Execute options
   */
  async execute(
    sql: string | QueryRequest,
    options?: ScriptExecuteOptions,
  ): Promise<ScriptResult> {
    if (typeof sql === 'object' && sql instanceof QueryRequest)
      sql = sql.stringify({ ...options, typeMap: options?.typeMap });
    this.emit('execute', sql, options);
    return withAbortSignal(
      options?.signal,
      () => this._intlCon.cancel(),
      () =>
        this._captureErrorStack(
          this._intlCon.execute(sql, options),
          this.execute,
          options?.asyncErrorHandling,
        ).catch((e: DatabaseError) => {
          throw this._handleError(e, sql);
        }),
    );
  }

  async query(
    sql: string | QueryRequest,
    options?: QueryOptions,
  ): Promise<QueryResult> {
    if (sql instanceof QueryRequest) {
      if (options?.params)
        throw new TypeError(
          'A statement built with sql`` carries its own parameters; passing `params` as well is ambiguous',
        );
      options = { ...options, params: sql.params };
      sql = sql.sql;
    }
    this._intlCon.assertConnected();
    /* istanbul ignore next */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.query',
        connection: this,
        message: `[${this.processID}] query | ${sql}`,
        sql,
      });
    }
    this.emit('query', sql, options);
    return withAbortSignal(
      options?.signal,
      () => this._intlCon.cancel(),
      () => this._query(sql, options),
    );
  }

  /**
   * Runs a `COPY ... TO STDOUT` and returns its output as a stream of the
   * raw bytes the server sends - text, CSV or binary, whichever the
   * statement asked for. Nothing is decoded and nothing is copied.
   *
   * Resolves as soon as the server accepts the copy, so a large export is
   * never held in memory; a consumer that falls behind pauses the socket
   * rather than buffering. `rowCount` is set before the stream ends.
   *
   * ```ts
   * const out = await connection.copyTo(`COPY users TO STDOUT (FORMAT csv)`);
   * await pipeline(out, fs.createWriteStream('users.csv'));
   * console.log(out.rowCount);
   * ```
   *
   * The stream must be consumed or destroyed: until the copy finishes the
   * connection is still mid-statement.
   *
   * @param sql {string} - A COPY ... TO STDOUT statement
   */
  async copyTo(sql: string): Promise<CopyToStream> {
    /* istanbul ignore next */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.copyTo',
        connection: this,
        message: `[${this.processID}] copyTo | ${sql}`,
        sql,
      });
    }
    this.emit('execute', sql);
    return await this._captureErrorStack(this._intlCon.copyTo(sql)).catch(
      (e: DatabaseError) => {
        throw this._handleError(e, sql);
      },
    );
  }

  /**
   * Runs a `COPY ... FROM STDIN` and returns a stream to feed it. Whatever
   * is written is forwarded verbatim, so the statement's own FORMAT decides
   * the encoding.
   *
   * ```ts
   * const inp = await connection.copyFrom(`COPY users FROM STDIN (FORMAT csv)`);
   * await pipeline(fs.createReadStream('users.csv'), inp);
   * console.log(inp.rowCount);
   * ```
   *
   * 'finish' means the server accepted the copy, not merely that the last
   * byte was written. If the source fails, `pipeline()` destroys the stream
   * and a CopyFail is sent, so the connection stays usable.
   *
   * @param sql {string} - A COPY ... FROM STDIN statement
   */
  async copyFrom(sql: string): Promise<CopyFromStream> {
    /* istanbul ignore next */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.copyFrom',
        connection: this,
        message: `[${this.processID}] copyFrom | ${sql}`,
        sql,
      });
    }
    this.emit('execute', sql);
    return await this._captureErrorStack(this._intlCon.copyFrom(sql)).catch(
      (e: DatabaseError) => {
        throw this._handleError(e, sql);
      },
    );
  }

  /**
   * Creates a PreparedStatement instance
   * @param sql {string} - SQL script that will be executed
   * @param options {StatementPrepareOptions} - Options
   */
  async prepare(
    sql: string,
    options?: StatementPrepareOptions,
  ): Promise<PreparedStatement> {
    /* istanbul ignore next */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.prepare',
        connection: this,
        message: `[${this.processID}] prepare | ${sql}`,
        sql,
      });
    }
    return await this._captureErrorStack(
      PreparedStatement.prepare(this, sql, options),
    );
  }

  /**
   * Creates a large object and opens it for reading and writing.
   *
   * A large object holds binary data outside any row, reachable a piece at
   * a time instead of whole the way a `bytea` column is - which is what it
   * is for, along with a 4TB ceiling rather than roughly 1GB.
   *
   * ```ts
   * const lo = await connection.createLargeObject();
   * await pipeline(fs.createReadStream('video.mp4'), lo.writable());
   * await lo.close();
   * await table.insert({ videoOid: lo.oid });
   * ```
   *
   * Nothing links the object to the row that names it: dropping the row
   * leaves the data behind, so unlinkLargeObject() has to be called when it
   * is no longer wanted. PostgreSQL ships `vacuumlo` for finding the ones
   * that were not.
   */
  async createLargeObject(
    mode = LargeObjectMode.readWrite,
  ): Promise<LargeObject> {
    const ownsTransaction = await this._beginForLargeObject();
    const created = await this.query('select lo_creat(-1) as oid');
    const oid = Number(created.rows?.[0][0]);
    return this._openLargeObject(oid, mode, ownsTransaction);
  }

  /**
   * Opens an existing large object by its OID. See createLargeObject() for
   * how the transaction is handled.
   */
  async openLargeObject(
    oid: number,
    mode = LargeObjectMode.read,
  ): Promise<LargeObject> {
    const ownsTransaction = await this._beginForLargeObject();
    return this._openLargeObject(oid, mode, ownsTransaction);
  }

  /** Deletes a large object and its data. */
  async unlinkLargeObject(oid: number): Promise<void> {
    await this.query('select lo_unlink($1)', {
      params: [new BindParam(DataTypeOIDs.oid, oid)],
    });
  }

  /**
   * Asks the server to cancel whatever this connection is currently running.
   *
   * Travels on its own short-lived connection, since a backend busy with a
   * query is not reading its own socket. It is a request, not a guarantee -
   * the statement may finish first - and the cancelled call reports the
   * outcome itself, rejecting with SQLSTATE 57014 if the server acted on it.
   * Prefer the per-call `signal` option, which does this and reports the
   * abort to the right caller.
   */
  cancel(): Promise<void> {
    return this._intlCon.cancel();
  }

  /**
   * Starts a transaction
   */
  startTransaction(): Promise<void> {
    return this._captureErrorStack(this._intlCon.startTransaction());
  }

  /**
   * Commits current transaction
   */
  commit(): Promise<void> {
    return this._captureErrorStack(this._intlCon.commit());
  }

  /**
   * Rolls back current transaction
   */
  rollback(): Promise<void> {
    return this._captureErrorStack(this._intlCon.rollback());
  }

  /**
   * Ends the current transaction as a prepared one, for two-phase commit.
   *
   * The transaction stops belonging to this session and waits under `name`
   * until it is finished by commitPrepared() or rollbackPrepared() - which
   * may run on another connection, in another process, after this one is
   * gone. That is the point: it lets several databases agree to commit
   * before any of them actually does.
   *
   * ```ts
   * await connection.startTransaction();
   * await connection.query(sql`insert into t values (${1})`);
   * await connection.prepareTransaction('tx1');
   * // ...later, anywhere:
   * await other.commitPrepared('tx1');
   * ```
   *
   * PostgreSQL ships with `max_prepared_transactions` at zero, so this
   * fails until the server is configured for it.
   */
  prepareTransaction(name: string): Promise<void> {
    return this._captureErrorStack(this._intlCon.prepareTransaction(name));
  }

  /**
   * Commits a transaction left waiting by prepareTransaction(), by name.
   * Runs outside any transaction and needs no connection to the session
   * that prepared it.
   */
  commitPrepared(name: string): Promise<void> {
    return this._captureErrorStack(this._intlCon.commitPrepared(name));
  }

  /** Discards a transaction left waiting by prepareTransaction(), by name. */
  rollbackPrepared(name: string): Promise<void> {
    return this._captureErrorStack(this._intlCon.rollbackPrepared(name));
  }

  /**
   * Starts transaction and creates a savepoint
   * @param name {string} - Name of the savepoint
   */
  async savepoint(name: string): Promise<void> {
    if (!this._intlCon.inTransaction) await this._intlCon.startTransaction();
    return this._captureErrorStack(this._intlCon.savepoint(name));
  }

  /**
   * Rolls back the current transaction to given savepoint
   * @param name {string} - Name of the savepoint
   */
  rollbackToSavepoint(name: string): Promise<void> {
    return this._captureErrorStack(this._intlCon.rollbackToSavepoint(name));
  }

  /**
   * Releases savepoint
   * @param name {string} - Name of the savepoint
   */
  releaseSavepoint(name: string): Promise<void> {
    return this._captureErrorStack(this._intlCon.releaseSavepoint(name));
  }

  async listen(channel: string, callback: NotificationCallback) {
    if (!/^[A-Z]\w+$/i.test(channel))
      throw new TypeError(`Invalid channel name`);
    if (!this._notificationListeners) {
      this._notificationListeners = new SafeEventEmitter();
      this._intlCon.on('notification', (msg: NotificationMessage) =>
        this._handleNotification(msg),
      );
    }
    const registered = !!this._notificationListeners?.eventNames().length;
    this._notificationListeners.on(channel, callback);
    if (!registered)
      await this._captureErrorStack(this.query('LISTEN ' + channel));
  }

  async unListen(channel: string) {
    if (!/^[A-Z]\w+$/i.test(channel))
      throw new TypeError(`Invalid channel name`);
    if (this._notificationListeners?.listenerCount(channel)) {
      this._notificationListeners?.removeAllListeners(channel);
      await this._captureErrorStack(this.query('UNLISTEN ' + channel));
    }
  }

  async unListenAll() {
    if (this._notificationListeners?.eventNames().length) {
      this._notificationListeners.removeAllListeners();
      await this._captureErrorStack(this.query('UNLISTEN *'));
    }
  }

  protected async _query(
    sql: string,
    options?: QueryOptions,
  ): Promise<QueryResult> {
    const typeMap = options?.typeMap || GlobalTypeMap;
    const paramTypes: Maybe<OID[]> = options?.params?.map(prm =>
      prm instanceof BindParam ? prm.oid : typeMap.determine(prm),
    );

    const effectiveAutoCommit =
      options?.autoCommit != null
        ? options.autoCommit
        : this._intlCon.config.autoCommit;
    if (
      !options?.cursor &&
      !this._intlCon.inTransaction &&
      effectiveAutoCommit !== false
    ) {
      const params: Maybe<Maybe<OID>[]> = options?.params?.map(prm =>
        prm instanceof BindParam ? prm.value : prm,
      );
      return await this._captureErrorStack(
        this._intlCon.queryOnce(sql, paramTypes, params, options || {}),
        this.query,
        options?.asyncErrorHandling,
      ).catch((e: DatabaseError) => {
        throw this._handleError(e, sql);
      });
    }

    const statement = await this.prepare(sql, { paramTypes, typeMap }).catch(
      (e: DatabaseError) => {
        throw this._handleError(e, sql);
      },
    );
    try {
      const params: Maybe<Maybe<OID>[]> = options?.params?.map(prm =>
        prm instanceof BindParam ? prm.value : prm,
      );
      return await this._captureErrorStack(
        statement.execute({ ...options, params }),
        this.query,
        options?.asyncErrorHandling,
      );
    } finally {
      await statement.close();
    }
  }

  /**
   * A large object's descriptor is only valid inside the transaction that
   * opened it. One is started here when there is none, and reported so that
   * close() commits only what it started - a transaction the caller opened
   * stays theirs. Mirrors what savepoint() already does.
   */
  protected async _beginForLargeObject(): Promise<boolean> {
    if (this.inTransaction) return false;
    await this.startTransaction();
    return true;
  }

  protected async _openLargeObject(
    oid: number,
    mode: number,
    ownsTransaction: boolean,
  ): Promise<LargeObject> {
    const opened = await this.query('select lo_open($1, $2) as fd', {
      params: [
        new BindParam(DataTypeOIDs.oid, oid),
        new BindParam(DataTypeOIDs.int4, mode),
      ],
    });
    return new LargeObject(
      this,
      oid,
      Number(opened.rows?.[0][0]),
      ownsTransaction,
    );
  }

  protected _handleNotification(msg: NotificationMessage) {
    this.emit('notification', msg);
    this._notificationListeners?.emit(msg.channel, msg);
  }

  protected async _close(): Promise<void> {
    if (this._notificationListeners?.eventNames().length)
      await this.unListenAll();
    if (this.inTransaction) await this.rollback();
    if (this._pool) {
      await this._captureErrorStack(this._pool.release(this));
      this.emit('release');
    } else await this._captureErrorStack(this._intlCon.close());
    this._closing = false;
  }

  protected _handleError(err: DatabaseError, script: string): DatabaseError {
    if (err.position != null) {
      const i1 = script.lastIndexOf('\n', err.position - 1) + 1;
      err.lineNr = [...script.substring(0, i1).matchAll(/\n/g)].length + 1;
      err.colNr = err.position - i1;
      const lines = script.split('\n');
      err.line = lines[err.lineNr - 1];
      err.message += `\n    at line ${err.lineNr} column ${err.colNr}`;
      if (err.lineNr > 1)
        err.message += `\n${String(err.lineNr - 1).padStart(3)}| ${lines[err.lineNr - 2]}`;
      err.message += `\n${String(err.lineNr).padStart(3)}| ${err.line}\n    .${'-'.repeat(Math.max(err.colNr - 1, 0))}^`;
    }
    return err;
  }

  /**
   * Remembers where a call came from, so the error it may reject with points
   * at the caller instead of at an internal async frame.
   *
   * `entry` is the public method to cut the trace at: everything from it
   * inwards is this library's own plumbing and is dropped, which matters
   * because the captured depth is deliberately small - spending four of five
   * frames on our own call chain would leave one for the caller, and any
   * helper of theirs would push the real call site off the end.
   *
   * Skippable via `asyncErrorHandling: false` - capturing costs a real,
   * measurable slice of CPU time once many calls are in flight at once
   * (a pipelined burst on one connection), where it has to compete with
   * every other call for the same core instead of hiding behind network
   * wait the way it does for a single sequential call.
   *
   * `asyncErrorHandling` is the per-call override (execute()/query()'s own
   * option of the same name); when omitted, the connection's own
   * `DatabaseConnectionParams.asyncErrorHandling` decides.
   */
  protected async _captureErrorStack<T>(
    promise: Promise<T>,
    entry?: (...args: any[]) => any,
    asyncErrorHandling?: boolean,
  ): Promise<T> {
    const enabled =
      asyncErrorHandling != null
        ? asyncErrorHandling
        : coerceToBoolean(this._intlCon.config.asyncErrorHandling, true);
    if (!enabled) return promise;
    const stackHolder: { stack?: string } = {};
    const originalStackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = CAPTURE_STACK_TRACE_LIMIT;
    Error.captureStackTrace(stackHolder, entry || this._captureErrorStack);
    Error.stackTraceLimit = originalStackTraceLimit;

    return promise.catch(e => {
      const stack = stackHolder.stack;
      if (e instanceof Error && stack) {
        if (e.stack && stack) {
          e.stack =
            e.stack.substring(0, e.stack.indexOf('\n')) +
            '\n' +
            stack.split('\n').slice(1).join('\n');
        }
      }
      throw e;
    });
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
