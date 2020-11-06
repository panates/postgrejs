import TaskQueue from 'putil-taskqueue';
import {PgSocket} from './protocol/PgSocket';
import {SafeEventEmitter} from './SafeEventEmitter';
import {
    ConnectionConfiguration,
    ConnectionState, Maybe, OID,
    QueryOptions,
    QueryResult,
    ScriptExecuteOptions,
    ScriptResult
} from './definitions';
import {PreparedStatement} from './PreparedStatement';
import {ScriptExecutor} from './ScriptExecutor';
import {BindParam} from './BindParam';
import {DataTypeRegistry} from './DataTypeRegistry';
import {parseConnectionString} from './helpers/parse-connectionstring';

export class Connection extends SafeEventEmitter {
    private _socket: PgSocket;
    private _statementQueue = new TaskQueue();
    private _activeQuery?: ScriptExecutor | PreparedStatement;

    constructor(config: ConnectionConfiguration | string) {
        super();
        if (typeof config === 'string')
            config = parseConnectionString(config);
        this._socket = new PgSocket(config);
        this._socket.on('error', (err) => this._onError(err));
        this._socket.on('close', () => this.emit('close'));
        this._socket.on('connecting', () => this.emit('connecting'));
    }

    get state(): ConnectionState {
        return this._socket.state;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
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
    }

    async close(terminateWait?: number): Promise<void> {
        if (this.state === ConnectionState.CLOSED)
            return;
        this._statementQueue.clear();
        const tw = terminateWait == null ? 1000 : terminateWait;
        if (this._activeQuery && tw > 0) {
            const startTime = Date.now();
            const timer = setInterval(() => {
                if (!this._activeQuery || Date.now() > startTime + tw) {
                    this._activeQuery = undefined;
                    this.emit('terminate');
                    clearInterval(timer);
                    this._terminate();
                }
            }, 50);
        } else {
            this._terminate();
        }
        return new Promise(resolve => {
            this._socket.once('close', resolve);
        })
    }

    async execute(sql, options?: ScriptExecuteOptions): Promise<ScriptResult> {
        const script = new ScriptExecutor(this);
        return script.execute(sql, options);
    }

    async query(sql: string, options?: QueryOptions): Promise<QueryResult> {
        const paramTypes: Maybe<Maybe<OID>[]> = options?.params?.map(prm =>
            prm instanceof BindParam ? prm.oid :
                (DataTypeRegistry.determine(prm))
        );
        const params: Maybe<Maybe<OID>[]> = options?.params?.map(prm =>
            prm instanceof BindParam ? prm.value : prm);
        const statement = new PreparedStatement(this, sql, undefined, paramTypes);
        return statement.execute({...options, params});
    }

    private _terminate(): void {
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

