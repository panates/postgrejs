import {SafeEventEmitter} from './SafeEventEmitter';
import {
    ConnectionConfiguration,
    ConnectionState, StatementPrepareOptions,
    QueryOptions,
    QueryResult,
    ScriptExecuteOptions,
    ScriptResult, Maybe, OID, DataTypeOIDs
} from './definitions';
import type {Pool} from './Pool';
import {PreparedStatement} from './PreparedStatement';
import {IntlConnection} from './IntlConnection';
import {GlobalTypeMap} from './DataTypeMap';
import {BindParam} from './BindParam';

export class Connection extends SafeEventEmitter {
    private readonly _pool?: Pool;
    private readonly _intlCon: IntlConnection;
    private _closing = false;

    constructor(pool: Pool, intlCon: IntlConnection)
    constructor(config?: ConnectionConfiguration | string | IntlConnection)
    constructor(arg0: any, arg1?: any) {
        super();
        if (arg0 && typeof arg0.acquire === 'function') {
            if (!(arg1 instanceof IntlConnection))
                throw new TypeError('Invalid argument');
            this._pool = arg0;
            this._intlCon = arg1;
        } else
            this._intlCon = new IntlConnection(arg0);
        this._intlCon.on('ready', (...args) => this.emit('ready', ...args));
        this._intlCon.on('error', (...args) => this.emit('error', ...args));
        this._intlCon.on('close', (...args) => this.emit('close', ...args));
        this._intlCon.on('connecting', (...args) => this.emit('connecting', ...args));
        this._intlCon.on('ready', (...args) => this.emit('ready', ...args));
        this._intlCon.on('terminate', (...args) => this.emit('terminate', ...args));
    }

    /**
     * Returns configuration object
     */
    get config(): ConnectionConfiguration {
        return this._intlCon.config;
    }

    /**
     * Returns true if connection is in a transaction
     */
    get inTransaction(): boolean {
        return this._intlCon.inTransaction;
    }

    /**
     * Returns current state of the connection
     */
    get state(): ConnectionState {
        return this._intlCon.state;
    }

    /**
     * Connects to the server
     */
    async connect(): Promise<void> {
        await this._intlCon.connect();
        if (this.state === ConnectionState.READY)
            this._closing = false;
    }

    /**
     * Closes connection. You can define how long time the connection will
     * wait for active queries before terminating the connection.
     * On the end of the given time, it forces to close the socket and than emits `terminate` event.
     *
     * @param terminateWait {number} - Determines how long the connection will wait for active queries before terminating.
     */
    async close(terminateWait?: number): Promise<void> {
        this._intlCon.statementQueue.clear();
        if (this.state === ConnectionState.CLOSED || this._closing)
            return;

        this._closing = true;
        // @ts-ignore
        if (this._intlCon.refCount > 0 && typeof terminateWait === 'number' && terminateWait > 0) {
            const startTime = Date.now();
            return new Promise((resolve, reject) => {
                const timer = setInterval(() => {
                    if (this._intlCon.refCount <= 0 || Date.now() > startTime + terminateWait) {
                        clearInterval(timer);
                        if (this._intlCon.refCount > 0)
                            this.emit('terminate');
                        this._close()
                            .then(resolve)
                            .catch(reject);
                    }
                }, 50);
            });
        }
        await this._close();
    }

    /**
     * Executes single or multiple SQL scripts using Simple Query protocol.
     *
     * @param sql {string} - SQL script that will be executed
     * @param options {ScriptExecuteOptions} - Execute options
     */
    execute(sql: string, options?: ScriptExecuteOptions): Promise<ScriptResult> {
        return this._intlCon.execute(sql, options);
    }

    async query(sql: string, options?: QueryOptions): Promise<QueryResult> {
        this._intlCon.assertConnected();
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

    /**
     * Creates a PreparedStatement instance
     * @param sql {string} - SQL script that will be executed
     * @param options {StatementPrepareOptions} - Options
     */
    async prepare(sql: string, options?: StatementPrepareOptions): Promise<PreparedStatement> {
        return await PreparedStatement.prepare(this, sql, options);
    }

    /**
     * Starts a transaction
     */
    async startTransaction(): Promise<void> {
        await this.execute('BEGIN');
    }

    /**
     * Starts transaction and creates a savepoint
     * @param name {string} - Name of the savepoint
     */
    async savepoint(name: string): Promise<void> {
        if (!(name && name.match(/^[a-zA-Z]\w+$/)))
            throw new Error(`Invalid savepoint "${name}`);
        await this.execute('BEGIN; SAVEPOINT ' + name);
    }

    /**
     * Commits current transaction
     */
    async commit(): Promise<void> {
        await this.execute('COMMIT');
    }

    /**
     * Rolls back current transaction
     */
    async rollback(): Promise<void> {
        await this.execute('ROLLBACK');
    }

    /**
     * Rolls back current transaction to given savepoint
     * @param name {string} - Name of the savepoint
     */
    async rollbackToSavepoint(name: string): Promise<void> {
        if (!(name && name.match(/^[a-zA-Z]\w+$/)))
            throw new Error(`Invalid savepoint "${name}`);
        await this.execute('ROLLBACK TO SAVEPOINT ' + name);
    }

    protected async _close(): Promise<void> {
        if (this._pool) {
            await this._pool.release(this);
            this.emit('release');
        } else
            await this._intlCon.close();
        this._closing = false;
    }

}
