import {
    AnyParseFunction,
    CommandResult,
    Maybe, OID, StatementPrepareOptions,
    QueryOptions,
    QueryResult
} from './definitions';
import {Connection} from './Connection';
import {SafeEventEmitter} from './SafeEventEmitter';
import {PgSocket} from './protocol/PgSocket';
import {Protocol} from './protocol/protocol';
import {Cursor} from './Cursor';
import {Portal} from './Portal';
import {
    convertRowToObject,
    getParsers,
    getSocket,
    getStatementQueue,
    parseRow,
    wrapRowDescription
} from './common';
import {GlobalTypeMap} from './DataTypeMap';

let statementCounter = 0;
let portalCounter = 0;

export class PreparedStatement extends SafeEventEmitter {
    private readonly _connection: Connection;
    private readonly _socket: PgSocket;
    private readonly _sql: string = '';
    private readonly _name: string = '';
    private readonly _paramTypes: Maybe<Maybe<OID>[]>;
    private _refcount = 0;

    constructor(connection: Connection, sql: string, paramTypes?: OID[]) {
        super();
        this._connection = connection;
        this._socket = getSocket(this.connection);
        this._name = 'S_' + (statementCounter++);
        this._sql = sql;
        this._paramTypes = paramTypes;
    }

    static async prepare(connection: Connection,
                         sql: string,
                         options?: StatementPrepareOptions): Promise<PreparedStatement> {
        const queue = getStatementQueue(connection);
        const statement = new PreparedStatement(connection, sql, options?.paramTypes);
        const socket = statement._socket;
        await queue.enqueue<void>(() => {
            socket.sendParseMessage({
                statement: statement.name,
                sql: statement.sql,
                paramTypes: statement.paramTypes
            });
            socket.sendFlushMessage();
            return socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error, result?: CommandResult) => void) => {
                switch (code) {
                    case Protocol.BackendMessageCode.NoticeResponse:
                        break;
                    case Protocol.BackendMessageCode.ParseComplete:
                        done();
                        break;
                    default:
                        done(new Error(`Server returned unexpected response message (0x${code.toString(16)})`));
                }
            });
        });
        statement._refcount = 1;
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
        const queue = getStatementQueue(this.connection);
        return queue.enqueue<QueryResult>(async (): Promise<QueryResult> => {
            let portal: Maybe<Portal>;
            try {
                const result: QueryResult = {command: undefined};
                const startTime = Date.now();
                let t = Date.now();

                // Create portal
                const portalName = 'P_' + (++portalCounter);
                portal = new Portal(this, portalName);

                await portal.bind(options.params, options);
                const fields = await portal.retrieveFields();

                if (fields) {
                    const typeMap = options.typeMap || GlobalTypeMap;
                    const parsers: AnyParseFunction[] = getParsers(typeMap, fields);
                    const resultFields = wrapRowDescription(typeMap, fields);
                    if (options.cursor) {
                        result.cursor = new Cursor(
                            this,
                            portal,
                            resultFields,
                            parsers,
                            options);
                        this._refcount++;
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
                            parseRow(parsers, row, options);
                            if (options.objectRows) {
                                rows[i] = convertRowToObject(resultFields, row);
                            }
                        }
                    }
                    if (result.command === 'DELETE' ||
                        result.command === 'INSERT' ||
                        result.command === 'UPDATE')
                        result.rowsAffected = executeResult.rowCount;
                }
                result.executeTime = Date.now() - startTime;
                return result;
            } finally {
                if (portal)
                    await portal.close();
            }
        });
    }

    async close(): Promise<void> {
        if (--this._refcount > 0) return;
        const queue = getStatementQueue(this.connection);
        await queue.enqueue<void>(async () => {
            const socket = this._socket;
            await socket.sendCloseMessage({type: 'S', name: this.name});
            await socket.sendSyncMessage();
            return socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error) => void) => {
                switch (code) {
                    case Protocol.BackendMessageCode.NoticeResponse:
                        this.emit('notice', msg);
                        break;
                    case Protocol.BackendMessageCode.CloseComplete:
                        break;
                    case Protocol.BackendMessageCode.ReadyForQuery:
                        done();
                        break;
                    default:
                        done(new Error(`Server returned unexpected response message (0x${code.toString(16)})`));
                }
            });
        });
        this.emit('close');
    }

    async cancel(): Promise<void> {
        throw new Error('Not implemented yet');
    }
}

