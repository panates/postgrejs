import { DEFAULT_COLUMN_FORMAT } from '../constants.js';
import { GlobalTypeMap } from '../data-type-map.js';
import { QueryOptions } from '../interfaces/query-options.js';
import { Protocol } from '../protocol/protocol.js';
import { Maybe } from '../types.js';
import { Connection } from './connection.js';
import { getIntlConnection } from './intl-connection.js';
import type { PreparedStatement } from './prepared-statement.js';

export interface PortalExecuteResult {
  code: Protocol.BackendMessageCode;
  rows?: any[];
  command?: string;
  rowCount?: number;
}

export class Portal {
  private readonly _statement: PreparedStatement;
  private readonly _name?: string;
  private _columnFormat: Protocol.DataFormat | Protocol.DataFormat[] = DEFAULT_COLUMN_FORMAT;

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

  async bind(params: Maybe<any[]>, queryOptions: QueryOptions): Promise<void> {
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      this._columnFormat = queryOptions.columnFormat != null ? queryOptions.columnFormat : Protocol.DataFormat.binary;
      socket.sendBindMessage({
        typeMap: queryOptions.typeMap || GlobalTypeMap,
        statement: this._statement.name,
        portal: this.name,
        paramTypes: this._statement.paramTypes,
        params,
        queryOptions,
      });
      socket.sendFlushMessage();
      return await socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?) => void) => {
        switch (code) {
          case Protocol.BackendMessageCode.BindComplete:
            done();
            break;
          case Protocol.BackendMessageCode.NoticeResponse:
            break;
          default:
            done(new Error(`Server returned unexpected response message (${String.fromCharCode(code)})`));
        }
      });
    } finally {
      intoCon.unref();
    }
  }

  async retrieveFields(): Promise<Protocol.RowDescription[]> {
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      socket.sendDescribeMessage({ type: 'P', name: this.name });
      socket.sendFlushMessage();
      return await socket.capture(
        async (code: Protocol.BackendMessageCode, msg: any, done: (err?, result?) => void) => {
          switch (code) {
            case Protocol.BackendMessageCode.NoticeResponse:
              break;
            case Protocol.BackendMessageCode.NoData:
              done();
              break;
            case Protocol.BackendMessageCode.RowDescription:
              done(undefined, msg.fields);
              break;
            default:
              done(new Error(`Server returned unexpected response message (${String.fromCharCode(code)})`));
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
      socket.sendExecuteMessage({ portal: this.name, fetchCount: fetchCount || 100 });
      socket.sendFlushMessage();
      const rows: any = [];
      return await socket.capture(
        async (
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
              if (Array.isArray(this._columnFormat)) {
                rows.push(
                  msg.columns.map((buf: Buffer, i) =>
                    this._columnFormat[i] === Protocol.DataFormat.text ? buf.toString('utf8') : buf,
                  ),
                );
              } else if (this._columnFormat === Protocol.DataFormat.binary) rows.push(msg.columns);
              else rows.push(msg.columns.map((buf: Buffer) => buf.toString('utf8')));
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
            default:
              done(new Error(`Server returned unexpected response message (${String.fromCharCode(code)})`));
          }
        },
      );
    } finally {
      intoCon.unref();
    }
  }

  async close(): Promise<void> {
    const intoCon = getIntlConnection(this.connection);
    intoCon.ref();
    try {
      const socket = intoCon.socket;
      socket.sendCloseMessage({ type: 'P', name: this.name });
      socket.sendSyncMessage();
      return await socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error) => void) => {
        switch (code) {
          case Protocol.BackendMessageCode.NoticeResponse:
            break;
          case Protocol.BackendMessageCode.CloseComplete:
            break;
          case Protocol.BackendMessageCode.ReadyForQuery:
            intoCon.transactionStatus = msg.status;
            done();
            break;
          default:
            done(new Error(`Server returned unexpected response message (${String.fromCharCode(code)})`));
        }
      });
    } finally {
      intoCon.unref();
    }
  }
}
