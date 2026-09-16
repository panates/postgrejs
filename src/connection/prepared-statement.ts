import { DEFAULT_COLUMN_FORMAT } from '../constants.js';
import { GlobalTypeMap } from '../data-type-map.js';
import type { BatchResult } from '../interfaces/batch-result.js';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import type { QueryResult } from '../interfaces/query-result.js';
import type { StatementPrepareOptions } from '../interfaces/statement-prepare-options.js';
import { Protocol } from '../protocol/protocol.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import type { AnyParseFunction, Maybe, OID } from '../types.js';
import { withAbortSignal } from '../util/abort-signal.js';
import { getParsers } from '../util/get-parsers.js';
import { resolveRowType } from '../util/row-decoder.js';
import { wrapRowDescription } from '../util/wrap-row-description.js';
import type { Connection } from './connection.js';
import { Cursor } from './cursor.js';
import { getIntlConnection } from './intl-connection.js';
import { Portal } from './portal.js';

let statementCounter = 0;
let portalCounter = 0;

export class PreparedStatement
  extends SafeEventEmitter
  implements AsyncDisposable
{
  private readonly _connection: Connection;
  private readonly _sql: string = '';
  private readonly _name: string = '';
  private readonly _paramTypes?: Maybe<OID>[];
  private _fields?: Protocol.RowDescription[];
  protected _onErrorSavePoint: string;
  private _refCount = 0;
  private _closed = false;

  constructor(connection: Connection, sql: string, paramTypes?: OID[]) {
    super();
    this._connection = connection;
    this._name = 'S_' + ++statementCounter;
    this._sql = sql;
    this._paramTypes = paramTypes;
    this._onErrorSavePoint = 'SP_' + Math.round(Math.random() * 100000000);
  }

  static async prepare(
    connection: Connection,
    sql: string,
    options?: StatementPrepareOptions,
  ): Promise<PreparedStatement> {
    const intoCon = getIntlConnection(connection);
    intoCon.assertConnected();
    const statement = new PreparedStatement(
      connection,
      sql,
      options?.paramTypes,
    );
    const { fields } = await intoCon.prepareOnce(
      sql,
      statement.paramTypes,
      statement.name!,
    );
    statement._fields = fields;
    statement._refCount = 1;
    return statement;
  }

  get connection(): Connection {
    return this._connection;
  }

  get name(): Maybe<string> {
    return this._name;
  }

  get sql(): string {
    return this._sql;
  }

  get paramTypes(): Maybe<Maybe<OID>[]> {
    return this._paramTypes;
  }

  async execute(options: QueryOptions = {}): Promise<QueryResult> {
    const intlCon = getIntlConnection(this.connection);
    if (options.signal)
      return withAbortSignal(
        options.signal,
        () => intlCon.cancel(),
        () => this._executeWithTransaction(options),
      );
    return this._executeWithTransaction(options);
  }

  /**
   * Runs this statement once per parameter set, sending every Bind/Execute
   * before waiting for any of them and closing the lot with a single Sync.
   *
   * ```ts
   * const st = await connection.prepare('update users set name = $1 where id = $2');
   * const batch = await st.executeBatch([
   *   ['John', 1],
   *   ['Jane', 2],
   *   ['Bob', 3],
   * ]);
   * batch.results.map(r => r.rowsAffected); // [1, 1, 0]
   * batch.totalRowsAffected;                // 2
   * ```
   *
   * Three things follow from the single Sync, and they are the reasons to
   * reach for this over a loop or a Promise.all() of execute() calls:
   *
   * - **Speed.** Per-set Sync makes the server close an implicit
   *   transaction and answer ReadyForQuery every time. Collapsing that to
   *   one turned 1000 updates from 194ms (pipelined execute() calls) into
   *   21ms locally, with socket reads dropping from 972 to 3.
   * - **One transaction.** Unless an explicit transaction is already open,
   *   the whole batch commits or rolls back together. This differs from N
   *   separate execute() calls, where each commits on its own.
   * - **A failing set stops the rest.** PostgreSQL discards everything
   *   between an error and the Sync, so sets after a rejected one never
   *   run. The error carries `failedIndex` (which set was rejected) and
   *   `batchResults` (the ones that had completed) so the caller can see
   *   how far it got.
   *
   * Every set runs the same statement, so results map to sets by position.
   * Sets that return rows get them decoded into `rows` exactly as
   * `execute()` would, `rowDecoder` included; `fetchCount` does not apply,
   * since a portal suspended mid-batch would break that mapping - each set
   * runs to completion and buffers its rows.
   *
   * For a bulk INSERT specifically, `connection.copyFrom()` is faster
   * still, and a single `UPDATE ... FROM (VALUES ...)` beats this for bulk
   * updates of one shape - at the cost of PostgreSQL's 65535-parameter
   * ceiling. This is the general answer when neither fits.
   *
   * @param paramSets One array of bind parameters per execution.
   * @param options Applied to every set - the same options `execute()`
   *   takes, minus `fetchCount` and `cursor`, which a batch cannot honour.
   */
  async executeBatch(
    paramSets: any[][],
    options: QueryOptions = {},
  ): Promise<BatchResult> {
    if (!Array.isArray(paramSets))
      throw new TypeError('executeBatch() requires an array of parameter sets');
    if (options.cursor)
      throw new Error(
        'executeBatch() cannot return a cursor - a batch runs every set to ' +
          'completion under one Sync, so there is no portal left to fetch from',
      );
    const intlCon = getIntlConnection(this.connection);
    if (!paramSets.length) return { results: [], totalRowsAffected: 0 };
    if (options.signal)
      return withAbortSignal(
        options.signal,
        () => intlCon.cancel(),
        () => this._executeBatchWithTransaction(paramSets, options),
      );
    return this._executeBatchWithTransaction(paramSets, options);
  }

  protected _executeBatchWithTransaction(
    paramSets: any[][],
    options: QueryOptions,
  ): Promise<BatchResult> {
    const intlCon = getIntlConnection(this.connection);
    return this._withTransaction(options, () =>
      intlCon.executeBatchReused(
        this.name!,
        this._fields,
        this.paramTypes,
        paramSets,
        options,
      ),
    );
  }

  protected async _executeWithTransaction(
    options: QueryOptions = {},
  ): Promise<QueryResult> {
    return this._withTransaction(options, () => this._execute(options));
  }

  /**
   * Runs `fn` inside whatever transaction handling the connection's config
   * and `options` call for: an implicit BEGIN when autoCommit is off, a
   * SAVEPOINT to roll back to when one is already open, a COMMIT when the
   * call is the one turning autoCommit back on.
   *
   * Generic over `fn` rather than calling _execute() directly so that
   * executeBatch() gets the same handling for the batch as a whole. Per
   * set would be wrong twice over: the savepoints alone would add two
   * statements per set, and the batch already shares one transaction by
   * virtue of its single Sync, so a per-set savepoint could not roll one
   * set back independently anyway.
   */
  protected async _withTransaction<T>(
    options: QueryOptions = {},
    fn: () => Promise<T>,
  ): Promise<T> {
    const intlCon = getIntlConnection(this.connection);

    const transactionCommand = this.sql.match(
      /^(\bBEGIN\b|\bCOMMIT\b|\bSTART\b|\bROLLBACK|SAVEPOINT|RELEASE\b)/i,
    );
    let beginFirst = false;
    let commitLast = false;
    const autoCommit = options?.autoCommit;
    if (!transactionCommand) {
      if (
        (autoCommit != null ? autoCommit : intlCon.config.autoCommit) ===
          false &&
        !intlCon.inTransaction
      ) {
        beginFirst = true;
      }
      if (autoCommit && intlCon.inTransaction) commitLast = true;
    }
    if (beginFirst) await intlCon.execute('BEGIN');

    // See IntlConnection.execute()'s own rollbackOnError for why
    // intlCon.inTransaction goes first here but last in the checks below.
    const rollbackOnError =
      !transactionCommand &&
      intlCon.inTransaction &&
      (options?.rollbackOnError ?? intlCon.config.rollbackOnError ?? true);

    if (rollbackOnError && intlCon.inTransaction)
      await intlCon.execute('SAVEPOINT ' + this._onErrorSavePoint);
    try {
      const result = await fn();
      if (commitLast) await intlCon.execute('COMMIT');
      else if (rollbackOnError && intlCon.inTransaction) {
        await intlCon.execute('RELEASE ' + this._onErrorSavePoint + ';');
      }
      return result;
    } catch (e: any) {
      if (rollbackOnError && intlCon.inTransaction) {
        await intlCon.execute('ROLLBACK TO ' + this._onErrorSavePoint + ';');
      }
      throw e;
    }
  }

  async close(): Promise<void> {
    if (this._closed) return;
    --this._refCount;
    if (this._refCount > 0) return;
    this._closed = true;
    await this._close();
  }

  /**
   * Asks the server to cancel whatever this statement's connection is
   * currently running. See Connection.cancel(); prefer the per-call `signal`
   * option, which reports the abort to the caller that asked for it.
   */
  async cancel(): Promise<void> {
    return getIntlConnection(this.connection).cancel();
  }

  protected async _execute(options: QueryOptions = {}): Promise<QueryResult> {
    const intlCon = getIntlConnection(this.connection);
    if (options.cursor && this._fields) {
      intlCon.ref();
      let portal: Maybe<Portal> = new Portal(this, 'P_' + ++portalCounter);
      try {
        const fields = await portal.bindAndRetrieveFields(
          options.params,
          options,
        );
        const typeMap = options.typeMap || GlobalTypeMap;
        const parsers: AnyParseFunction[] = getParsers(typeMap, fields);
        const resultFields: FieldInfo[] = wrapRowDescription(
          typeMap,
          fields,
          options.columnFormat || DEFAULT_COLUMN_FORMAT,
        );
        const result: QueryResult = {
          command: undefined,
          fields: resultFields,
          rowType: resolveRowType(options),
          cursor: new Cursor(this, portal, resultFields, parsers, options),
        };
        this._refCount++;
        portal = undefined;
        return result;
      } finally {
        intlCon.unref();
        if (portal) await portal.close().catch(() => undefined);
      }
    }

    // Non-cursor path: Bind+Execute+Sync as a single round trip against an
    // unnamed portal, reusing the RowDescription prepare() already fetched
    // instead of re-Describing (and re-Close-ing) a fresh named portal on
    // every call.
    return intlCon.executeReused(
      this.name!,
      this._fields,
      this.paramTypes,
      options.params,
      options,
    );
  }

  /**
   * Called by Cursor.close() instead of separately awaiting
   * Portal.close() then this.close(). Returns false (no wire action taken,
   * caller must still close just the portal itself) when either this
   * statement was already fully closed by someone else (mirrors close()'s
   * own `if (this._closed) return;` idempotency guard - re-sending
   * Close(statement) for an already-closed name would error) or the
   * decremented refcount is still > 0 (statement still referenced
   * elsewhere - e.g. another cursor from the same PreparedStatement, or
   * the statement's own +1 from prepare()). Returns true only when it
   * actually performed the combined Close(portal)+Close(statement)+Sync.
   */
  async _maybeCloseWithPortal(portalName: string): Promise<boolean> {
    if (this._closed) return false;
    --this._refCount;
    if (this._refCount > 0) return false;
    this._closed = true;
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      let error: Error | undefined;
      await socket.sendClosePortalAndStatementMessages(
        {
          portal: { type: 'P', name: portalName },
          statement: { type: 'S', name: this.name },
        },
        (
          code: Protocol.BackendMessageCode,
          msg: any,
          done: (err?: Error) => void,
        ) => {
          switch (code) {
            case Protocol.BackendMessageCode.NoticeResponse:
              this.emit('notice', msg);
              break;
            case Protocol.BackendMessageCode.CloseComplete:
              // Arrives twice (once per Close) - neither call is terminal.
              break;
            case Protocol.BackendMessageCode.ErrorResponse:
              error = msg;
              break;
            case Protocol.BackendMessageCode.ReadyForQuery:
              intoCon.transactionStatus = msg.status;
              done(error);
              break;
            default:
              done(
                new Error(
                  `Server returned unexpected response message (0x${code.toString(16)})`,
                ),
              );
          }
        },
      );
    } finally {
      intoCon.unref();
    }
    this.emit('close');
    return true;
  }

  protected async _close(): Promise<void> {
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      const closePromise = socket.sendCloseMessage(
        { type: 'S', name: this.name },
        (
          code: Protocol.BackendMessageCode,
          msg: any,
          done: (err?: Error) => void,
        ) => {
          switch (code) {
            case Protocol.BackendMessageCode.NoticeResponse:
              this.emit('notice', msg);
              break;
            case Protocol.BackendMessageCode.CloseComplete:
              done();
              break;
            case Protocol.BackendMessageCode.ErrorResponse:
              done(msg);
              break;
            default:
              done(
                new Error(
                  `Server returned unexpected response message (0x${code.toString(16)})`,
                ),
              );
          }
        },
      );
      const syncPromise = socket.sendSyncMessage(
        (
          code: Protocol.BackendMessageCode,
          msg: any,
          done: (err?: Error) => void,
        ) => {
          switch (code) {
            case Protocol.BackendMessageCode.NoticeResponse:
              this.emit('notice', msg);
              break;
            case Protocol.BackendMessageCode.ReadyForQuery:
              intoCon.transactionStatus = msg.status;
              done();
              break;
            case Protocol.BackendMessageCode.ErrorResponse:
              done(msg);
              break;
            default:
              done(
                new Error(
                  `Server returned unexpected response message (0x${code.toString(16)})`,
                ),
              );
          }
        },
      );
      await Promise.all([closePromise, syncPromise]);
    } finally {
      intoCon.unref();
    }
    this.emit('close');
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
