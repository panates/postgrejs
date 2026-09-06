import { coerceToBoolean } from 'putil-varhelpers';
import { ConnectionState, DEFAULT_COLUMN_FORMAT } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import { GlobalTypeMap } from '../data-type-map.js';
import type { CommandResult } from '../interfaces/command-result.js';
import type { ConnectionConfiguration } from '../interfaces/database-connection-params.js';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import type { QueryResult } from '../interfaces/query-result.js';
import type { ScriptExecuteOptions } from '../interfaces/script-execute-options.js';
import type { ScriptResult } from '../interfaces/script-result.js';
import { PgSocket } from '../protocol/pg-socket.js';
import { Protocol } from '../protocol/protocol.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import type { AnyParseFunction, Maybe, OID } from '../types.js';
import { getConnectionConfig } from '../util/connection-config.js';
import { escapeLiteral } from '../util/escape-literal.js';
import { getParsers } from '../util/get-parsers.js';
import { parseObjectRow, parseRow } from '../util/parse-row.js';
import { wrapRowDescription } from '../util/wrap-row-description.js';
import type { Connection } from './connection.js';
import { CopyFromStream, CopyToStream } from './copy-stream.js';

const DataFormat = Protocol.DataFormat;

interface ExecuteReusedParserCacheEntry {
  typeMap: DataTypeMap;
  columnFormat: Protocol.DataFormat | Protocol.DataFormat[];
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

export class IntlConnection extends SafeEventEmitter {
  private _executeReusedParserCache = new WeakMap<
    Protocol.RowDescription[],
    ExecuteReusedParserCacheEntry
  >();
  protected _refCount = 0;
  protected _config: ConnectionConfiguration;
  protected _onErrorSavePoint: string;
  transactionStatus = 'I';
  socket: PgSocket;
  owner?: SafeEventEmitter;
  runningQueryCount: number = 0;

  constructor(config?: ConnectionConfiguration | string) {
    super();
    this._config = Object.freeze(getConnectionConfig(config));
    this.socket = new PgSocket(this._config);
    this.socket.on('error', err => this._onError(err));
    this.socket.on('close', () => this.emit('close'));
    this.socket.on('notification', payload =>
      this.emit('notification', payload),
    );
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

  get secretKey(): Maybe<number> {
    return this.socket.secretKey;
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
      this.socket.once('close', resolve);
      this.socket.sendTerminateMessage(() => {
        this.socket.close();
        this.emit('close');
      });
    });
  }

  async execute(
    sql: string,
    options?: ScriptExecuteOptions,
    cb?: (event: string, ...args: any[]) => void,
  ): Promise<ScriptResult> {
    this.assertConnected();
    const transactionCommand = sql.match(
      /^(\bBEGIN\b|\bCOMMIT\b|\bSTART\b|\bROLLBACK|SAVEPOINT|RELEASE\b)/i,
    );
    let beginFirst = false;
    let commitLast = false;
    if (!transactionCommand) {
      if (
        !this.inTransaction &&
        (options?.autoCommit != null
          ? options?.autoCommit
          : this.config.autoCommit) === false
      ) {
        beginFirst = true;
      }
      if (this.inTransaction && options?.autoCommit) commitLast = true;
    }
    if (beginFirst) await this._execute('BEGIN');

    const rollbackOnError =
      !transactionCommand &&
      (options?.rollbackOnError != null
        ? options.rollbackOnError
        : coerceToBoolean(this.config.rollbackOnError, true));

    if (this.inTransaction && rollbackOnError)
      await this._execute('SAVEPOINT ' + this._onErrorSavePoint);
    try {
      const result = await this._execute(sql, options, cb);
      if (commitLast) await this._execute('COMMIT');
      else if (this.inTransaction && rollbackOnError) {
        await this._execute('RELEASE ' + this._onErrorSavePoint + ';');
      }
      return result;
    } catch (e: any) {
      if (this.inTransaction && rollbackOnError)
        await this._execute('ROLLBACK TO ' + this._onErrorSavePoint + ';');
      throw e;
    }
  }

  async startTransaction(): Promise<void> {
    if (!this.inTransaction) await this.execute('BEGIN');
  }

