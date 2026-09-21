import { ConnectionState, DataTypeOIDs } from '../constants.js';
import { GlobalTypeMap } from '../data-type-map.js';
import type {
  CopyFromRowsOptions,
  CopyFromRowsResult,
} from '../interfaces/copy-from-rows-options.js';
import type { ConnectionConfiguration } from '../interfaces/database-connection-params.js';
import type { FunctionCallOptions } from '../interfaces/function-call-options.js';
import type { FunctionCallResult } from '../interfaces/function-call-result.js';
import type { PipelineRequest } from '../interfaces/pipeline-request.js';
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
import { normalizeChannelName } from '../util/channel-name.js';
import type { CopyRowSource } from '../util/copy-from-rows.js';
import { escapeIdentifier } from '../util/escape-identifier.js';
import { QueryRequest } from '../util/sql-tag.js';
import { isUnspecifiedParam } from '../util/unspecified-param.js';
import { BindParam } from './bind-param.js';
import type { CopyFromStream, CopyToStream } from './copy-stream.js';
import { IntlConnection } from './intl-connection.js';
import { LargeObject, LargeObjectMode } from './large-object.js';
import type { Pool } from './pool.js';
import { PreparedStatement } from './prepared-statement.js';

export type NotificationMessage = Protocol.NotificationResponseMessage;
export type NotificationCallback = (msg: NotificationMessage) => any;

const CAPTURE_STACK_TRACE_LIMIT = 5;

