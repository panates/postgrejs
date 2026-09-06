import { GlobalTypeMap } from '../data-type-map.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import { Protocol } from '../protocol/protocol.js';
import type { Maybe } from '../types.js';
import type { Connection } from './connection.js';
import { getIntlConnection } from './intl-connection.js';
import type { PreparedStatement } from './prepared-statement.js';

export interface PortalExecuteResult {
  code: Protocol.BackendMessageCode;
  rows?: Protocol.DataRowMessage[];
  command?: string;
  rowCount?: number;
}

export class Portal {
  private readonly _statement: PreparedStatement;
  private readonly _name?: string;

  constructor(statement: PreparedStatement, name: string) {
    this._statement = statement;
    this._name = name;
  }

  get connection(): Connection {
    return this._statement.connection;
  }

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

  async execute(fetchCount?: number): Promise<PortalExecuteResult> {
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      const rows: any = [];
      const executePromise = socket.sendExecuteMessage(
        {
          portal: this.name,
          fetchCount: fetchCount || 100,
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
