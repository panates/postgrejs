import {Connection} from './Connection';
import {BindParam, CommandResult, Maybe} from './definitions';
import {Protocol} from './protocol/protocol';
import {getProtocolSocket} from './helpers';
import {ProtocolSocket} from './protocol/ProtocolSocket';

export interface PortalBindResult {
    code: Protocol.BackendMessageCode;
    fields?: Protocol.RowDescription[];
}

export interface PortalExecuteResult {
    code: Protocol.BackendMessageCode;
    rows?: any[];
    command?: string;
    rowCount?: number;
}

export class Portal {

    private readonly _connection: Connection;
    private readonly _socket: ProtocolSocket;
    private readonly _name?: string;

    constructor(connection: Connection, name: string) {
        this._connection = connection;
        this._socket = getProtocolSocket(this.connection);
        this._name = name;
    }

    get connection(): Connection {
        return this._connection;
    }

    get name(): Maybe<string> {
        return this._name;
    }

    async bind(statementName?: string,
               bindParams?: BindParam[]): Promise<PortalBindResult> {
        const socket = this._socket;
        socket.sendBindMessage(statementName, this.name, bindParams);
        socket.sendDescribeMessage('P', this.name);
        socket.sendFlushMessage();
        return socket.capture(async (code: Protocol.BackendMessageCode, msg: any,
                                     done: (err?, result?: PortalBindResult) => void) => {
            switch (code) {
                case Protocol.BackendMessageCode.BindComplete:
                case Protocol.BackendMessageCode.NoticeResponse:
                    break;
                case Protocol.BackendMessageCode.NoData:
                    done(undefined, {code} as PortalBindResult);
                    break;
                case Protocol.BackendMessageCode.RowDescription:
                    done(undefined, {code, fields: msg.fields} as PortalBindResult);
                    break;
                default:
                    done(new Error(`Server returned unexpected response message (0x${code.toString(16)})`));
            }
        });
    }

    async execute(fetchCount?: number): Promise<PortalExecuteResult> {
        const socket = this._socket;
        await socket.sendExecuteMessage(this.name, fetchCount || 100);
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
                    rows.push(msg.columns);
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
                    done(new Error(`Server returned unexpected response message (0x${code.toString(16)})`));
            }
        });
    }

    async close(): Promise<void> {
        const socket = this._socket;
        await socket.sendCloseMessage('P', this.name);
        await socket.sendSyncMessage();
        return socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error) => void) => {
            switch (code) {
                case Protocol.BackendMessageCode.NoticeResponse:
                    break;
                case Protocol.BackendMessageCode.CloseComplete:
                    done();
                    break;
                default:
                    done(new Error(`Server returned unexpected response message (0x${code.toString(16)})`));
            }
        });
    }

}
