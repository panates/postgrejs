import url from 'url';
import TaskQueue from 'putil-taskqueue';
import {PgSocket} from './PgSocket';
import {SafeEventEmitter} from './SafeEventEmitter';
import {ConnectionConfiguration, ConnectionState, QueryOptions, QueryResult, ScriptExecuteOptions} from './definitions';
import {Statement} from './Statement';
import {executeScript, ScriptPromise} from './ScriptPromise';
import {parseConnectionString} from './helpers';

export class Connection extends SafeEventEmitter {
    private _socket: PgSocket;
    private _statementQueue = new TaskQueue();

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

    async close(force?: boolean): Promise<void> {
        this._statementQueue.clear();
        if (this._socket.state === ConnectionState.CLOSED)
            return;
        await this._socket.sendTerminateMessage();
        return new Promise((resolve) => {
            this._socket.once('close', () => {
                resolve();
            });
            this._socket.close();
        })
    }

    async execute(sql, options?: ScriptExecuteOptions): Promise<ScriptPromise> {
        return this._statementQueue.enqueue<ScriptPromise>(() => {
            return executeScript(this._socket, sql, options).then();
        })
    }

    async query(sql: string, options?: QueryOptions): Promise<QueryResult> {
        const statement = new Statement(this, sql, options?.statementName);
        statement.on('execute', () => this.emit('query', statement));
        statement.on('finish', (result: QueryResult) =>
            this.emit('execute-finish', statement, result));
        return statement.execute(options);
    }

    protected _onError(err: Error): void {
        if (this._socket.state !== ConnectionState.READY)
            return;
        this.emit('error', err);
    }

}

