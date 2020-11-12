import TaskQueue from 'putil-taskqueue';
import {PgSocket} from './protocol/PgSocket';
import {SafeEventEmitter} from './SafeEventEmitter';
import {
    ConnectionConfiguration,
    ConnectionState, Maybe, OID, StatementPrepareOptions,
    QueryOptions,
    QueryResult,
    ScriptExecuteOptions,
    ScriptResult, DataTypeOIDs
} from './definitions';
import {PreparedStatement} from './PreparedStatement';
import {ScriptExecutor} from './ScriptExecutor';
import {BindParam} from './BindParam';
import {GlobalTypeMap} from './DataTypeMap';
import {getConnectionConfig} from './util/connection-config';
import {escapeLiteral} from './util/escape-literal';

export class Connection extends SafeEventEmitter {
    protected _socket: PgSocket;
    protected _statementQueue = new TaskQueue();
    protected _activeQuery?: ScriptExecutor | PreparedStatement;
    protected _config: ConnectionConfiguration;

    constructor(config?: ConnectionConfiguration | string) {
        super();
        this._config = getConnectionConfig(config);
        this._socket = new PgSocket(this._config);
        this._socket.on('error', (err) => this._onError(err));
        this._socket.on('close', () => this.emit('close'));
        this._socket.on('connecting', () => this.emit('connecting'));
    }

    /**
     * Returns current state of the connection
     */
    get state(): ConnectionState {
        return this._socket.state;
    }

    async connect(): Promise<void> {
        await new Promise((resolve, reject) => {
            if (this._socket.state === ConnectionState.READY)
                return resolve();
            const handleConnectError = (err) => reject(err);
            this._socket.once('ready', () => {
                this._socket.removeListener('error', handleConnectError);
                resolve();
                this.emit('ready');
            });
            this._socket.once('error', handleConnectError);
            this._socket.connect();
        });
        if (this._config.searchPath)
            await this.execute('SET search_path = ' + escapeLiteral(this._config.searchPath));
        if (this._config.timezone)
            await this.execute('SET timezone TO ' + escapeLiteral(this._config.timezone));
    }

    async close(terminateWait?: number): Promise<void> {
        if (this.state === ConnectionState.CLOSED)
            return;
        this._statementQueue.clear();

        return new Promise(resolve => {
            const close = () => {
                this._socket.once('close', resolve);
                this._closeSocket();
            }
            if (this._activeQuery) {
                const terminate = () => {
                    const activeQuery = this._activeQuery;
                    this._activeQuery = undefined;
                    this.emit('terminate', activeQuery);
                    close();
                }
                const ms = terminateWait == null ? 10000 : terminateWait;
                if (ms > 0) {
                    const startTime = Date.now();
                    const timer = setInterval(() => {
                        if (!this._activeQuery || Date.now() > startTime + ms) {
                            clearInterval(timer);
                            terminate();
                        }
                    }, 50);
                    return;
                }
                terminate();
            } else
                close();
        });
    }

    async execute(sql: string, options?: ScriptExecuteOptions): Promise<ScriptResult> {
        const script = new ScriptExecutor(this);
        return script.execute(sql, options);
    }

    async query(sql: string, options?: QueryOptions): Promise<QueryResult> {
        const typeMap = options?.typeMap || GlobalTypeMap;
        const paramTypes: Maybe<OID[]> = options?.params?.map(prm =>
            prm instanceof BindParam ? prm.oid : typeMap.determine(prm) || DataTypeOIDs.Varchar
        );
        const statement = await this.prepare(sql, {paramTypes, typeMap});
        try {
            const params: Maybe<Maybe<OID>[]> = options?.params?.map(prm =>
                prm instanceof BindParam ? prm.value : prm);
            return await statement.execute({...options, params});
        } finally {
            await statement.close();
        }
    }

    async prepare(sql: string, options?: StatementPrepareOptions): Promise<PreparedStatement> {
        return await PreparedStatement.prepare(this, sql, options);
    }

    protected _closeSocket(): void {
        if (this._socket.state === ConnectionState.CLOSED)
            return;
        this._socket.sendTerminateMessage();
        this._socket.close();
    }

    protected _onError(err: Error): void {
        if (this._socket.state !== ConnectionState.READY)
            return;
        this.emit('error', err);
    }

}