/** Names the savepoint a nested transaction() scope takes. */
let transactionScopeCounter = 0;

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
   * The server's NegotiateProtocolVersion reply, if it sent one during
   * connect() - undefined means the server fully recognized everything
   * this client's startup packet asked for (protocol minor version, any
   * `_pq_.*` options). Present only when the server is older/stricter
   * than what was requested, or didn't recognize one of the options -
   * check it after connect() if a feature gated behind such an option
   * doesn't seem to have taken effect.
   */
  get protocolNegotiation(): Maybe<Protocol.NegotiateProtocolVersionMessage> {
    return this._intlCon.protocolNegotiation;
  }

  /**
   * Returns the secret key of the current session
   */
  get secretKey(): Maybe<Buffer> {
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
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.close',
        connection: this,
        message: `[${this.processID}] closing`,
      });
    }
    /* c8 ignore stop */

    this._closing = true;
    if (
      this._intlCon.refCount > 0 &&
      typeof terminateWait === 'number' &&
      terminateWait > 0
    ) {
      const startTime = Date.now();
      return this._captureErrorStack(
        new Promise((resolve, reject) => {
          /* c8 ignore start */
          if (this.listenerCount('debug')) {
            this.emit('debug', {
              location: 'Connection.close',
              connection: this,
              message: `[${this.processID}] waiting active queries`,
            });
          }
          /* c8 ignore stop */
          const timer = setInterval(() => {
            if (
              this._intlCon.refCount <= 0 ||
              Date.now() > startTime + terminateWait
            ) {
              clearInterval(timer);
              if (this._intlCon.refCount > 0) {
                /* c8 ignore start */
                if (this.listenerCount('debug')) {
                  this.emit('debug', {
                    location: 'Connection.close',
                    connection: this,
                    message: `[${this.processID}] terminate`,
                  });
                }
                /* c8 ignore stop */
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
    if (this.listenerCount('execute')) this.emit('execute', sql, options);
    let release = this._intlCon.enterWire(this._isExclusive(options?.pipeline));
    if (typeof release !== 'function') release = await release;
    try {
      return await withAbortSignal(
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
    } finally {
      release();
    }
  }

  /**
   * The legacy Function Call sub-protocol - calls a function by OID
   * directly, bypassing SQL entirely. Superseded by `SELECT func(...)`
   * over the Simple/Extended Query protocols (what `execute()`/`query()`
   * use, and what every current PostgreSQL client uses exclusively) -
   * kept only for wire-protocol completeness. Arguments and the result
   * travel as raw wire-format bytes, not JS values: the caller is
   * responsible for encoding/decoding them (see a `DataType`'s own
   * `encodeBinary`/`decodeBinary` for the format a given OID expects).
   *
   * @param functionId - OID of the function to call
   * @param args - Each argument's own already-encoded wire bytes, or
   *   `null` for SQL NULL
   */
  callFunction(
    functionId: OID,
    args: Maybe<Buffer>[],
    options?: FunctionCallOptions & { signal?: AbortSignal },
  ): Promise<FunctionCallResult> {
    return withAbortSignal(
      options?.signal,
      () => this._intlCon.cancel(),
      () =>
        this._captureErrorStack(
          this._intlCon.callFunction(functionId, args, options),
          this.callFunction,
        ),
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
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.query',
        connection: this,
        message: `[${this.processID}] query | ${sql}`,
        sql,
      });
    }
    /* c8 ignore stop */
    if (this.listenerCount('query')) this.emit('query', sql, options);
    let release = this._intlCon.enterWire(this._isExclusive(options?.pipeline));
    if (typeof release !== 'function') release = await release;
    try {
      return await withAbortSignal(
        options?.signal,
        () => this._intlCon.cancel(),
        () => this._query(sql, options),
      );
    } finally {
      release();
    }
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
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.copyTo',
        connection: this,
        message: `[${this.processID}] copyTo | ${sql}`,
        sql,
      });
    }
    /* c8 ignore stop */
    if (this.listenerCount('execute')) this.emit('execute', sql);
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
  /**
   * Bulk-loads rows into a table with `COPY ... FROM STDIN (FORMAT binary)`,
   * encoding every value with its own type's binary encoder instead of
   * making the caller format a text payload.
   *
   * ```ts
   * const { rowCount } = await connection.copyFromRows('users', [
   *   [1, 'John', 10.5],
   *   [2, 'Jane', 20.0],
   * ], { columns: ['id', 'name', 'amount'] });
   * ```
   *
   * Rows may be positional arrays or objects read by column name, and the
   * source may be anything iterable - including an async iterable or a
   * Readable, so a file far larger than memory streams straight in:
   *
   * ```ts
   * await connection.copyFromRows('users', (async function* () {
   *   for await (const { value } of jsonRows) yield [value.id, value.name];
   * })(), { columns: ['id', 'name'] });
   * ```
   *
   * Rows are pulled rather than pushed, so the source only produces the
   * next row once the previous chunk has reached the socket - backpressure
   * is the loop pausing, not a queue growing.
   *
   * Binary is both faster and cheaper to produce than text: 200,000 rows of
   * int4/text/float8/timestamptz measured 232ms against 483ms for the
   * equivalent CSV `copyFrom()`, client-side encoding included, because
   * writing an int32 costs less than formatting a decimal string.
   *
   * Column types are read from the server (one Describe round trip) unless
   * `columnTypes` supplies them. They have to be exact - binary COPY does
   * no conversion - which is also why a column whose type has no binary
   * encoder is rejected before any row is sent rather than mid-stream.
   *
   * `copyFrom()` remains the way to send an already-formatted text or CSV
   * payload.
   *
   * A value the column's type cannot encode - `'abc'` for an integer
   * column - aborts the copy by default, naming the row and column;
   * `onInvalidValue` can instead null the value or drop the row, and the
   * result says how many that happened to. NaN and Infinity in a float or
   * numeric column are not invalid: PostgreSQL stores them as values
   * distinct from NULL, so they go through untouched.
   *
   * @returns Rows sent, plus what a tolerant `onInvalidValue` swallowed.
   */
  /**
   * Runs several different statements in one round trip: every
   * Parse/Bind/Describe/Execute goes out before any response is waited
   * for, and a single Sync closes the lot.
   *
   * ```ts
   * const [renamed, , total] = await connection.pipeline([
   *   sql`update users set name = ${name} where id = ${id}`,
   *   sql`insert into audit(msg) values (${msg})`,
   *   sql`select count(*)::int as n from users`,
   * ]);
   * renamed.rowsAffected;  // 1
   * total.rows?.[0];       // [42]
   * ```
   *
   * The counterpart to `PreparedStatement.executeBatch()`, which runs one
   * statement over many parameter sets; this runs many statements once
   * each. Twenty statements measured 2.3ms against 5.0ms for the same
   * calls through `Promise.all()`, which PostgreJS already pipelines -
   * what the single Sync removes is the server finishing an implicit
   * transaction and answering ReadyForQuery twenty times over, which is
   * why socket reads drop from twenty to one.
   *
   * Three things follow from that framing rather than from choices made
   * above it:
   *
   * - **One transaction.** Unless an explicit transaction is already open,
   *   the statements commit or roll back together.
   * - **A failing statement stops the rest.** PostgreSQL discards
   *   everything between an error and the Sync, so statements after a
   *   rejected one never run. The error carries `failedIndex`.
   * - **No statement can see another's results.** They are all sent before
   *   any reply arrives, so anything conditional on an earlier result
   *   belongs in a separate call rather than here.
   *
   * Results map to statements by position. Statements that return rows get
   * them decoded as `query()` would, `rowDecoder` included; `fetchCount`
   * does not apply, since a portal suspended mid-pipeline would break that
   * mapping.
   *
   * @param requests Statements to run, as `sql` tag output, plain SQL
   *   strings, or `{ sql, params }` objects.
   * @param options Applied to every statement.
   */
  async pipeline(
    requests: (string | QueryRequest | PipelineRequest)[],
    options: QueryOptions = {},
  ): Promise<QueryResult[]> {
    if (!Array.isArray(requests))
      throw new TypeError('pipeline() requires an array of statements');
    if (options.cursor)
      throw new Error(
        'pipeline() cannot return a cursor - every statement runs to ' +
          'completion under one Sync, so there is no portal left to fetch from',
      );
    if (!requests.length) return [];
    const normalized = requests.map(r =>
      typeof r === 'string' ? { sql: r } : { sql: r.sql, params: r.params },
    );
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.pipeline',
        connection: this,
        message: `[${this.processID}] pipeline | ${normalized.length} statements`,
      });
    }
    /* c8 ignore stop */
    return await this._captureErrorStack(
      this._intlCon.executePipeline(normalized, options),
    ).catch((e: DatabaseError) => {
      // Name the statement the server actually rejected, not the first
      // one - the error is otherwise attributed to whichever SQL happens
      // to be handy, which in a pipeline is the wrong statement.
      const i = e.failedIndex;
      throw this._handleError(
        e,
        i != null && normalized[i] ? normalized[i].sql : normalized[0].sql,
      );
    });
  }

  async copyFromRows(
    table: string,
    source: CopyRowSource,
    options?: CopyFromRowsOptions,
  ): Promise<CopyFromRowsResult> {
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.copyFromRows',
        connection: this,
        message: `[${this.processID}] copyFromRows | ${table}`,
        table,
      });
    }
    /* c8 ignore stop */
    return await this._captureErrorStack(
      this._intlCon.copyFromRows(table, source, options),
    ).catch((e: DatabaseError) => {
      throw this._handleError(e, `COPY ${table} FROM STDIN (FORMAT binary)`);
    });
  }

  async copyFrom(sql: string): Promise<CopyFromStream> {
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.copyFrom',
        connection: this,
        message: `[${this.processID}] copyFrom | ${sql}`,
        sql,
      });
    }
    /* c8 ignore stop */
    if (this.listenerCount('execute')) this.emit('execute', sql);
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
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Connection.prepare',
        connection: this,
        message: `[${this.processID}] prepare | ${sql}`,
        sql,
      });
    }
    /* c8 ignore stop */
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
   * Runs `fn` inside a transaction and commits when it returns, or rolls
   * back and rethrows when it throws - the try/catch every caller of
   * startTransaction()/commit()/rollback() ends up writing by hand.
   *
   * ```ts
   * const id = await connection.transaction(async tx => {
   *   const r = await tx.query(
   *     'insert into orders (total) values ($1) returning id',
   *     { params: [total] },
   *   );
   *   await tx.query('update stock set n = n - 1 where sku = $1', {
   *     params: [sku],
   *   });
   *   return r.rows![0][0];
   * });
   * ```
   *
   * A call made while a transaction is already open becomes a savepoint
   * rather than a second BEGIN, so an inner scope that fails rolls back
   * its own work and leaves the outer transaction to decide what to do -
   * instead of taking everything down with it, which is what a shared
   * BEGIN/ROLLBACK pair would do.
   *
   * `fn` is handed this same connection: every statement it runs on it is
   * inside the transaction, and one it runs on another connection is not.
   */
  async transaction<T>(fn: (connection: this) => Promise<T>): Promise<T> {
    if (this._intlCon.inTransaction) return await this._savepointScope(fn);
    await this.startTransaction();
    try {
      const result = await fn(this);
      await this.commit();
      return result;
    } catch (e) {
      // A rollback that fails in turn must not replace the error that
      // caused it: the connection is already in trouble, and the original
      // is what the caller needs to see.
      await this.rollback().catch(() => undefined);
      throw e;
    }
  }

  /**
   * Commits current transaction.
   * @param immediate - Commits right away, ignoring how many nested
   *   startTransaction() calls are still unmatched by a commit().
   */
  commit(immediate?: boolean): Promise<void> {
    return this._captureErrorStack(this._intlCon.commit(immediate));
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
   * @param immediate - Releases right away, ignoring how many nested
   *   savepoint() calls under this name are still unmatched by a
   *   releaseSavepoint().
   */
  releaseSavepoint(name: string, immediate?: boolean): Promise<void> {
    return this._captureErrorStack(
      this._intlCon.releaseSavepoint(name, immediate),
    );
  }

  async listen(channel: string, callback: NotificationCallback) {
    channel = normalizeChannelName(channel);
    if (!this._notificationListeners) {
      this._notificationListeners = new SafeEventEmitter();
      this._intlCon.on('notification', (msg: NotificationMessage) =>
        this._handleNotification(msg),
      );
    }
    // Bug: this used to check whether ANY channel already had a listener,
    // not this one specifically - so a second, different channel added
    // after the first never got its own LISTEN sent at all, and never
    // received a notification for it (verified live: only the first
    // channel ever showed up in pg_stat_activity's query text).
    const alreadyListening =
      !!this._notificationListeners.listenerCount(channel);
    this._notificationListeners.on(channel, callback);
    if (!alreadyListening)
      await this._captureErrorStack(
        this.query('LISTEN ' + escapeIdentifier(channel)),
      );
  }

  async unListen(channel: string) {
    channel = normalizeChannelName(channel);
    if (this._notificationListeners?.listenerCount(channel)) {
      this._notificationListeners?.removeAllListeners(channel);
      await this._captureErrorStack(
        this.query('UNLISTEN ' + escapeIdentifier(channel)),
      );
    }
  }

  async unListenAll() {
    if (this._notificationListeners?.eventNames().length) {
      this._notificationListeners.removeAllListeners();
      await this._captureErrorStack(this.query('UNLISTEN *'));
    }
  }

  /**
   * Whether a statement asked for the wire to itself - `pipeline: false`
   * on the call, or on the connection when the call says nothing.
   */
  protected _isExclusive(pipeline: Maybe<boolean>): boolean {
    return pipeline != null
      ? !pipeline
      : this._intlCon.config.pipeline === false;
  }

  protected async _query(
    sql: string,
    options?: QueryOptions,
  ): Promise<QueryResult> {
    const typeMap = options?.typeMap || GlobalTypeMap;
    const paramTypes: Maybe<OID[]> = options?.params?.map(prm =>
      prm instanceof BindParam
        ? prm.oid
        : // A Date and a string go out with no declared type, so the
          // server resolves each from where it lands - neither can say
          // what it is, and naming a type for them is what made a `Date`
          // move by the client's offset and a string unusable anywhere a
          // `varchar` is not what the context wanted. See
          // `isUnspecifiedParam()` for what that costs. The text they go
          // out as is written in getBindMessage().
          isUnspecifiedParam(prm)
          ? 0
          : typeMap.determine(prm),
    );

    const effectiveAutoCommit =
      options?.autoCommit != null
        ? options.autoCommit
        : this._intlCon.config.autoCommit;
    // An open transaction takes this path too: queryCached() puts the
    // rollbackOnError savepoint in the statement's own round trip rather
    // than leaving it to the prepare()/execute()/close() route below. The
    // one thing it cannot express is an explicit autoCommit:true while a
    // transaction is open - "commit once this statement is done" - which
    // stays with PreparedStatement's own wrapper.
    if (
      !options?.cursor &&
      effectiveAutoCommit !== false &&
      !(options?.autoCommit === true && this._intlCon.inTransaction)
    ) {
      const params: Maybe<Maybe<OID>[]> = options?.params?.map(prm =>
        prm instanceof BindParam ? prm.value : prm,
      );
      return await this._captureErrorStack(
        this._intlCon.queryCached(sql, paramTypes, params, options || {}),
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
    // Deliberately no `this.emit('notification', msg)` here:
    // IntlConnection.emit() re-emits every event on its owner, which is
    // this Connection, so the raw event has already been delivered by the
    // time this runs. Emitting it again fired 'notification' twice for one
    // NOTIFY - but only once listen() had been called, since that is what
    // installs this handler, so the same listener saw one event or two
    // depending on whether anything else had subscribed.
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
   *
   * Not `async` itself, deliberately: every branch below already returns a
   * promise directly (`promise` itself, or `promise.catch(...)`'s own
   * derived one) with no `await` in between, so there is nothing here that
   * needs the function to be a coroutine. Marking it `async` anyway would
   * still be correct, but the spec requires wrapping whatever an async
   * function returns through a promise-resolve step, a genuine extra
   * microtask tick on top of the one `promise`/`.catch()` already goes
   * through - paid on every single query this wraps, disabled or not.
   */
  /**
   * The nested half of transaction(): a savepoint of its own, released on
   * success and rolled back to on failure.
   *
   * The `inTransaction` checks are re-read rather than assumed - `fn` is
   * free to commit or roll back the outer transaction itself, and there is
   * no savepoint left to release once it has.
   */
  private async _savepointScope<T>(
    fn: (connection: this) => Promise<T>,
  ): Promise<T> {
    const name = 'txscope' + ++transactionScopeCounter;
    await this._captureErrorStack(this._intlCon.execute('SAVEPOINT ' + name));
    try {
      const result = await fn(this);
      if (this._intlCon.inTransaction)
        await this._intlCon.execute('RELEASE SAVEPOINT ' + name);
      return result;
    } catch (e) {
      if (this._intlCon.inTransaction) {
        await this._intlCon
          .execute(
            'ROLLBACK TO SAVEPOINT ' + name + '; RELEASE SAVEPOINT ' + name,
          )
          .catch(() => undefined);
      }
      throw e;
    }
  }

  protected _captureErrorStack<T>(
    promise: Promise<T>,
    entry?: (...args: any[]) => any,
    asyncErrorHandling?: boolean,
  ): Promise<T> {
    const enabled =
      asyncErrorHandling ?? this._intlCon.config.asyncErrorHandling ?? true;
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
