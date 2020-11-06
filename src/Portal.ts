import {Connection} from './Connection';
import {FetchOptions, Maybe} from './definitions';
import {Protocol} from './protocol/protocol';
import {getSocket} from './common';
import {PgSocket} from './protocol/PgSocket';
import {PreparedStatement} from './PreparedStatement';

export interface PortalExecuteResult {
    code: Protocol.BackendMessageCode;
    rows?: any[];
    command?: string;
    rowCount?: number;
}

export class Portal {

    private readonly _socket: PgSocket;
    private readonly _statement: PreparedStatement;
    private readonly _name?: string;
    private _binaryColumns: boolean | boolean[] = false;

    constructor(statement: PreparedStatement, name: string) {
        this._statement = statement;
        this._socket = getSocket(this.connection);
        this._name = name;
    }

    get connection(): Connection {
        return this._statement.connection;
    }

    get name(): Maybe<string> {
        return this._name;
    }

    async bind(params: Maybe<any[]>,
               fetchOptions: FetchOptions): Promise<void> {
        const socket = this._socket;
        this._binaryColumns = fetchOptions.binaryColumns || false;
        socket.sendBindMessage({
            statement: this._statement.name,
            portal: this.name,
            paramTypes: this._statement.paramTypes,
            params,
            fetchOptions: fetchOptions
        });
        socket.sendFlushMessage();
        return socket.capture(async (code: Protocol.BackendMessageCode, msg: any,
                                     done: (err?) => void) => {
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
    }

    async retrieveFields(): Promise<Protocol.RowDescription[]> {
        const socket = this._socket;
        socket.sendDescribeMessage({type: 'P', name: this.name});
        socket.sendFlushMessage();
        return socket.capture(async (code: Protocol.BackendMessageCode, msg: any,
                                     done: (err?, result?) => void) => {
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
        });
    }

    async execute(fetchCount?: number): Promise<PortalExecuteResult> {
        const socket = this._socket;
        await socket.sendExecuteMessage({portal: this.name, fetchCount: fetchCount || 100});
        await socket.sendFlushMessage();
        const rows: any = [];
        return socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error, result?: PortalExecuteResult) => void) => {
            switch (code) {
                case Protocol.BackendMessageCode.NoticeResponse:
                    break;
                case Protocol.BackendMessageCode.NoData:
                    done(undefined, {code});
                    break;
                case Protocol.BackendMessageCode.DataRow:
                    if (this._binaryColumns == true)
                        rows.push(msg.columns);
                    else if (Array.isArray(this._binaryColumns))
                        rows.push(msg.columns.map((buf: Buffer, i) =>
                            this._binaryColumns[i] ? buf : buf.toString('utf8')));
                    else rows.push(msg.columns.map((buf: Buffer) => buf.toString('utf8')));
                    break;
                case Protocol.BackendMessageCode.PortalSuspended:
                    done(undefined, {code, rows});
                    break;
                case Protocol.BackendMessageCode.CommandComplete:
                    done(undefined, {
                        code, rows,
                        command: msg.command,
                        rowCount: msg.rowCount
                    });
                    break;
                default:
                    done(new Error(`Server returned unexpected response message (${String.fromCharCode(code)})`));
            }
        });
    }

    async close(): Promise<void> {
        const socket = this._socket;
        await socket.sendCloseMessage({type: 'P', name: this.name});
        await socket.sendSyncMessage();
        return socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error) => void) => {
            switch (code) {
                case Protocol.BackendMessageCode.NoticeResponse:
                    break;
                case Protocol.BackendMessageCode.CloseComplete:
                    break;
                case Protocol.BackendMessageCode.ReadyForQuery:
                    done();
                    break;
                default:
                    done(new Error(`Server returned unexpected response message (${String.fromCharCode(code)})`));
            }
        });
    }

}
