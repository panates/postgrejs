import crypto from "crypto";
import {CommandResult, Maybe, QueryOptions, QueryResult, ScriptResult, StatementState} from './definitions';
import {Connection} from './Connection';
import {SafeEventEmitter} from './SafeEventEmitter';
import {ProtocolSocket} from './protocol/ProtocolSocket';
import {Protocol} from './protocol/protocol';
import {Cursor} from './Cursor';
import {
    convertRowToObject,
    getParsers,
    getProtocolSocket,
    getStatementQueue,
    parseRow,
    wrapRowDescription
} from './helpers';
import {Portal} from './Portal';

export class PreparedStatement extends SafeEventEmitter {
    private readonly _connection: Connection;
    private readonly _socket: ProtocolSocket;
    private readonly _sql: string;
    private readonly _name?: string;
    private _prepared = false;
    private _state = StatementState.IDLE;

    constructor(connection: Connection,
                sql: string,
                name?: string) {
        super();
        this._connection = connection;
        this._socket = getProtocolSocket(this.connection);
        this._sql = sql;
        this._name = name;
    }

    get connection(): Connection {
        return this._connection;
    }

    get name(): Maybe<string> {
        return this._name;
    }

    get state(): StatementState {
        return this._state;
    }

    get sql(): string {
        return this._sql;
    }

    async execute(options: QueryOptions = {}): Promise<QueryResult> {
        const queue = getStatementQueue(this.connection);
        return queue.enqueue<ScriptResult>(async (): Promise<QueryResult> => {
            this._state = StatementState.EXECUTING;
            const prepared = this._prepared;
            let portal: Maybe<Portal>;
            try {
                const result: QueryResult = {command: undefined};
                const startTime = Date.now();
                let t = Date.now();
                await this._prepare();
                result.prepareTime = Date.now() - t;
                t = Date.now();
                const portalName = options.cursor ?
                    'P_' + crypto.randomBytes(8).toString('hex') : '';
                portal = new Portal(this.connection, portalName);
                const bindResult = await portal.bind(this.name, options.bindParams);
                if (bindResult.fields) {
                    const fields = bindResult.fields;
                    const parsers = getParsers(fields);
                    const resultFields = wrapRowDescription(fields);
                    if (options.cursor) {
                        const cursor = new Cursor(
                            portal,
                            resultFields,
                            parsers,
                            options.fetchCount,
                            options.objectRows);
                        result.cursor = cursor;
                        portal = undefined;
                        return result;
                    }
                    result.fields = resultFields;
                    const executeResult = await portal.execute(options.fetchCount);
                    result.executeTime = Date.now() - t;
                    if (executeResult.command)
                        result.command = executeResult.command;
                    if (executeResult.rows) {
                        if (!result.command)
                            result.command = 'SELECT';
                        const rows = result.rows = executeResult.rows;
                        const l = rows.length;
                        let row;
                        for (let i = 0; i < l; i++) {
                            row = rows[i];
                            parseRow(parsers, row);
                            if (options.objectRows) {
                                rows[i] = convertRowToObject(fields, row);
                            }
                        }
                    }
                    if (result.command === 'DELETE' ||
                        result.command === 'INSERT' ||
                        result.command === 'UPDATE')
                        result.rowsAffected = executeResult.rowCount;
                }
                result.totalTime = Date.now() - startTime;
                return result;
            } finally {
                if (portal)
                    await portal.close();
                if (!prepared)
                    await this._close();
                this._state = StatementState.IDLE;
            }
        });
    }

    async prepare(): Promise<void> {
        if (this._prepared) return;
        const queue = getStatementQueue(this.connection);
        return queue.enqueue<void>(() => this._prepare());
    }

    async close(): Promise<void> {
        if (this._prepared) return;
        const queue = getStatementQueue(this.connection);
        return queue.enqueue<void>(() => this._close());
    }

    private async _prepare(): Promise<void> {
        if (this._prepared) return;
        this._state = StatementState.PREPARING;
        const socket = getProtocolSocket(this.connection);
        socket.sendParseMessage(this.sql, this.name);
        socket.sendFlushMessage();
        return socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error, result?: CommandResult) => void) => {
            switch (code) {
                case Protocol.BackendMessageCode.NoticeResponse:
                    this.emit('notice', msg);
                    break;
                case Protocol.BackendMessageCode.ParseComplete:
                    this._prepared = true;
                    this._state = StatementState.IDLE;
                    done();
                    break;
                default:
                    this._state = StatementState.IDLE;
                    done(new Error(`Server returned unexpected response message (0x${code.toString(16)})`));
            }
        });
    }

    private async _close(): Promise<void> {
        const socket = this._socket;
        await socket.sendCloseMessage('P', this.name);
        await socket.sendSyncMessage();
        return socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error) => void) => {
            switch (code) {
                case Protocol.BackendMessageCode.NoticeResponse:
                    this.emit('notice', msg);
                    break;
                case Protocol.BackendMessageCode.CloseComplete:
                    this._prepared = false;
                    done();
                    break;
                default:
                    done(new Error(`Server returned unexpected response message (0x${code.toString(16)})`));
            }
        });
    }

    async cancel(): Promise<void> {
        throw new Error('Not implemented yet');
    }
}