  async savepoint(name: string): Promise<void> {
    if (!(name && name.match(/^[a-zA-Z]\w+$/)))
      throw new Error(`Invalid savepoint "${name}`);
    await this.execute('BEGIN; SAVEPOINT ' + name);
  }

  async commit(): Promise<void> {
    if (this.inTransaction) await this.execute('COMMIT');
  }

  async rollback(): Promise<void> {
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
   */
  async prepareTransaction(name: string): Promise<void> {
    await this._execute('PREPARE TRANSACTION ' + escapeLiteral(name));
  }

  /** Commits a transaction left waiting by prepareTransaction(). */
  async commitPrepared(name: string): Promise<void> {
    await this._execute('COMMIT PREPARED ' + escapeLiteral(name));
  }

  /** Discards a transaction left waiting by prepareTransaction(). */
  async rollbackPrepared(name: string): Promise<void> {
    await this._execute('ROLLBACK PREPARED ' + escapeLiteral(name));
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    if (!(name && name.match(/^[a-zA-Z]\w+$/)))
      throw new Error(`Invalid savepoint "${name}`);
    await this.execute('ROLLBACK TO SAVEPOINT ' + name, { autoCommit: false });
  }

  async releaseSavepoint(name: string): Promise<void> {
    if (!(name && name.match(/^[a-zA-Z]\w+$/)))
      throw new Error(`Invalid savepoint "${name}`);
    await this.execute('RELEASE SAVEPOINT ' + name, { autoCommit: false });
  }

  /** Asks the server to cancel whatever this session is running. */
  cancel(): Promise<void> {
    return this.socket.cancel();
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
    // Held open until ReadyForQuery, which the stream's own capture waits
    // for before ending - so the connection is never handed back (nor
    // reported idle to a pool) while the copy is still running.
    this.socket
      .sendQueryMessage(sql, stream.capture)
      // The stream, not this promise, is where a copy reports itself - but
      // a failure that never reaches the message flow at all (a dead
      // socket) would otherwise leave waitStarted() hanging forever.
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
    options?: ScriptExecuteOptions,
    cb?: (event: string, ...args: any[]) => void,
  ): Promise<ScriptResult> {
    this.ref();
    try {
      const startTime = Date.now();
      const result: ScriptResult = {
        totalCommands: 0,
        totalTime: 0,
        results: [],
      };
      const opts = options || {};
      let currentStart = Date.now();
      let parsers: AnyParseFunction[] | undefined;
      let current: CommandResult = { command: undefined };
      let fields: Protocol.RowDescription[];
      let error: Error | undefined;
      const typeMap = opts.typeMap || GlobalTypeMap;
      this.runningQueryCount++;
      return await this.socket.sendQueryMessage(
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
              // The server is now waiting for data this path has no way to
              // send, so it would wait forever. CopyFail gets it out of
              // copy-in mode; the caller gets told what to use instead.
              error =
                error ||
                new Error(
                  'COPY FROM STDIN is not supported by execute() - use copyFrom() instead',
                );
              this.socket.sendCopyFail(error.message);
              break;
            case Protocol.BackendMessageCode.CopyOutResponse:
              // Harmless to keep reading (the rows are simply dropped), but
              // silently returning an empty result would be worse than
              // saying so.
              error =
                error ||
                new Error(
                  'COPY TO STDOUT is not supported by execute() - use copyTo() instead',
                );
              break;
            case Protocol.BackendMessageCode.NoticeResponse:
            case Protocol.BackendMessageCode.EmptyQueryResponse:
              break;
            case Protocol.BackendMessageCode.RowDescription:
              fields = msg.fields;
              parsers = getParsers(typeMap, fields);
              current.fields = wrapRowDescription(
                typeMap,
                fields,
                DataFormat.text,
              );
              current.rows = [];
              break;
            case Protocol.BackendMessageCode.DataRow:
              {
                const row: any =
                  opts.objectRows && current.fields
                    ? parseObjectRow(
                        parsers!,
                        msg.data,
                        msg.columnCount,
                        opts,
                        current.fields,
                      )
                    : parseRow(parsers!, msg.data, msg.columnCount, opts);
                if (cb) cb('row', row);
                current.rows = current.rows || [];
                current.rows.push(row);
              }
              break;
            case Protocol.BackendMessageCode.CommandComplete:
              // Ignore BEGIN command that we added to sql
              current.command = msg.command;
              if (
                current.command === 'DELETE' ||
                current.command === 'INSERT' ||
                current.command === 'UPDATE'
              ) {
                current.rowsAffected = msg.rowCount;
              }
              current.executeTime = Date.now() - currentStart;
              if (current.rows)
                current.rowType =
                  opts.objectRows && current.fields ? 'object' : 'array';
              result.results.push(current);
              if (cb) cb('command-complete', current);
              current = { command: undefined };
              currentStart = Date.now();
              break;
            case Protocol.BackendMessageCode.ReadyForQuery:
              this.transactionStatus = msg.status;
              if (error) {
                done(error);
                break;
              }
              result.totalTime = Date.now() - startTime;
              // Ignore COMMIT command that we added to sql
              result.totalCommands = result.results.length;
              done(undefined, result);
              break;
            default:
              break;
          }
        },
      );
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
  async queryOnce(
    sql: string,
    paramTypes: Maybe<Maybe<OID>[]>,
    params: Maybe<Maybe<any>[]>,
    options: QueryOptions,
  ): Promise<QueryResult> {
    this.assertConnected();
    this.ref();
    try {
      const typeMap = options.typeMap || GlobalTypeMap;
      const startTime = Date.now();
      const result: QueryResult = { command: undefined };
      const rows: any[] = [];
      let parsers: AnyParseFunction[] | undefined;
      let resultFields: FieldInfo[] | undefined;
      let commandTag: Protocol.CommandCompleteMessage | undefined;
      let error: Error | undefined;

      this.runningQueryCount++;
      await this.socket
        .sendExtendedQueryMessages(
          {
            parse: { sql, paramTypes },
            bind: { typeMap, paramTypes, params, queryOptions: options },
            describe: { type: 'P' },
            execute: { fetchCount: options.fetchCount || 100 },
          },
          (
            code: Protocol.BackendMessageCode,
            msg: any,
            done: (err?: Error, result?: any) => void,
          ) => {
            switch (code) {
              case Protocol.BackendMessageCode.ParseComplete:
              case Protocol.BackendMessageCode.BindComplete:
              case Protocol.BackendMessageCode.NoData:
              case Protocol.BackendMessageCode.NoticeResponse:
              case Protocol.BackendMessageCode.PortalSuspended:
                break;
              case Protocol.BackendMessageCode.RowDescription:
                parsers = getParsers(typeMap, msg.fields);
                resultFields = wrapRowDescription(
                  typeMap,
                  msg.fields,
                  options.columnFormat || DEFAULT_COLUMN_FORMAT,
                );
                result.fields = resultFields;
                result.rowType = options.objectRows ? 'object' : 'array';
                break;
              case Protocol.BackendMessageCode.DataRow:
                rows.push(msg);
                break;
              case Protocol.BackendMessageCode.CommandComplete:
                // Deferred, like ErrorResponse below - only ReadyForQuery is
                // guaranteed to arrive exactly once, so done() waits for it.
                commandTag = msg;
                break;
              case Protocol.BackendMessageCode.ErrorResponse:
                // See _execute()'s ErrorResponse case above for why done()
                // must not be called here.
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
      if (resultFields && parsers) {
        if (!result.command) result.command = 'SELECT';
        result.rows = rows;
        const l = rows.length;
        let i: number;
        for (i = 0; i < l; i++) {
          rows[i] = options.objectRows
            ? parseObjectRow(
                parsers,
                rows[i].data,
                rows[i].columnCount,
                options,
                resultFields,
              )
            : parseRow(parsers, rows[i].data, rows[i].columnCount, options);
        }
      }
      if (
        result.command === 'DELETE' ||
        result.command === 'INSERT' ||
        result.command === 'UPDATE'
      ) {
        result.rowsAffected = commandTag?.rowCount;
      }
      result.executeTime = Date.now() - startTime;
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
              case Protocol.BackendMessageCode.ParseComplete:
              case Protocol.BackendMessageCode.ParameterDescription:
              case Protocol.BackendMessageCode.NoData:
              case Protocol.BackendMessageCode.NoticeResponse:
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
  async executeReused(
    statementName: string,
    cachedFields: Protocol.RowDescription[] | undefined,
    paramTypes: Maybe<Maybe<OID>[]>,
    params: Maybe<Maybe<any>[]>,
    options: QueryOptions,
  ): Promise<QueryResult> {
    this.assertConnected();
    this.ref();
    try {
      const typeMap = options.typeMap || GlobalTypeMap;
      const startTime = Date.now();
      const result: QueryResult = { command: undefined };
      const rows: any[] = [];
      let parsers: AnyParseFunction[] | undefined;
      let resultFields: FieldInfo[] | undefined;
      let commandTag: Protocol.CommandCompleteMessage | undefined;
      let error: Error | undefined;

      if (cachedFields) {
        // A statement-level Describe (done once in prepareOnce()) always
        // reports format 0 (text) for every column, regardless of what a
        // later Bind actually requests - get-parsers.ts picks decodeBinary
        // vs decodeText by reading each field's own .format, so the cached
        // fields must be patched to the format THIS call is actually
        // requesting before parser selection, or a binary-format execute()
        // on a reused statement would silently pick the text parser (or
        // vice versa) and decode garbage instead of throwing.
        const columnFormat =
          options.columnFormat != null
            ? options.columnFormat
            : DEFAULT_COLUMN_FORMAT;
        // Repeated execute()s of the same prepared statement overwhelmingly
        // reuse the same (typeMap, columnFormat) pair - only rebuild the
        // patched fields/parsers/resultFields when either actually changed
        // from the last execute() of THIS statement, instead of on every
        // single call regardless.
        const cached = this._executeReusedParserCache.get(cachedFields);
        if (
          cached &&
          cached.typeMap === typeMap &&
          columnFormatsEqual(cached.columnFormat, columnFormat)
        ) {
          parsers = cached.parsers;
          resultFields = cached.resultFields;
        } else {
          const fields = cachedFields.map((f, i) => ({
            ...f,
            format: Array.isArray(columnFormat)
              ? columnFormat[i]
              : columnFormat,
          }));
          parsers = getParsers(typeMap, fields);
          resultFields = wrapRowDescription(typeMap, fields, columnFormat);
          this._executeReusedParserCache.set(cachedFields, {
            typeMap,
            columnFormat,
            parsers,
            resultFields,
          });
        }
        result.fields = resultFields;
        result.rowType = options.objectRows ? 'object' : 'array';
      }

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
            },
            execute: { fetchCount: options.fetchCount || 100 },
          },
          (
            code: Protocol.BackendMessageCode,
            msg: any,
            done: (err?: Error, result?: any) => void,
          ) => {
            switch (code) {
              case Protocol.BackendMessageCode.BindComplete:
              case Protocol.BackendMessageCode.NoticeResponse:
              case Protocol.BackendMessageCode.PortalSuspended:
                break;
              case Protocol.BackendMessageCode.DataRow:
                rows.push(msg);
                break;
              case Protocol.BackendMessageCode.CommandComplete:
                // Deferred, like ErrorResponse below - only ReadyForQuery is
                // guaranteed to arrive exactly once, so done() waits for it.
                commandTag = msg;
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
      if (resultFields && parsers) {
        if (!result.command) result.command = 'SELECT';
        result.rows = rows;
        const l = rows.length;
        let i: number;
        for (i = 0; i < l; i++) {
          rows[i] = options.objectRows
            ? parseObjectRow(
                parsers,
                rows[i].data,
                rows[i].columnCount,
                options,
                resultFields,
              )
            : parseRow(parsers, rows[i].data, rows[i].columnCount, options);
        }
      }
      if (
        result.command === 'DELETE' ||
        result.command === 'INSERT' ||
        result.command === 'UPDATE'
      ) {
        result.rowsAffected = commandTag?.rowCount;
      }
      result.executeTime = Date.now() - startTime;
      return result;
    } finally {
      this.unref();
    }
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    const handled = super.emit(event, ...args);
    return this.owner ? this.owner.emit(event, ...args) || handled : handled;
  }

  protected _onError(err: Error): void {
    if (this.socket.state !== ConnectionState.READY) return;
    this.emit('error', err);
  }
}

export function getIntlConnection(connection: Connection): IntlConnection {
  return (connection as any)._intlCon as IntlConnection;
}
