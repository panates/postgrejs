import { performance } from 'node:perf_hooks';
import {
  ConnectionState,
  DataTypeOIDs,
  DEFAULT_COLUMN_FORMAT,
} from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import { GlobalTypeMap } from '../data-type-map.js';
import { parseMoneyFormat } from '../data-types/money-type.js';
import type {
  BatchCommandResult,
  BatchResult,
} from '../interfaces/batch-result.js';
import type { CommandResult } from '../interfaces/command-result.js';
import type {
  CopyFromRowsOptions,
  CopyFromRowsResult,
} from '../interfaces/copy-from-rows-options.js';
import type {
  DataMappingOptions,
  MoneyFormat,
} from '../interfaces/data-mapping-options.js';
import type { ConnectionConfiguration } from '../interfaces/database-connection-params.js';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { FunctionCallOptions } from '../interfaces/function-call-options.js';
import type { FunctionCallResult } from '../interfaces/function-call-result.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import type { QueryResult } from '../interfaces/query-result.js';
import type { ScriptExecuteOptions } from '../interfaces/script-execute-options.js';
import type { ScriptResult } from '../interfaces/script-result.js';
import { DatabaseError } from '../protocol/database-error.js';
import { PgSocket } from '../protocol/pg-socket.js';
import { Protocol } from '../protocol/protocol.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import type { AnyParseFunction, Maybe, OID } from '../types.js';
import { getConnectionConfig } from '../util/connection-config.js';
import {
  buildCopySql,
  buildProbeSql,
  type CopyRowSource,
  writeCopyBinaryRows,
} from '../util/copy-from-rows.js';
import { escapeLiteral } from '../util/escape-literal.js';
import { getParsers } from '../util/get-parsers.js';
import {
  fetchAsStringEqual,
  resolveColumnFormats,
} from '../util/resolve-column-formats.js';
import {
  resolveRowDecoder,
  resolveRowType,
  type RowDecoder,
} from '../util/row-decoder.js';
import {
  isTransactionCommand,
  refusesSavepoint,
} from '../util/transaction-command.js';
import { wrapRowDescription } from '../util/wrap-row-description.js';
import type { Connection } from './connection.js';
import { CopyFromStream, CopyToStream } from './copy-stream.js';

const DataFormat = Protocol.DataFormat;

interface ExecuteReusedParserCacheEntry {
  typeMap: DataTypeMap;
  columnFormat: Protocol.DataFormat | Protocol.DataFormat[];
  // Not implied by columnFormat: a column the caller made text explicitly
  // and one fetchAsString turned text carry the same format code but get
  // different parsers, so the list has to be compared in its own right.
  fetchAsString: Maybe<OID[]>;
  parsers: AnyParseFunction[];
  resultFields: FieldInfo[];
}

