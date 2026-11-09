import { GlobalTypeMap } from '../data-type-map.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import { Protocol } from '../protocol/protocol.js';
import type { Maybe } from '../types.js';
import type { Connection } from './connection.js';
import { getIntlConnection } from './intl-connection.js';
import type { PreparedStatement } from './prepared-statement.js';

/** What one Execute of a portal answered with. */
export interface PortalExecuteResult {
  /**
   * The message that ended it: CommandComplete when the rows ran out,
   * PortalSuspended when the fetch limit stopped it first.
   */
  code: Protocol.BackendMessageCode;
  /** The rows, still raw - the caller decodes them. */
  rows?: Protocol.DataRowMessage[];
  /** The command tag, when the portal ran to completion. */
  command?: string;
  /** What the tag reported, for the commands that report one. */
  rowCount?: number;
}

/**
 * One execution of a prepared statement, named on the server so it can
 * be executed a batch at a time.
 *
 * What a `Cursor` is built on: a portal holds the bound parameters and
 * the position in the result, so `execute()` can be called again for the
 * next batch. It lives inside the transaction that created it - implicit
 * or otherwise - and is gone when that ends.
 */
export class Portal {
  private readonly _statement: PreparedStatement;
  private readonly _name?: string;

  /**
   * @param statement The statement this portal binds.
   * @param name What the server will know the portal by.
   */
  constructor(statement: PreparedStatement, name: string) {
    this._statement = statement;
    this._name = name;
  }

  /** The connection the portal lives on. */
  get connection(): Connection {
    return this._statement.connection;
  }

  /** What the server knows this portal by. */
  get name(): Maybe<string> {
    return this._name;
  }

  /**
   * Bind + Describe(portal) collapsed into one round trip instead of two
   * separately-awaited calls. Ends in Flush, not Sync - a Sync here would
   * commit an implicit (autocommit) transaction and destroy this portal
   * before any fetch() could use it (proved live: Bind+Describe+Sync with
   * no explicit BEGIN left transactionStatus 'I' and a later Execute on the
   * same named portal failed with "portal ... does not exist").
   */
  async bindAndRetrieveFields(
    params: Maybe<any[]>,
    queryOptions: QueryOptions,
    columnFormat?: Protocol.DataFormat | Protocol.DataFormat[],
  ): Promise<Protocol.RowDescription[]> {
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      return await socket.sendBindDescribeMessages(
        {
          bind: {
            typeMap: queryOptions.typeMap || GlobalTypeMap,
            statement: this._statement.name,
            portal: this.name,
            paramTypes: this._statement.paramTypes,
            params,
            queryOptions,
            columnFormat,
          },
          describe: { type: 'P', name: this.name },
        },
        (
          code: Protocol.BackendMessageCode,
          msg: any,
          done: (err?: Error, result?: any) => void,
        ) => {
          switch (code) {
            case Protocol.BackendMessageCode.BindComplete:
            case Protocol.BackendMessageCode.NoticeResponse:
              break;
            case Protocol.BackendMessageCode.NoData:
              done();
              break;
            case Protocol.BackendMessageCode.RowDescription:
              done(undefined, msg.fields);
              break;
            case Protocol.BackendMessageCode.ErrorResponse:
              done(msg);
              break;
            default:
              done(
                new Error(
                  `Server returned unexpected response message (${String.fromCharCode(code)})`,
                ),
              );
          }
        },
      );
    } finally {
      intoCon.unref();
    }
  }

  /**
   * Runs the portal, for up to `fetchCount` rows.
   *
   * Called again for each batch: the result's `code` says which happened
   * - PortalSuspended when the limit stopped it and there is more,
   * CommandComplete when the rows ran out.
   *
   * @param fetchCount How many rows to ask for; every remaining row when
   * it is absent or zero.
   * @returns The raw rows and how the execution ended.
   * @throws DatabaseError When the server refuses it - `34000` when the
   * portal is gone, which is what another statement on the connection
   * does to it.
   */
  async execute(fetchCount?: number): Promise<PortalExecuteResult> {
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      const rows: any = [];
      const executePromise = socket.sendExecuteMessage(
        {
          portal: this.name,
          fetchCount: fetchCount ?? 100,
        },
        (
          code: Protocol.BackendMessageCode,
          msg: any,
          done: (err?: Error, result?: PortalExecuteResult) => void,
        ) => {
          switch (code) {
            case Protocol.BackendMessageCode.NoticeResponse:
              break;
            case Protocol.BackendMessageCode.NoData:
              done(undefined, { code });
              break;
            case Protocol.BackendMessageCode.DataRow:
              // msg is the whole DataRowMessage (columnCount + one raw
              // buffer for the whole row) - per-column boundary-finding
              // and decode now happens lazily in parseRow/get-parsers.ts
              // instead of eagerly here, so this can just pass it straight
              // through regardless of this._columnFormat's shape.
              rows.push(msg);
              break;
            case Protocol.BackendMessageCode.PortalSuspended:
              done(undefined, { code, rows });
              break;
            case Protocol.BackendMessageCode.CommandComplete:
              done(undefined, {
                code,
                rows,
                command: msg.command,
                rowCount: msg.rowCount,
              });
              break;
            case Protocol.BackendMessageCode.ErrorResponse:
              done(msg);
              break;
            default:
              done(
                new Error(
                  `Server returned unexpected response message (${String.fromCharCode(code)})`,
                ),
              );
          }
        },
      );
      socket.sendFlushMessage();
      return await executePromise;
    } finally {
      intoCon.unref();
    }
  }

  /**
   * Close + Sync as one request (see PgSocket.sendCloseAndSyncMessages()
   * for why they must share a single capture): ReadyForQuery is the end
   * marker, CloseComplete is informational on the way there. That also
   * makes this safe to call as cleanup after a failed Bind - the server is
   * in error state then, skips the Close entirely, and answers only the
   * Sync.
   */
  async close(): Promise<void> {
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      let error: Error | undefined;
      await socket.sendCloseAndSyncMessages(
        { type: 'P', name: this.name },
        (
          code: Protocol.BackendMessageCode,
          msg: any,
          done: (err?: Error) => void,
        ) => {
          switch (code) {
            case Protocol.BackendMessageCode.CloseComplete:
            case Protocol.BackendMessageCode.NoticeResponse:
              break;
            case Protocol.BackendMessageCode.ErrorResponse:
              // Deferred: only ReadyForQuery is guaranteed to arrive
              // exactly once, so done() waits for it.
              error = msg;
              break;
            case Protocol.BackendMessageCode.ReadyForQuery:
              intoCon.transactionStatus = msg.status;
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
      );
    } finally {
      intoCon.unref();
    }
  }
}
