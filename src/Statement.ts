import crypto from "crypto";
import TaskQueue from 'putil-taskqueue';
import {QueryOptions, QueryResult, StatementState} from './definitions';
import {Connection} from './Connection';
import {SafeEventEmitter} from './SafeEventEmitter';
import {PgSocket} from './PgSocket';
import {Protocol} from './protocol/protocol';
import {Cursor} from './Cursor';
import {dataTypeRegistry} from './datatype-registry';
import {convertRowToObject, getParsers, parseRow} from './helpers';
import RowDescription = Protocol.RowDescription;

export class Statement extends SafeEventEmitter {
    private readonly _connection: Connection;
    private _state = StatementState.IDLE;
    sql: string;
    statementName?: string;

    constructor(connection: Connection,
                sql: string,
                statementName?: string) {
        super();
        this._connection = connection;
        this.sql = sql;
        this.statementName = statementName;
    }

    get connection(): Connection {
        return this._connection;
    }

    get state(): StatementState {
        return this._state;
    }

    async execute(options: QueryOptions = {}): Promise<QueryResult> {
        return this._statementQueue.enqueue<QueryResult>(async (): Promise<QueryResult> => {
            this._state = StatementState.PREPARING;
            const portal = options.cursor ?
                'cursor-' + crypto.randomBytes(8).toString('hex') : '';

            this._socket.sendParseMessage(this.sql, this.statementName);
            this._socket.sendBindMessage(this.statementName, portal, options.bindParams);
            this._socket.sendDescribeMessage('P', portal);
            this._socket.sendFlushMessage();

            const startTime = Date.now();
            const result: QueryResult = {command: undefined};
            let parsers;
            let prepareTime = 0;
            let executeTime = 0;
            let fetchStart = 0;
            let fields: RowDescription[];

            return this._socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error, result?: any) => void) => {

                switch (code) {
                    case Protocol.BackendMessageCode.BindComplete:
                    case Protocol.BackendMessageCode.NoticeResponse:
                        break;
                    case Protocol.BackendMessageCode.ParseComplete:
                        this._state = StatementState.EXECUTING;
                        prepareTime = Date.now() - startTime;
                        break;
                    case Protocol.BackendMessageCode.NoData:
                        await this._socket.sendExecuteMessage(portal, 100);
                        await this._socket.sendFlushMessage();
                        break;
                    case Protocol.BackendMessageCode.RowDescription:
                        fields = msg.fields;
                        parsers = getParsers(fields);
                        result.fields = wrapRowDescription(fields);
                        if (options.cursor) {
                            const cursor = new Cursor(this._socket, portal, result.fields)
                            result.cursor = cursor;
                            return done(undefined, result);
                        }
                        result.rows = [];
                        await this._socket.sendExecuteMessage(portal, options.fetchRows || 100);
                        await this._socket.sendFlushMessage();
                        break;
                    case Protocol.BackendMessageCode.DataRow:
                        executeTime = executeTime || (Date.now() - startTime);
                        fetchStart = fetchStart || Date.now();
                        parseRow(parsers, msg.columns);
                        const row = options.objectRows ?
                            convertRowToObject(fields, msg.columns) : msg.columns;
                        result.rows?.push(row);
                        await this._socket.sendExecuteMessage(portal, options.fetchRows || 100);
                        await this._socket.sendFlushMessage();
                        break;
                    case Protocol.BackendMessageCode.CommandComplete:
                        result.command = msg.command;
                        if (result.command === 'DELETE' || result.command === 'UPDATE')
                            result.rowsAffected = msg.rowCount;
                        await this._socket.sendCloseMessage('P', portal);
                        await this._socket.sendFlushMessage();
                        break;
                    case Protocol.BackendMessageCode.CloseComplete:
                        result.prepareTime = prepareTime;
                        result.executeTime = executeTime;
                        if (fetchStart)
                            result.fetchTime = Date.now() - fetchStart;
                        result.totalTime = Date.now() - startTime;
                        done(undefined, result);
                        break;
                    default:
                        done(new Error(`Server returned unexpected response message (0x${code.toString(16)})`));
                }
            });
        })
    }

    private get _statementQueue(): TaskQueue {
        return this.connection['_statementQueue'] as TaskQueue;
    }

    private get _socket(): PgSocket {
        return this.connection['_socket'] as PgSocket;
    }

    async cancel(): Promise<void> {

    }
}

export function wrapRowDescription(fields: Protocol.RowDescription[]): any[] {
    return fields.map(f => {
        const x: any = {...f};
        delete x.format;
        if (x.fixedSize < 0)
            delete x.fixedSize;
        if (x.modifier < 0)
            delete x.modifier;
        const reg = dataTypeRegistry[x.dataTypeId];
        if (reg && reg.isArray)
            x.isArray = true;
        return x;
    });
}