function columnFormatsEqual(
  a: Protocol.DataFormat | Protocol.DataFormat[],
  b: Protocol.DataFormat | Protocol.DataFormat[],
): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const l = a.length;
  let i: number;
  for (i = 0; i < l; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Whether the server is saying that a statement this connection had under
 * a name can no longer be executed as it stands, so the cache entry is
 * stale and the query is worth running again unprepared.
 *
 * Two SQLSTATEs say it. `0A000` is the documented one - "cached plan must
 * not change result type", after an `alter table`. `XX000` is what a
 * dropped and recreated *type* produces ("cache lookup failed for type
 * <oid>"): it is the server's catch-all internal_error rather than
 * something specific, but it is rare enough in ordinary operation that
 * retrying it costs nothing, and the alternative - matching the English
 * message - breaks under a different `lc_messages` or a server version
 * that rewords it.
 *
 * Deliberately narrow. Dropping the entry on *any* failure would also
 * self-heal, but it would retire a perfectly good prepared statement
 * every time an ordinary error came back - a unique violation on a hot
 * upsert would keep costing the statement its name - and re-running a
 * statement that failed for its own reasons buys nothing.
 */
function isStaleCachedPlan(e: unknown): boolean {
  const code = (e as { code?: unknown } | undefined)?.code;
  return code === '0A000' || code === 'XX000';
}

/**
 * Whether a command tag's row count describes rows the statement changed,
 * rather than rows it returned or moved. SELECT, FETCH, MOVE and COPY all
 * carry a count of their own that would be misleading as `rowsAffected`.
 *
 * MERGE has reported its own total (inserted + updated + deleted) since
 * PostgreSQL 15; _handleCommandComplete() has always parsed it, and this
 * is what stops it being dropped on the floor.
 */
function reportsRowsAffected(command: Maybe<string>): boolean {
  return (
    command === 'INSERT' ||
    command === 'UPDATE' ||
    command === 'DELETE' ||
    command === 'MERGE'
  );
}

interface PreparedCacheEntry {
  name: string;
  fields?: Protocol.RowDescription[];
}

/**
 * How one statement of a pipeline is being run. `name` is set when it
 * binds to a prepared statement - one the cache already held, or one this
 * pipeline is preparing for the first time - and `fields` is its
 * RowDescription once known, which is what lets a cached statement skip
 * Describe as well as Parse. Repeats of the same SQL inside one pipeline
 * share a plan object, so the second occurrence reads the first one's
 * RowDescription instead of asking for its own.
 */
interface PipelinePlan {
  name?: string;
  fields?: Protocol.RowDescription[];
  // The result format codes this statement's Bind actually carried, so the
  // parsers built when its rows come back agree with what was asked for.
  columnFormat?: Protocol.DataFormat | Protocol.DataFormat[];
}

/**
 * Uses of the same SQL before it is worth preparing.
 *
 * Preparing on first sight, as postgres.js does, pays Parse plus Describe
 * and leaves a named statement behind for SQL that may never run again;
 * waiting for the second use keeps a genuinely one-shot query at exactly
 * today's cost. The repeated query pays one extra unprepared call before
 * it starts saving, which it makes back immediately.
 */
const PREPARE_AFTER_USES = 2;

/**
 * Stands in for the command tag an empty statement never sends, so that
 * the slot is taken and nothing behind it is mistaken for the caller's
 * own command. Its empty name is what leaves `QueryResult.command`
 * unset, which is what `pg` reports for the same statement.
 */
const EMPTY_QUERY_TAG: Protocol.CommandCompleteMessage = { command: '' };

/** See IntlConnection._decodeDeferredRows(). */
interface DeferredRows {
  target: { rows?: any[] };
  raw: Protocol.DataRowMessage[];
  parsers: AnyParseFunction[];
  fields: any;
}

/**
 * SQL that manages transaction boundaries itself, and so must never be
 * wrapped in a savepoint or an implicit BEGIN/COMMIT of ours.
 */
/**
 * What the prepared statement cache is keyed on. The parameter OIDs are
 * part of it because the server fixes them at Parse: the same SQL bound
 * with different types is a different plan.
 */
function preparedCacheKey(
  sql: string,
  paramTypes: Maybe<Maybe<OID>[]>,
): string {
  return paramTypes?.length ? sql + '\u0000' + paramTypes.join(',') : sql;
}

export class IntlConnection extends SafeEventEmitter {
  /**
   * Server-side prepared statements this connection has built, keyed by
   * the SQL text and its parameter OIDs - both, because the OIDs are part
   * of what was parsed, not just how it is bound.
   *
   * A Map, relied on for its insertion order: re-inserting on every hit
   * makes the first entry the least recently used, which is what gets
   * closed when the cache is full. Statements belong to the session, so
   * this is per connection and dies with it.
   */
  private _preparedCache = new Map<string, PreparedCacheEntry>();
  /** SQL seen once but not yet prepared - see PREPARE_AFTER_USES. */
  private _preparedCandidates = new Map<string, number>();
  private _preparedCounter = 0;

  private _executeReusedParserCache = new WeakMap<
    Protocol.RowDescription[],
    ExecuteReusedParserCacheEntry
  >();
  protected _refCount = 0;
  protected _transactionDepth = 0;
  protected _savepointDepths = new Map<string, number>();
  protected _config: ConnectionConfiguration;
  protected _onErrorSavePoint: string;
  /** The server's own money rendering - see ensureMoneyFormat(). */
  protected _moneyFormat?: MoneyFormat;
  protected _moneyFormatPromise?: Promise<void>;
  /** Statements currently holding the wire - see enterWire(). */
  protected _wireUsers = 0;
  protected _wireIdleWaiters?: (() => void)[];
  protected _wireLock?: Promise<void>;
  /** Bound once: enterWire()'s fast path hands out this same function. */
  protected _releaseWire = (): void => {
    if (--this._wireUsers || !this._wireIdleWaiters) return;
    const waiters = this._wireIdleWaiters;
    this._wireIdleWaiters = undefined;
    let i: number;
    const l = waiters.length;
    for (i = 0; i < l; i++) waiters[i]();
  };
  transactionStatus = 'I';
  socket: PgSocket;
  owner?: SafeEventEmitter;
  runningQueryCount: number = 0;

  constructor(config?: ConnectionConfiguration | string) {
    super();
    this._config = Object.freeze(getConnectionConfig(config));
    this.socket = new PgSocket(this._config);
    this.socket.on('error', err => this._onError(err));
    // The reason travels with it: 'close' on its own cannot tell an
    // ordinary shutdown from the backend being terminated under us.
    this.socket.on('close', (reason?: Error) => this.emit('close', reason));
    this.socket.on('notification', payload =>
      this.emit('notification', payload),
    );
    // Covers a notice that arrives while no statement is running. One
    // raised *by* a statement is dispatched to that statement's own
    // message loop instead, which is why each of those forwards it too.
    this.socket.on('notice', payload => this.emit('notice', payload));
    this.socket.on('connecting', () => this.emit('connecting'));
    this._onErrorSavePoint = 'SP_' + Math.round(Math.random() * 100000000);
  }

  get config(): ConnectionConfiguration {
    return this._config;
  }

  get inTransaction(): boolean {
    return this.transactionStatus === 'T' || this.transactionStatus === 'E';
  }

  get state(): ConnectionState {
    return this.socket.state;
  }

  get refCount(): number {
    return this._refCount;
  }

  get processID(): Maybe<number> {
    return this.socket.processID;
  }

  get secretKey(): Maybe<Buffer> {
    return this.socket.secretKey;
  }

  /** See `PgSocket.protocolNegotiation`. */
  get protocolNegotiation(): Maybe<Protocol.NegotiateProtocolVersionMessage> {
    return this.socket.protocolNegotiation;
  }

  get sessionParameters(): Record<string, string> {
    return this.socket.sessionParameters;
  }

  async connect(): Promise<void> {
    if (this.socket.state === ConnectionState.READY) return;
    await new Promise<void>((resolve, reject) => {
      const handleConnectError = (err: Error) => reject(err);
      this.socket.once('ready', () => {
        this.socket.removeListener('error', handleConnectError);
        resolve();
      });
      this.socket.once('error', handleConnectError);
      this.socket.connect();
    });
    let startupCommand = '';
    if (this.config.schema)
      startupCommand +=
        'SET search_path = ' + escapeLiteral(this.config.schema) + ';';
    if (this.config.timezone)
      startupCommand +=
        'SET timezone TO ' + escapeLiteral(this.config.timezone) + ';';
    if (startupCommand)
      await this.execute(startupCommand, { autoCommit: true });
    this.emit('ready');
  }

  async close(): Promise<void> {
    if (this.state === ConnectionState.CLOSED) return;
    return new Promise(resolve => {
      if (this.socket.state === ConnectionState.CLOSED) return;
      // 'close' is not emitted here - the constructor's own
      // `this.socket.on('close', () => this.emit('close'))` already
      // forwards it once the socket's real close event fires. Emitting it
      // again right here (synchronously, before socket.close()'s
      // destroy() has actually completed) used to fire 'close' on this
      // IntlConnection TWICE per close() call - confirmed live: a single
      // close() left two listeners registered on the far side (e.g. two
      // NOTIFY deliveries after Pool's reconnect re-subscribed twice).
      this.socket.once('close', () => resolve());
      this.socket.sendTerminateMessage(() => {
        this.socket.close();
      });
    });
  }

  async execute(
    sql: string,
    options: ScriptExecuteOptions = {},
    cb?: (event: string, ...args: any[]) => void,
  ): Promise<ScriptResult> {
    this.assertConnected();
    const transactionCommand = isTransactionCommand(sql);
    let beginFirst = false;
    let commitLast = false;
    const { autoCommit } = options;
    if (!transactionCommand) {
      if (
        (autoCommit != null ? autoCommit : this.config.autoCommit) === false &&
        !this.inTransaction
      ) {
        beginFirst = true;
      }
      if (autoCommit && this.inTransaction) commitLast = true;
    }
    if (beginFirst) await this._execute('BEGIN');

    // this.inTransaction goes first here, before the config fallback: the
    // result is only ever consulted below when it's true, so checking it
    // first short-circuits that read on every call made outside of a
    // transaction, the common case. Below, `rollbackOnError &&
    // this.inTransaction` deliberately puts it last instead - re-checking
    // live state a plain local boolean can't capture (the awaited call in
    // between may have committed, rolled back, or errored the transaction
    // out from under it) - but ordered so the cheap local read still
    // short-circuits the getter whenever rollbackOnError is already
    // false, which it is outside a transaction.
    const rollbackOnError =
      // Not `transactionCommand`: `SET TRANSACTION` still wants the
      // implicit BEGIN above, and only the savepoint is fatal to it.
      !refusesSavepoint(sql) &&
      this.inTransaction &&
      (options.rollbackOnError ?? this.config.rollbackOnError ?? true);

    if (rollbackOnError && this.inTransaction)
      await this._execute('SAVEPOINT ' + this._onErrorSavePoint);
    try {
      const result = await this._execute(sql, options, cb);
      if (commitLast) await this._execute('COMMIT');
      else if (rollbackOnError && this.inTransaction) {
        await this._execute('RELEASE ' + this._onErrorSavePoint + ';');
      }
      return result;
    } catch (e: any) {
      if (rollbackOnError && this.inTransaction)
        await this._execute('ROLLBACK TO ' + this._onErrorSavePoint + ';');
      throw e;
    }
  }

  /**
   * The legacy Function Call sub-protocol: calls a function by OID
   * directly, bypassing SQL entirely. PostgreSQL itself calls this
   * superseded by `SELECT func(...)` over the Simple/Extended Query
   * protocols (what this driver uses everywhere else, and what every
   * other current client uses exclusively) - kept only for wire-protocol
   * completeness. Arguments and the result travel as raw wire-format
   * bytes rather than through this driver's usual typed encode/decode
   * pipeline - the caller is responsible for both (see a `DataType`'s own
   * `encodeBinary`/`decodeBinary` for the format a given OID expects).
   */
  async callFunction(
    functionId: OID,
    args: Maybe<Buffer>[],
    options: FunctionCallOptions = {},
  ): Promise<FunctionCallResult> {
    this.assertConnected();
    this.ref();
    try {
      let result: FunctionCallResult | undefined;
      let error: Error | undefined;
      return await this.socket.sendFunctionCallMessage(
        {
          functionId,
          args,
          argFormats: options.argFormats,
          resultFormat: options.resultFormat,
        },
        (code, msg, done) => {
          switch (code) {
            case Protocol.BackendMessageCode.ErrorResponse:
              error = msg;
              break;
            case Protocol.BackendMessageCode.FunctionCallResponse:
              result = msg as FunctionCallResult;
              break;
            case Protocol.BackendMessageCode.ReadyForQuery:
              this.transactionStatus = msg.status;
              if (error) {
                done(error);
                break;
              }
              done(undefined, result);
              break;
            default:
              break;
          }
        },
      );
    } finally {
      this.unref();
    }
  }

  /**
   * Starts a transaction, or - if one is already running - marks a nested
   * level of it. Each call increments `_transactionDepth`; only the
   * outermost one actually sends BEGIN (`inTransaction` is already false at
   * that point). A matching number of commit() calls is then needed to
   * actually commit - see commit().
   */
  async startTransaction(): Promise<void> {
    this._transactionDepth++;
    if (!this.inTransaction) await this.execute('BEGIN');
  }

  /**
   * Starts a savepoint, or - if one under the same `name` is already open -
   * marks a nested level of it. Mirrors startTransaction(): only the
   * outermost call for a given name actually sends SAVEPOINT: a savepoint
   * already exists under that name, re-declaring it would just stack a
   * second, independent one with the same name on the server rather than
   * nesting the existing one.
   */
  async savepoint(name: string): Promise<void> {
    if (!(name && name.match(/^[a-zA-Z]\w*$/)))
      throw new Error(`Invalid savepoint "${name}"`);
    const depth = (this._savepointDepths.get(name) || 0) + 1;
    this._savepointDepths.set(name, depth);
    if (depth === 1) await this.execute('BEGIN; SAVEPOINT ' + name);
  }

  /**
   * Commits the transaction started by startTransaction() - or, when nested,
   * just unwinds one level of `_transactionDepth`. The actual COMMIT is only
   * sent once the depth reaches zero, i.e. once every startTransaction()
   * call has a matching commit().
   * @param immediate - Ignores `_transactionDepth` and commits right away,
   *   regardless of how many nested levels are still open.
   */
  async commit(immediate?: boolean): Promise<void> {
    if (!immediate && this._transactionDepth > 1) {
      this._transactionDepth--;
      return;
    }
    this._transactionDepth = 0;
    if (this.inTransaction) await this.execute('COMMIT');
  }

  /**
   * Releases the savepoint created by savepoint() - or, when nested, just
   * unwinds one level of that name's depth. The actual RELEASE SAVEPOINT is
   * only sent once that depth reaches zero.
   * @param name - Name of the savepoint.
   * @param immediate - Ignores the tracked depth and releases right away.
   */
  async releaseSavepoint(name: string, immediate?: boolean): Promise<void> {
    if (!(name && name.match(/^[a-zA-Z]\w*$/)))
      throw new Error(`Invalid savepoint "${name}"`);
    const depth = this._savepointDepths.get(name) || 0;
    if (!immediate && depth > 1) {
      this._savepointDepths.set(name, depth - 1);
      return;
    }
    this._savepointDepths.delete(name);
    await this.execute('RELEASE SAVEPOINT ' + name, { autoCommit: false });
  }

  /**
   * Rolls back the whole transaction, regardless of `_transactionDepth` -
   * a rollback ends the transaction outright, so there is nothing left for
   * any pending, still-nested commit() call to unwind.
   */
  async rollback(): Promise<void> {
    this._transactionDepth = 0;
    if (this.inTransaction) await this.execute('ROLLBACK');
  }

  /**
   * Ends the current transaction as a prepared one: it stops being tied to
   * this session and waits under `name` until some connection - not
   * necessarily this one, and not necessarily this process - finishes it
   * with commitPrepared() or rollbackPrepared().
   *
   * Goes through _execute() rather than execute(): PREPARE TRANSACTION is
   * not in the latter's list of transaction commands, so it would be
   * wrapped in a savepoint whose RELEASE then fails, the session no longer
   * being in a transaction by that point.
   *
   * Requires `max_prepared_transactions` above zero on the server, which is
   * not the default; the server's own error says so if it is not.
   *
   * Resets `_transactionDepth` like commit()/rollback() do: PREPARE
   * TRANSACTION ends the session's transaction on the wire regardless of
   * how many nested startTransaction() calls led up to it, so a stale,
   * nonzero depth left behind here would make a later, unrelated commit()
   * on this same connection treat itself as still nested and silently skip
   * sending COMMIT.
   */
  async prepareTransaction(name: string): Promise<void> {
    await this._execute('PREPARE TRANSACTION ' + escapeLiteral(name));
    this._transactionDepth = 0;
  }

  /** Commits a transaction left waiting by prepareTransaction(). */
  async commitPrepared(name: string): Promise<void> {
    await this._execute('COMMIT PREPARED ' + escapeLiteral(name));
  }

  /** Discards a transaction left waiting by prepareTransaction(). */
  async rollbackPrepared(name: string): Promise<void> {
    await this._execute('ROLLBACK PREPARED ' + escapeLiteral(name));
  }

  /**
   * Rolls back to the given savepoint, regardless of its tracked depth - a
   * rollback discards it (and everything after it) outright, so there is
   * nothing left for any pending, still-nested releaseSavepoint() call to
   * unwind.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    if (!(name && name.match(/^[a-zA-Z]\w*$/)))
      throw new Error(`Invalid savepoint "${name}"`);
    this._savepointDepths.delete(name);
    await this.execute('ROLLBACK TO SAVEPOINT ' + name, { autoCommit: false });
  }

  /** Asks the server to cancel whatever this session is running. */
  cancel(): Promise<void> {
    return this.socket.cancel();
  }

  /**
   * Claims the wire for one statement, and hands back the function that
   * releases it.
   *
   * Several statements share it by default: PostgreSQL correlates
   * responses to requests by order, so a connection can carry more than
   * one at a time and a caller that does not wait for each reply is
   * measurably faster. `exclusive` is `pipeline: false` - the statement
   * waits until nothing else is running here, and nothing else starts
   * until it releases.
   *
   * Returns the release function itself rather than a promise of one
   * whenever it can be taken without waiting, which is every statement
   * on a connection nobody has asked to serialise - the common case, and
   * the one that must not pay for this.
   */
  enterWire(exclusive?: boolean): (() => void) | Promise<() => void> {
    if (!exclusive && !this._wireLock) {
      this._wireUsers++;
      return this._releaseWire;
    }
    return this._enterWireQueued(!!exclusive);
  }

  /**
   * Asks the server how it renders money, once per connection.
   *
   * `money` travels as an int64 of the smallest currency unit, and how
   * many of those make one unit is `lc_monetary` - which the server
   * does not report among its startup parameters, so `1234` on the wire
   * is $12.34, ¥1234 or 1.234 KWD depending on a setting only the server
   * knows. Asking it to render a value it already knows is the whole
   * answer, and needs no locale data on this side.
   *
   * `1` is the value asked for because it cannot carry a thousands
   * separator: whatever separator comes back can only be the decimal
   * one, and the digits after it can only be the fraction. `$1.00` is
   * two, `¥1` is none.
   */
  async ensureMoneyFormat(): Promise<void> {
    if (this._moneyFormat) return;
    if (!this._moneyFormatPromise) {
      // Assigned before the query starts: the query goes through
      // queryCached like any other, and would ask for the format again
      // on its way out.
      let done!: () => void;
      this._moneyFormatPromise = new Promise<void>(r => (done = r));
      this.queryCached("select '1'::money::text", undefined, undefined, {
        columnFormat: DataFormat.text,
      })
        .then(r => {
          const text = r.rows?.[0]?.[0];
          if (typeof text === 'string')
            this._moneyFormat = parseMoneyFormat(text);
        })
        .catch(() => undefined)
        .then(done);
    }
    return this._moneyFormatPromise;
  }

  /**
   * Whether these columns need the server's money format and this
   * connection has not asked for it yet.
   *
   * The scan costs a look at each column's OID, and only until the
   * answer is in - from then on the first test ends it.
   */
  needsMoneyFormat(fields: Maybe<{ dataTypeId: OID }[]>): boolean {
    if (this._moneyFormat || !fields) return false;
    const l = fields.length;
    let i: number;
    let oid: OID;
    for (i = 0; i < l; i++) {
      oid = fields[i].dataTypeId;
      if (oid === DataTypeOIDs.money || oid === DataTypeOIDs._money)
        return true;
    }
    return false;
  }

  ref(): void {
    this._refCount++;
  }

  unref(): boolean {
    this._refCount--;
    if (!this._refCount) this.emit('idle');
    return !this._refCount;
  }

  assertConnected(): void {
    if (this.state === ConnectionState.CLOSING)
      throw new Error('Connection is closing');
    if (this.state === ConnectionState.CLOSED)
      throw new Error('Connection closed');
  }

  /**
   * Runs a COPY ... TO STDOUT and hands back its bytes as they arrive.
   * Resolves once the server has accepted the copy, not once it has
   * finished - the whole point is not to hold the export in memory.
   */
  async copyTo(sql: string): Promise<CopyToStream> {
    this.assertConnected();
    this.ref();
    this.runningQueryCount++;
    const stream = new CopyToStream(this.socket);
    this.socket
      .sendQueryMessage(sql, stream.capture)
      .catch(err => stream.fail(err))
      .finally(() => {
        this.runningQueryCount--;
        this.unref();
      });
    await stream.waitStarted();
    return stream;
  }

  /**
   * Runs a COPY ... FROM STDIN and hands back a stream to feed it.
   * Resolves once the server is ready for data.
   */
  /**
   * Streams rows into a table with `COPY ... FROM STDIN (FORMAT binary)`,
   * encoding each value with its own type's binary encoder.
   *
   * Binary COPY performs no conversion server-side, so the destination
   * column types have to be known exactly. They are read from the server
   * unless the caller supplies them: a Describe of `select <columns> from
   * <table> where false` against the unnamed statement returns a
   * RowDescription carrying each column's OID, which costs one round trip
   * and leaves nothing to close (the next Parse replaces the unnamed
   * statement). Letting PostgreSQL resolve the name is the reason to do it
   * this way rather than reading the catalog here - schemas, quoting,
   * search_path and views then behave exactly as they will for the COPY.
   */
  async copyFromRows(
    table: string,
    source: CopyRowSource,
    options: CopyFromRowsOptions = {},
  ): Promise<CopyFromRowsResult> {
    this.assertConnected();
    let columns = options.columns;
    let dataTypeIds = options.columnTypes;

    if (!dataTypeIds || !columns) {
      const { fields } = await this.prepareOnce(
        buildProbeSql(table, columns),
        undefined,
        '',
      );
      if (!fields?.length)
        throw new Error(
          `Cannot determine columns of "${table}" - it returned no column descriptions`,
        );
      columns = columns || fields.map(f => f.fieldName);
      dataTypeIds = dataTypeIds || fields.map(f => f.dataTypeId);
    }
    if (columns.length !== dataTypeIds.length)
      throw new Error(
        `columnTypes has ${dataTypeIds.length} entries but ${columns.length} columns were given`,
      );

    const stream = await this.copyFrom(buildCopySql(table, columns));
    // The CopyFail sent below comes back as an ErrorResponse, which the
    // stream emits as 'error'. Node turns an 'error' with no listener into
    // an uncaught exception and takes the process down - so a value this
    // method already rejected cleanly would kill the caller instead.
    // Recorded rather than ignored, since the same listener covers a
    // socket that dies mid-copy.
    let streamError: Error | undefined;
    stream.on('error', e => {
      streamError = streamError || e;
    });
    try {
      const result = await writeCopyBinaryRows(source, {
        columns,
        dataTypeIds,
        options,
        write: chunk =>
          new Promise<void>((resolve, reject) => {
            const accepted = this.socket.sendCopyData(chunk, err =>
              err ? reject(err) : resolve(),
            );
            // Taken without buffering - no reason to wait for the write
            // callback, which would add a turn of latency per chunk.
            if (accepted) resolve();
          }),
      });
      await new Promise<void>(resolve => stream.end(resolve));
      if (streamError) throw streamError;
      return result;
    } catch (e) {
      // Tell the server to abandon the copy rather than leaving it waiting
      // for a stream that will never arrive.
      this.socket.sendCopyFail(
        e instanceof Error ? e.message : 'copyFromRows() failed',
      );
      throw e;
    }
  }

  async copyFrom(sql: string): Promise<CopyFromStream> {
    this.assertConnected();
    this.ref();
    this.runningQueryCount++;
    const stream = new CopyFromStream(this.socket);
    this.socket
      .sendQueryMessage(sql, stream.capture)
      .catch(err => stream.fail(err))
      .finally(() => {
        this.runningQueryCount--;
        this.unref();
      });
    await stream.waitStarted();
    return stream;
  }

  protected async _execute(
    sql: string,
    options: ScriptExecuteOptions = {},
    cb?: (event: string, ...args: any[]) => void,
  ): Promise<ScriptResult> {
    options = this._withMoneyFormat(options);
    this.ref();
    try {
      const timingEnabled = options.timing ?? this.config.timing ?? false;
      const startTime = timingEnabled ? performance.now() : 0;
      const result: ScriptResult = {
        totalCommands: 0,
        results: [],
      };
      let currentStart = startTime;
      let parsers: AnyParseFunction[] | undefined;
      let current: CommandResult = { command: undefined };
      let fields: Protocol.RowDescription[];
      const deferred: DeferredRows[] = [];
      let currentDeferred: DeferredRows | undefined;
      let error: Error | undefined;
      const typeMap = options.typeMap || GlobalTypeMap;
      const rowDecoder = resolveRowDecoder(options);
      this.runningQueryCount++;
      const scriptResult: ScriptResult = await this.socket.sendQueryMessage(
        sql,
        (
          code: Protocol.BackendMessageCode,
          msg: any,
          done: (err?: Error, result?: any) => void,
        ) => {
          switch (code) {
            case Protocol.BackendMessageCode.ErrorResponse:
              error = msg;
              break;
            case Protocol.BackendMessageCode.CopyInResponse:
              error =
                error ||
                new Error(
                  'COPY FROM STDIN is not supported by execute() - use copyFrom() instead',
                );
              this.socket.sendCopyFail(error.message);
              break;
            case Protocol.BackendMessageCode.CopyOutResponse:
              error =
                error ||
                new Error(
                  'COPY TO STDOUT is not supported by execute() - use copyTo() instead',
                );
              break;
            case Protocol.BackendMessageCode.NoticeResponse:
              // Not an error: handed over, and the loop carries on.
              this.emit('notice', msg);
              break;
            case Protocol.BackendMessageCode.EmptyQueryResponse:
              break;
            case Protocol.BackendMessageCode.RowDescription:
              fields = msg.fields;
              // Simple Query has no Bind at all, so every column is
              // already text - a fetchAsString column simply comes back
              // unparsed.
              parsers = getParsers(typeMap, fields, options);
              current.fields = wrapRowDescription(
                typeMap,
                fields,
                DataFormat.text,
                options,
              );
              current.rows = [];
              currentDeferred = this.needsMoneyFormat(fields)
                ? {
                    target: current,
                    raw: [],
                    parsers,
                    fields: current.fields,
                  }
                : undefined;
              if (currentDeferred) deferred.push(currentDeferred);
              break;
            case Protocol.BackendMessageCode.DataRow:
              {
                // Set aside rather than read against a scale nobody has
                // confirmed - see _decodeDeferredRows().
                if (currentDeferred) {
                  currentDeferred.raw.push(msg);
                  break;
                }
                const row: any = rowDecoder.decode(
                  parsers!,
                  msg.data,
                  msg.columnCount,
                  options,
                  current.fields!,
                );
                if (cb) cb('row', row);
                current.rows = current.rows || [];
                current.rows.push(row);
              }
              break;
            case Protocol.BackendMessageCode.CommandComplete:
              currentDeferred = undefined;
              // Ignore BEGIN command that we added to sql
              current.command = msg.command;
              if (reportsRowsAffected(current.command))
                current.rowsAffected = msg.rowCount;
              if (timingEnabled)
                current.executeTime = performance.now() - currentStart;
              if (current.rows) current.rowType = resolveRowType(options);
              result.results.push(current);
              if (cb) cb('command-complete', current);
              current = { command: undefined };
              if (timingEnabled) currentStart = performance.now();
              break;
            case Protocol.BackendMessageCode.ReadyForQuery:
              this.transactionStatus = msg.status;
              if (error) {
                done(error);
                break;
              }
              if (timingEnabled)
                result.totalTime = performance.now() - startTime;
              // Ignore COMMIT command that we added to sql
              result.totalCommands = result.results.length;
              done(undefined, result);
              break;
            default:
              break;
          }
        },
      );
      if (deferred.length)
        await this._decodeDeferredRows(deferred, rowDecoder, options);
      return scriptResult;
    } finally {
      this.runningQueryCount--;
      this.unref();
    }
  }

  /**
   * One-shot Extended Query fast path: Parse+Bind+Describe+Execute+Sync as
   * a single round trip (unnamed statement/portal, no Close needed), used
   * by Connection.query() instead of prepare()+PreparedStatement.execute()
   * +close()'s 7 round trips whenever there's no cursor and no explicit/
   * active transaction to wrap (see Connection.query() for that gating).
   */
  /**
   * Runs a one-shot extended query, reusing a server-side prepared
   * statement when this connection has run the same SQL before.
   *
   * A repeated query then costs Bind/Execute instead of
   * Parse/Bind/Describe/Execute, which the server can answer without
   * planning again - fifty concurrent calls of one statement measured
   * 0.97ms against 3.13ms, and socket reads dropped from 38 to 8.
   *
   * Nothing is prepared on first sight: SQL has to be seen
   * PREPARE_AFTER_USES times before it earns a name, so a query that runs
   * once costs exactly what it costs today.
   *
   * A cached statement can be invalidated under us - `alter table` between
   * two calls makes PostgreSQL answer 0A000, "cached plan must not change
   * result type", and a dropped and recreated type makes it answer XX000,
   * "cache lookup failed for type". Both are caught here (see
   * isStaleCachedPlan): the entry is dropped and the query runs again
   * unprepared, so a migration against a live connection recovers instead
   * of failing every call from then on.
   */
  async queryCached(
    sql: string,
    paramTypes: Maybe<Maybe<OID>[]>,
    params: Maybe<Maybe<any>[]>,
    options: QueryOptions,
  ): Promise<QueryResult> {
    options = this._withMoneyFormat(options);
    const savepoint = this._inlineSavepointFor(sql, options);
    try {
      return await this._queryCached(
        sql,
        paramTypes,
        params,
        options,
        savepoint,
      );
    } catch (e: any) {
      // PostgreSQL throws away everything between a failed statement and
      // the Sync, so an inlined RELEASE never ran and the savepoint is
      // still standing. Rolling back to it leaves the transaction usable,
      // which is the whole point of rollbackOnError - and it is left
      // standing afterwards, as the separate-round-trip wrapper left it.
      if (savepoint) await this._execute('ROLLBACK TO ' + savepoint);
      throw e;
    }
  }

  /**
   * The savepoint rollbackOnError calls for, or undefined when this call
   * needs none: outside a transaction there is nothing to roll back to,
   * a statement that is itself a transaction command manages its own
   * boundaries (wrapping COMMIT in a savepoint would be nonsense), and
   * PostgreSQL refuses `SET TRANSACTION` inside one outright.
   */
  protected _inlineSavepointFor(
    sql: string,
    options: QueryOptions,
  ): Maybe<string> {
    if (!this.inTransaction || refusesSavepoint(sql)) return undefined;
    const on = options.rollbackOnError ?? this.config.rollbackOnError ?? true;
    return on ? this._onErrorSavePoint : undefined;
  }

  protected async _queryCached(
    sql: string,
    paramTypes: Maybe<Maybe<OID>[]>,
    params: Maybe<Maybe<any>[]>,
    options: QueryOptions,
    savepoint: Maybe<string>,
  ): Promise<QueryResult> {
    const enabled = options.prepare ?? this.config.prepare ?? true;
    if (!enabled)
      return this.queryOnce(sql, paramTypes, params, options, savepoint);

    const key = preparedCacheKey(sql, paramTypes);
    const cached = this._preparedCache.get(key);
    if (cached) {
      // Re-insert to mark it most recently used.
      this._preparedCache.delete(key);
      this._preparedCache.set(key, cached);
      try {
        return await this.executeReused(
          cached.name,
          cached.fields,
          paramTypes,
          params,
          options,
          savepoint,
        );
      } catch (e: any) {
        if (!isStaleCachedPlan(e)) throw e;
        this._preparedCache.delete(key);
        // ROLLBACK TO leaves the savepoint itself in place, so the retry
        // must not open a second one under the same name - it runs bare
        // and releases the one already held.
        if (savepoint) await this._execute('ROLLBACK TO ' + savepoint);
        const result = await this.queryOnce(sql, paramTypes, params, options);
        if (savepoint) await this._execute('RELEASE ' + savepoint);
        return result;
      }
    }

    // A fetchAsString query needs its RowDescription before the Bind that
    // asks for those columns as text, and only a named statement has one
    // in hand ahead of time. Preparing on first sight pays a single
    // Parse+Describe round trip per connection instead of leaving every
    // call until the statement earns a name asking for the whole row as
    // text (what queryOnce() falls back to).
    // unknownTypesAsString needs the columns known before the Bind for
    // the same reason fetchAsString does, so it earns a name the same way.
    const needsFields =
      !!options.fetchAsString?.length || !!options.unknownTypesAsString;
    if (!needsFields && !this._earnsAName(key))
      return this.queryOnce(sql, paramTypes, params, options, savepoint);

    const name = 'C_' + ++this._preparedCounter;
    // A Parse that fails caches nothing and reports itself; the statement
    // is simply never reused. It runs outside the savepoint, as the
    // prepare() the transaction path used to do ahead of its own wrapper.
    const { fields } = await this.prepareOnce(sql, paramTypes, name);
    const entry: PreparedCacheEntry = { name, fields };
    await this._evictPreparedIfFull();
    this._preparedCache.set(key, entry);
    return this.executeReused(
      name,
      entry.fields,
      paramTypes,
      params,
      options,
      savepoint,
    );
  }

  /**
   * Counts one more use of this SQL and says whether it has now been seen
   * often enough to be worth preparing under a name.
   */
  protected _earnsAName(key: string): boolean {
    const uses = (this._preparedCandidates.get(key) || 0) + 1;
    if (uses < PREPARE_AFTER_USES) {
      this._preparedCandidates.set(key, uses);
      return false;
    }
    this._preparedCandidates.delete(key);
    return true;
  }

  /** Closes the least recently used statement once the cache is full. */
  protected async _evictPreparedIfFull(): Promise<void> {
    const max = this.config.preparedStatementCacheSize ?? 64;
    while (this._preparedCache.size >= max) {
      const oldest = this._preparedCache.keys().next();
      if (oldest.done) return;
      const entry = this._preparedCache.get(oldest.value)!;
      this._preparedCache.delete(oldest.value);
      // A statement that cannot be closed is already gone as far as this
      // connection is concerned; losing the cache entry is the part that
      // matters, and failing the caller's query over it would be worse.
      await this._closePreparedStatement(entry.name).catch(() => undefined);
    }
  }

  /**
   * Closes an evicted statement server-side. Close answers CloseComplete
   * but no ReadyForQuery, so the Sync goes separately and both are awaited
   * together - the same shape PreparedStatement._close() uses.
   */
  protected async _closePreparedStatement(name: string): Promise<void> {
    const closed = this.socket.sendCloseMessage(
      { type: 'S', name },
      (code, msg: any, done) => {
        if (code === Protocol.BackendMessageCode.CloseComplete) done(undefined);
        else if (code === Protocol.BackendMessageCode.ErrorResponse) done(msg);
      },
    );
    const synced = this.socket.sendSyncMessage((code, msg: any, done) => {
      if (code === Protocol.BackendMessageCode.ReadyForQuery) {
        this.transactionStatus = msg.status;
        done(undefined);
      } else if (code === Protocol.BackendMessageCode.ErrorResponse) done(msg);
    });
    await Promise.all([closed, synced]);
  }

  async queryOnce(
    sql: string,
    paramTypes: Maybe<Maybe<OID>[]>,
    params: Maybe<Maybe<any>[]>,
    options: QueryOptions,
    savepoint?: string,
  ): Promise<QueryResult> {
    options = this._withMoneyFormat(options);
    this.assertConnected();
    this.ref();
    try {
      const typeMap = options.typeMap || GlobalTypeMap;
      const timingEnabled = options.timing ?? this.config.timing ?? false;
      const startTime = timingEnabled ? performance.now() : 0;
      const result: QueryResult = { command: undefined };
      const rows: any[] = [];
      let parsers: AnyParseFunction[] | undefined;
      let resultFields: FieldInfo[] | undefined;
      let commandTag: Protocol.CommandCompleteMessage | undefined;
      let error: Error | undefined;
      let suspended = false;
      const rowDecoder = resolveRowDecoder(options);

      // fetchAsString names OIDs, but Bind's result format codes are
      // positional - and this path's Describe answers only after the Bind
      // that would have to carry them. With no column types to map the
      // list onto, the whole row is asked for as text instead: the listed
      // columns then arrive exactly as the server renders them, which is
      // what was asked for, and the rest cost a text decode.
      //
      // Only `prepare: false` normally reaches here with a list set -
      // _queryCached() prepares a fetchAsString query on first sight
      // precisely so it can send per-column codes from the second call on
      // (from the first, for every connection that has seen the SQL).
      const columnFormat =
        options.fetchAsString?.length || options.unknownTypesAsString
          ? DataFormat.text
          : options.columnFormat != null
            ? options.columnFormat
            : DEFAULT_COLUMN_FORMAT;

      // See executeReused() for what a savepoint riding along does to the
      // CommandComplete stream.
      let leadingCommandTags = savepoint ? 1 : 0;

      this.runningQueryCount++;
      await this.socket
        .sendExtendedQueryMessages(
          {
            parse: { sql, paramTypes },
            bind: {
              typeMap,
              paramTypes,
              params,
              queryOptions: options,
              columnFormat,
            },
            describe: { type: 'P' },
            execute: { fetchCount: options.fetchCount ?? 0 },
            before: savepoint ? 'SAVEPOINT ' + savepoint : undefined,
            after: savepoint ? 'RELEASE ' + savepoint : undefined,
          },
          (
            code: Protocol.BackendMessageCode,
            msg: any,
            done: (err?: Error, result?: any) => void,
          ) => {
            switch (code) {
              case Protocol.BackendMessageCode.NoticeResponse:
                // Not an error: handed over, and the loop carries on.
                this.emit('notice', msg);
                break;
              case Protocol.BackendMessageCode.ParseComplete:
              case Protocol.BackendMessageCode.BindComplete:
              case Protocol.BackendMessageCode.NoData:
                break;
              // The server stopped at the fetchCount limit rather than
              // running out of rows. The Sync that closes this call
              // discards the portal, so the rest is gone - all that can be
              // done is say the result is a prefix.
              case Protocol.BackendMessageCode.PortalSuspended:
                suspended = true;
                break;
              case Protocol.BackendMessageCode.RowDescription:
                parsers = getParsers(typeMap, msg.fields, options);
                resultFields = wrapRowDescription(
                  typeMap,
                  msg.fields,
                  columnFormat,
                  options,
                );
                result.fields = resultFields;
                result.rowType = resolveRowType(options);
                break;
              case Protocol.BackendMessageCode.DataRow:
                rows.push(msg);
                break;
              // An empty statement - '' or nothing but a comment - answers
              // with this *instead of* a CommandComplete, so it has to take
              // the same slot: a RELEASE riding along behind it would
              // otherwise be read as the caller's own command. The sentinel
              // carries no command name, which is what `pg` reports too.
              case Protocol.BackendMessageCode.EmptyQueryResponse:
              case Protocol.BackendMessageCode.CommandComplete:
                if (leadingCommandTags) leadingCommandTags--;
                else if (!commandTag) commandTag = msg || EMPTY_QUERY_TAG;
                break;
              case Protocol.BackendMessageCode.ErrorResponse:
                error = msg;
                break;
              case Protocol.BackendMessageCode.ReadyForQuery:
                this.transactionStatus = msg.status;
                done(error);
                break;
              default:
                done(
                  new Error(
                    `Server returned unexpected response message (${String.fromCharCode(code)})`,
                  ),
                );
            }
          },
        )
        .finally(() => {
          this.runningQueryCount--;
        });

      if (commandTag?.command) result.command = commandTag.command;
      // The rows are still raw here, so the one question money cannot
      // answer for itself can still be asked before they are read.
      if (this.needsMoneyFormat(resultFields)) {
        await this.ensureMoneyFormat();
        options = this._withMoneyFormat(options);
      }
      if (resultFields && parsers) {
        if (!result.command) result.command = 'SELECT';
        result.rows = rows;
        const l = rows.length;
        let i: number;
        for (i = 0; i < l; i++) {
          rows[i] = rowDecoder.decode(
            parsers,
            rows[i].data,
            rows[i].columnCount,
            options,
            resultFields,
          );
        }
      }
      if (suspended) result.suspended = true;
      if (reportsRowsAffected(result.command))
        result.rowsAffected = commandTag?.rowCount;
      if (timingEnabled) result.executeTime = performance.now() - startTime;
      return result;
    } finally {
      this.unref();
    }
  }

  /**
   * Parse+Describe(statement)+Sync as a single round trip - used by
   * PreparedStatement.prepare() instead of a separately-awaited Parse then
   * a separately-awaited Sync, and fetches the RowDescription/NoData in the
   * same round trip so the caller can cache it (see executeReused()) rather
   * than every later execute() re-Describing its own portal.
   */
  async prepareOnce(
    sql: string,
    paramTypes: Maybe<Maybe<OID>[]>,
    statementName: string,
  ): Promise<{ fields?: Protocol.RowDescription[] }> {
    this.assertConnected();
    this.ref();
    try {
      let fields: Protocol.RowDescription[] | undefined;
      let error: Error | undefined;

      this.runningQueryCount++;
      await this.socket
        .sendPrepareMessages(
          {
            parse: { statement: statementName, sql, paramTypes },
            describe: { type: 'S', name: statementName },
          },
          (
            code: Protocol.BackendMessageCode,
            msg: any,
            done: (err?: Error, result?: any) => void,
          ) => {
            switch (code) {
              case Protocol.BackendMessageCode.NoticeResponse:
                // Not an error: handed over, and the loop carries on.
                this.emit('notice', msg);
                break;
              case Protocol.BackendMessageCode.ParseComplete:
              case Protocol.BackendMessageCode.ParameterDescription:
              case Protocol.BackendMessageCode.NoData:
                break;
              case Protocol.BackendMessageCode.RowDescription:
                fields = msg.fields;
                break;
              case Protocol.BackendMessageCode.ErrorResponse:
                // See queryOnce()'s ErrorResponse case for why done() must
                // not be called here.
                error = msg;
                break;
              case Protocol.BackendMessageCode.ReadyForQuery:
                this.transactionStatus = msg.status;
                done(error);
                break;
              default:
                done(
                  new Error(
                    `Server returned unexpected response message (${String.fromCharCode(code)})`,
                  ),
                );
            }
          },
        )
        .finally(() => {
          this.runningQueryCount--;
        });

      return { fields };
    } finally {
      this.unref();
    }
  }

  /**
   * Bind+Execute+Sync as a single round trip against an unnamed portal, for
   * an already-prepared (named) statement - used by
   * PreparedStatement._execute()'s non-cursor path instead of the 4-round-
   * trip Portal.bind()/retrieveFields()/execute()/close() sequence. Takes
   * the RowDescription fields prepareOnce() already fetched instead of
   * re-Describing a fresh portal on every call.
   */
  /**
   * Parsers and wrapped field descriptions for a statement whose
   * RowDescription prepare() already fetched, memoised per RowDescription
   * so repeated executes of the same statement don't rebuild them.
   * Shared by executeReused() and executeBatchReused().
   */
  protected _resolveReusedParsers(
    cachedFields: Protocol.RowDescription[],
    typeMap: DataTypeMap,
    options: QueryOptions,
    columnFormat: Protocol.DataFormat | Protocol.DataFormat[],
  ): { parsers: AnyParseFunction[]; resultFields: FieldInfo[] } {
    const cached = this._executeReusedParserCache.get(cachedFields);
    if (
      cached &&
      cached.typeMap === typeMap &&
      columnFormatsEqual(cached.columnFormat, columnFormat) &&
      fetchAsStringEqual(cached.fetchAsString, options.fetchAsString)
    ) {
      return { parsers: cached.parsers, resultFields: cached.resultFields };
    }
    const fields = cachedFields.map((f, i) => ({
      ...f,
      format: Array.isArray(columnFormat) ? columnFormat[i] : columnFormat,
    }));
    const parsers = getParsers(typeMap, fields, options);
    const resultFields = wrapRowDescription(
      typeMap,
      fields,
      columnFormat,
      options,
    );
    this._executeReusedParserCache.set(cachedFields, {
      typeMap,
      columnFormat,
      fetchAsString: options.fetchAsString,
      parsers,
      resultFields,
    });
    return { parsers, resultFields };
  }

  /**
   * Executes one prepared statement once per parameter set, as a single
   * Bind/Execute stream closed by one Sync (see
   * PgSocket.sendBatchBindExecuteMessages() for the wire shape and what
   * the single Sync implies).
   *
   * Sets map to results positionally: the server answers each Execute with
   * its own CommandComplete, and rows that arrive before one belong to the
   * set it closes. When the server rejects a set, everything behind it is
   * discarded unexecuted - the completed prefix is attached to the thrown
   * error as `batchResults`, and the rejected set's index as `failedIndex`,
   * so a caller can tell how far the batch actually got.
   */
  /**
   * Runs several different statements as one Parse/Bind/Describe/Execute
   * stream closed by a single Sync (see PgSocket.sendPipelineMessages() for
   * the wire shape and what that framing implies).
   *
   * The counterpart to executeBatchReused(): that one runs a single
   * prepared statement over many parameter sets, this one runs many
   * statements once each. Results map to statements positionally - the
   * server answers each Execute with its own CommandComplete, and any rows
   * that arrive before one belong to the statement it closes.
   */
  async executePipeline(
    requests: { sql: string; params?: any[]; paramTypes?: Maybe<OID>[] }[],
    options: QueryOptions,
  ): Promise<QueryResult[]> {
    options = this._withMoneyFormat(options);
    this.assertConnected();
    this.ref();
    try {
      const typeMap = options.typeMap || GlobalTypeMap;
      const timingEnabled = options.timing ?? this.config.timing ?? false;
      const startTime = timingEnabled ? performance.now() : 0;
      const rowDecoder = resolveRowDecoder(options);

      const results: QueryResult[] = [];
      let pendingFields: Protocol.RowDescription[] | undefined;
      let pendingRows: any[] | undefined;
      const deferred: DeferredRows[] = [];
      let error: DatabaseError | undefined;

      // Plan every statement against the prepared statement cache before
      // writing anything: one that is already prepared binds to its name
      // and skips both Parse and Describe, one seen often enough earns a
      // name here, and the rest go out unnamed exactly as before.
      const prepareEnabled = options.prepare ?? this.config.prepare ?? true;
      const plans: PipelinePlan[] = [];
      const promotions: { key: string; plan: PipelinePlan }[] = [];
      const cachedKeys: string[] = [];
      const named = new Map<string, PipelinePlan>();
      const statements: {
        parse?: { sql: string; paramTypes?: Maybe<OID>[]; statement?: string };
        bind: any;
        describe?: { type: 'P' };
        execute: { fetchCount: number };
      }[] = [];
      for (const r of requests) {
        const key = prepareEnabled
          ? preparedCacheKey(r.sql, r.paramTypes)
          : undefined;
        // A repeat can only skip its own Parse if the statement it binds
        // to has a name. An unnamed one would be gone by now: any later
        // statement's Parse replaces it.
        let plan = key != null ? named.get(key) : undefined;
        let sendParse = !plan;
        let sendDescribe = !plan;
        if (!plan) {
          const cached = key != null ? this._preparedCache.get(key) : undefined;
          if (cached && key != null) {
            // Re-insert to mark it most recently used.
            this._preparedCache.delete(key);
            this._preparedCache.set(key, cached);
            cachedKeys.push(key);
            plan = { name: cached.name, fields: cached.fields };
            sendParse = false;
            sendDescribe = false;
          } else if (key != null && this._earnsAName(key)) {
            plan = { name: 'C_' + ++this._preparedCounter };
            promotions.push({ key, plan });
          } else {
            plan = {};
          }
          if (key != null && plan.name) named.set(key, plan);
        }
        // Only a statement whose columns are already known can carry
        // per-column codes; the rest fall back to asking for the whole row
        // as text, exactly as queryOnce() does and for the same reason.
        plan.columnFormat = plan.fields
          ? resolveColumnFormats(plan.fields, options, typeMap)
          : options.fetchAsString?.length || options.unknownTypesAsString
            ? DataFormat.text
            : options.columnFormat != null
              ? options.columnFormat
              : DEFAULT_COLUMN_FORMAT;
        plans.push(plan);
        statements.push({
          // Per statement, not per pipeline: the statements differ, so a
          // single shared list of parameter OIDs could only ever be right
          // for one of them.
          parse: sendParse
            ? { sql: r.sql, paramTypes: r.paramTypes, statement: plan.name }
            : undefined,
          bind: {
            typeMap,
            statement: plan.name,
            paramTypes: r.paramTypes,
            params: r.params,
            queryOptions: options,
            columnFormat: plan.columnFormat,
          },
          describe: sendDescribe ? { type: 'P' as const } : undefined,
          // Unlimited, never options.fetchCount: a suspended portal would
          // break the positional statement-to-result mapping.
          execute: { fetchCount: 0 },
        });
      }

      this.runningQueryCount++;
      try {
        await this.socket
          .sendPipelineMessages({ statements }, (code, msg: any, done) => {
            switch (code) {
              case Protocol.BackendMessageCode.NoticeResponse:
                // Not an error: handed over, and the loop carries on.
                this.emit('notice', msg);
                break;
              case Protocol.BackendMessageCode.ParseComplete:
              case Protocol.BackendMessageCode.BindComplete:
                break;
              case Protocol.BackendMessageCode.NoData:
                pendingFields = undefined;
                break;
              case Protocol.BackendMessageCode.RowDescription:
                pendingFields = msg.fields;
                break;
              case Protocol.BackendMessageCode.DataRow:
                (pendingRows || (pendingRows = [])).push(msg);
                break;
              case Protocol.BackendMessageCode.EmptyQueryResponse:
              case Protocol.BackendMessageCode.CommandComplete: {
                const plan = plans[results.length];
                // A statement bound to a cached name sent no Describe, so
                // its columns come from the cache entry instead; one being
                // prepared here records its RowDescription for the entry it
                // is about to become, and for any repeat behind it.
                if (pendingFields) plan.fields = pendingFields;
                const fields = pendingFields || plan.fields;
                const result: QueryResult = { command: msg?.command };
                if (fields) {
                  const { parsers, resultFields } = this._resolveReusedParsers(
                    fields,
                    typeMap,
                    options,
                    plan.columnFormat ?? DEFAULT_COLUMN_FORMAT,
                  );
                  result.fields = resultFields;
                  result.rowType = resolveRowType(options);
                  if (!result.command) result.command = 'SELECT';
                  const rows = pendingRows || [];
                  if (this.needsMoneyFormat(fields)) {
                    // Set aside: see _decodeDeferredRows().
                    result.rows = [];
                    deferred.push({
                      target: result,
                      raw: rows,
                      parsers,
                      fields: resultFields,
                    });
                  } else {
                    const l = rows.length;
                    let i: number;
                    for (i = 0; i < l; i++) {
                      rows[i] = rowDecoder.decode(
                        parsers,
                        rows[i].data,
                        rows[i].columnCount,
                        options,
                        resultFields,
                      );
                    }
                    result.rows = rows;
                  }
                }
                if (reportsRowsAffected(result.command))
                  result.rowsAffected = msg.rowCount;
                pendingFields = undefined;
                pendingRows = undefined;
                results.push(result);
                break;
              }
              case Protocol.BackendMessageCode.ErrorResponse:
                error = msg;
                break;
              case Protocol.BackendMessageCode.ReadyForQuery:
                this.transactionStatus = msg.status;
                done(error);
                break;
              default:
                done(
                  new Error(
                    `Server returned unexpected response message (${String.fromCharCode(code)})`,
                  ),
                );
            }
          })
          .catch((e: any) => {
            // The rejected statement is the one right after everything
            // that completed, since results only grow on CommandComplete.
            if (e instanceof DatabaseError && error === e)
              e.failedIndex = results.length;
            throw e;
          })
          .finally(() => {
            this.runningQueryCount--;
          });
      } catch (e: any) {
        // A cached statement can be invalidated between two pipelines the
        // same way a cached single query can - see isStaleCachedPlan().
        // Drop what this pipeline reused and run it again unprepared -
        // once, since the second attempt has nothing cached left to reuse.
        if (!isStaleCachedPlan(e) || !cachedKeys.length) throw e;
        for (const k of cachedKeys) this._preparedCache.delete(k);
        // Inside an explicit transaction there is nothing to retry into:
        // the failed statement has already aborted the block.
        if (this.inTransaction) throw e;
        return await this.executePipeline(requests, options);
      }

      // Only now, with every Parse answered, are the new names real.
      let promo: (typeof promotions)[number];
      let p: number;
      const promotionCount = promotions.length;
      for (p = 0; p < promotionCount; p++) {
        promo = promotions[p];
        await this._evictPreparedIfFull();
        this._preparedCache.set(promo.key, {
          name: promo.plan.name!,
          fields: promo.plan.fields,
        });
      }

      if (deferred.length)
        await this._decodeDeferredRows(deferred, rowDecoder, options);
      if (timingEnabled) {
        const elapsed = performance.now() - startTime;
        const l = results.length;
        let i: number;
        for (i = 0; i < l; i++) results[i].executeTime = elapsed;
      }
      return results;
    } finally {
      this.unref();
    }
  }

  async executeBatchReused(
    statementName: string,
    cachedFields: Protocol.RowDescription[] | undefined,
    paramTypes: Maybe<Maybe<OID>[]>,
    paramSets: Maybe<any>[][],
    options: QueryOptions,
  ): Promise<BatchResult> {
    options = this._withMoneyFormat(options);
    this.assertConnected();
    this.ref();
    try {
      const typeMap = options.typeMap || GlobalTypeMap;
      const timingEnabled = options.timing ?? this.config.timing ?? false;
      const startTime = timingEnabled ? performance.now() : 0;
      const rowDecoder = resolveRowDecoder(options);
      let parsers: AnyParseFunction[] | undefined;
      let resultFields: FieldInfo[] | undefined;
      const columnFormat = resolveColumnFormats(cachedFields, options, typeMap);
      if (cachedFields) {
        const resolved = this._resolveReusedParsers(
          cachedFields,
          typeMap,
          options,
          columnFormat,
        );
        parsers = resolved.parsers;
        resultFields = resolved.resultFields;
      }

      const results: BatchCommandResult[] = [];
      let pendingRows: any[] | undefined;
      let error: DatabaseError | undefined;

      const binds = paramSets.map(params => ({
        typeMap,
        statement: statementName,
        paramTypes,
        params,
        queryOptions: options,
        columnFormat,
      }));

      this.runningQueryCount++;
      await this.socket
        .sendBatchBindExecuteMessages(
          {
            binds,
            // Unlimited, never options.fetchCount: a suspended portal would
            // break the positional set-to-result mapping above.
            execute: { fetchCount: 0 },
          },
          (
            code: Protocol.BackendMessageCode,
            msg: any,
            done: (err?: Error, result?: any) => void,
          ) => {
            switch (code) {
              case Protocol.BackendMessageCode.NoticeResponse:
                // Not an error: handed over, and the loop carries on.
                this.emit('notice', msg);
                break;
              case Protocol.BackendMessageCode.BindComplete:
                break;
              case Protocol.BackendMessageCode.DataRow:
                (pendingRows || (pendingRows = [])).push(msg);
                break;
              case Protocol.BackendMessageCode.EmptyQueryResponse:
              case Protocol.BackendMessageCode.CommandComplete: {
                const item: BatchCommandResult = {};
                if (msg?.command) item.command = msg.command;
                if (reportsRowsAffected(item.command))
                  item.rowsAffected = msg.rowCount;
                if (pendingRows && parsers && resultFields) {
                  const l = pendingRows.length;
                  let i: number;
                  for (i = 0; i < l; i++) {
                    pendingRows[i] = rowDecoder.decode(
                      parsers,
                      pendingRows[i].data,
                      pendingRows[i].columnCount,
                      options,
                      resultFields,
                    );
                  }
                  item.rows = pendingRows;
                  if (!item.command) item.command = 'SELECT';
                }
                pendingRows = undefined;
                results.push(item);
                break;
              }
              case Protocol.BackendMessageCode.ErrorResponse:
                error = msg;
                break;
              case Protocol.BackendMessageCode.ReadyForQuery:
                this.transactionStatus = msg.status;
                done(error);
                break;
              default:
                done(
                  new Error(
                    `Server returned unexpected response message (${String.fromCharCode(code)})`,
                  ),
                );
            }
          },
        )
        .catch((e: any) => {
          // The rejected set is the one right after everything that
          // completed, since results only grow on CommandComplete.
          if (e instanceof DatabaseError && error === e) {
            e.failedIndex = results.length;
            e.batchResults = results;
          }
          throw e;
        })
        .finally(() => {
          this.runningQueryCount--;
        });

      let totalRowsAffected = 0;
      const l = results.length;
      let i: number;
      for (i = 0; i < l; i++) totalRowsAffected += results[i].rowsAffected || 0;
      const out: BatchResult = { results, totalRowsAffected };
      if (resultFields) out.fields = resultFields;
      if (timingEnabled) out.executeTime = performance.now() - startTime;
      return out;
    } finally {
      this.unref();
    }
  }

  async executeReused(
    statementName: string,
    cachedFields: Protocol.RowDescription[] | undefined,
    paramTypes: Maybe<Maybe<OID>[]>,
    params: Maybe<Maybe<any>[]>,
    options: QueryOptions,
    savepoint?: string,
  ): Promise<QueryResult> {
    options = this._withMoneyFormat(options);
    this.assertConnected();
    this.ref();
    try {
      const typeMap = options.typeMap || GlobalTypeMap;
      const timingEnabled = options.timing ?? this.config.timing ?? false;
      const startTime = timingEnabled ? performance.now() : 0;
      const result: QueryResult = { command: undefined };
      const rows: any[] = [];
      let parsers: AnyParseFunction[] | undefined;
      let resultFields: FieldInfo[] | undefined;
      let commandTag: Protocol.CommandCompleteMessage | undefined;
      let error: Error | undefined;
      let suspended = false;
      const rowDecoder = resolveRowDecoder(options);

      // The whole point of reusing a prepared statement here: its
      // RowDescription is already in hand, so fetchAsString's OID list can
      // become the per-column result format codes this Bind carries, with
      // no extra round trip to find out what the columns are.
      const columnFormat = resolveColumnFormats(cachedFields, options, typeMap);

      if (cachedFields) {
        const resolved = this._resolveReusedParsers(
          cachedFields,
          typeMap,
          options,
          columnFormat,
        );
        parsers = resolved.parsers;
        resultFields = resolved.resultFields;
        result.fields = resultFields;
        result.rowType = resolveRowType(options);
      }

      // The SAVEPOINT/RELEASE pair rollbackOnError needs travels with the
      // statement instead of costing a round trip each - see
      // PreparedStatement._withTransaction(), which hands the name down
      // rather than sending them itself.
      let leadingCommandTags = savepoint ? 1 : 0;

      this.runningQueryCount++;
      await this.socket
        .sendBindExecuteMessages(
          {
            bind: {
              typeMap,
              statement: statementName,
              paramTypes,
              params,
              queryOptions: options,
              columnFormat,
            },
            execute: { fetchCount: options.fetchCount ?? 0 },
            before: savepoint ? 'SAVEPOINT ' + savepoint : undefined,
            after: savepoint ? 'RELEASE ' + savepoint : undefined,
          },
          (
            code: Protocol.BackendMessageCode,
            msg: any,
            done: (err?: Error, result?: any) => void,
          ) => {
            switch (code) {
              case Protocol.BackendMessageCode.NoticeResponse:
                // Not an error: handed over, and the loop carries on.
                this.emit('notice', msg);
                break;
              case Protocol.BackendMessageCode.ParseComplete:
              case Protocol.BackendMessageCode.BindComplete:
                break;
              // See queryOnce() for what a suspended portal means here.
              case Protocol.BackendMessageCode.PortalSuspended:
                suspended = true;
                break;
              case Protocol.BackendMessageCode.DataRow:
                rows.push(msg);
                break;
              // See queryOnce() for why an empty statement lands here.
              case Protocol.BackendMessageCode.EmptyQueryResponse:
              case Protocol.BackendMessageCode.CommandComplete:
                // Three statements can answer here when a savepoint rides
                // along: SAVEPOINT's tag, then the caller's own, then
                // RELEASE's. Only the middle one describes what the caller
                // asked for.
                if (leadingCommandTags) leadingCommandTags--;
                else if (!commandTag) commandTag = msg || EMPTY_QUERY_TAG;
                break;
              case Protocol.BackendMessageCode.ErrorResponse:
                error = msg;
                break;
              case Protocol.BackendMessageCode.ReadyForQuery:
                this.transactionStatus = msg.status;
                done(error);
                break;
              default:
                done(
                  new Error(
                    `Server returned unexpected response message (${String.fromCharCode(code)})`,
                  ),
                );
            }
          },
        )
        .finally(() => {
          this.runningQueryCount--;
        });

      if (commandTag?.command) result.command = commandTag.command;
      // The rows are still raw here, so the one question money cannot
      // answer for itself can still be asked before they are read.
      if (this.needsMoneyFormat(resultFields)) {
        await this.ensureMoneyFormat();
        options = this._withMoneyFormat(options);
      }
      if (resultFields && parsers) {
        if (!result.command) result.command = 'SELECT';
        result.rows = rows;
        const l = rows.length;
        let i: number;
        for (i = 0; i < l; i++) {
          rows[i] = rowDecoder.decode(
            parsers,
            rows[i].data,
            rows[i].columnCount,
            options,
            resultFields,
          );
        }
      }
      if (suspended) result.suspended = true;
      if (reportsRowsAffected(result.command))
        result.rowsAffected = commandTag?.rowCount;
      if (timingEnabled) result.executeTime = performance.now() - startTime;
      return result;
    } finally {
      this.unref();
    }
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    const handled = super.emit(event, ...args);
    return this.owner ? this.owner.emit(event, ...args) || handled : handled;
  }

  /**
   * The slow half of enterWire(): either an exclusive statement, or an
   * ordinary one arriving while an exclusive statement holds the wire.
   *
   * The claim itself is synchronous on purpose. Each waiter wakes in its
   * own microtask and runs to its next `await` without interruption, so
   * re-reading `_wireLock` and assigning it in the same stretch is what
   * makes two waiters unable to both believe they took it.
   */
  protected async _enterWireQueued(exclusive: boolean): Promise<() => void> {
    while (this._wireLock) await this._wireLock;
    if (!exclusive) {
      this._wireUsers++;
      return this._releaseWire;
    }
    let unlock!: () => void;
    this._wireLock = new Promise<void>(resolve => (unlock = resolve));
    // Whatever was already in flight when the lock went up still has to
    // finish - the point of asking is not to be interleaved with it.
    if (this._wireUsers)
      await new Promise<void>(resolve =>
        (this._wireIdleWaiters || (this._wireIdleWaiters = [])).push(resolve),
      );
    this._wireUsers++;
    return () => {
      this._wireLock = undefined;
      this._releaseWire();
      unlock();
    };
  }

  /**
   * `options` carrying this connection's money format, so a money value
   * can be read against the scale the server actually uses.
   *
   * One shallow copy per statement, and only while the connection has
   * an answer to give: the alternative is handing the decoders a
   * connection they have no business knowing about. A caller that set
   * the format itself keeps it.
   */
  /**
   * Rows left raw because a money column's scale was not in yet.
   *
   * Two paths decode inside the message loop, where there is no longer
   * anywhere to ask the server anything: the Simple Query protocol and
   * a pipeline. Rather than read those against a scale nobody
   * confirmed, they set the rows aside and this reads them once the
   * loop is over and the question can be asked.
   */
  protected async _decodeDeferredRows(
    deferred: DeferredRows[],
    rowDecoder: RowDecoder,
    options: QueryOptions,
  ): Promise<QueryOptions> {
    await this.ensureMoneyFormat();
    const opts = this._withMoneyFormat(options);
    let d: DeferredRows;
    let i: number;
    let k: number;
    for (i = 0; i < deferred.length; i++) {
      d = deferred[i];
      const l = d.raw.length;
      const out = new Array(l);
      for (k = 0; k < l; k++)
        out[k] = rowDecoder.decode(
          d.parsers,
          d.raw[k].data,
          d.raw[k].columnCount,
          opts,
          d.fields,
        );
      d.target.rows = out;
    }
    return opts;
  }

  protected _withMoneyFormat<T extends DataMappingOptions>(options: T): T {
    return this._moneyFormat && !options.moneyFormat
      ? { ...options, moneyFormat: this._moneyFormat }
      : options;
  }

  protected _onError(err: Error): void {
    if (this.socket.state !== ConnectionState.READY) return;
    this.emit('error', err);
  }
}

export function getIntlConnection(connection: Connection): IntlConnection {
  return (connection as any)._intlCon as IntlConnection;
}
