import {createPool, IPoolFactory, Pool as LightningPool, PoolOptions, PoolState} from 'lightning-pool';
import {coerceToBoolean, coerceToInt} from 'putil-varhelpers';
import {
    PoolConfiguration,
    ConnectionState,
    QueryOptions,
    QueryResult,
    ScriptExecuteOptions,
    ScriptResult, StatementPrepareOptions
} from './definitions';
import {PoolConnection} from './PoolConnection';
import {getConnectionConfig} from './util/connection-config';
import {PreparedStatement} from './PreparedStatement';
import {SafeEventEmitter} from './SafeEventEmitter';

export class Pool extends SafeEventEmitter {

    private readonly _pool: LightningPool<PoolConnection>;
    readonly config: PoolConfiguration;

    constructor(config?: PoolConfiguration | string) {
        super();
        const cfg = getConnectionConfig(config) as PoolConfiguration;
        this.config = cfg;
        const poolOptions: PoolOptions = {};
        poolOptions.acquireMaxRetries = coerceToInt(cfg.acquireMaxRetries, 0);
        poolOptions.acquireRetryWait = coerceToInt(cfg.acquireRetryWait, 2000);
        poolOptions.acquireTimeoutMillis = coerceToInt(cfg.acquireTimeoutMillis, 0);
        poolOptions.idleTimeoutMillis = coerceToInt(cfg.idleTimeoutMillis, 30000);
        poolOptions.max = coerceToInt(cfg.max, 10);
        poolOptions.maxQueue = coerceToInt(cfg.maxQueue, 1000);
        poolOptions.max = coerceToInt(cfg.max, 10);
        poolOptions.min = coerceToInt(cfg.min, 0);
        poolOptions.minIdle = coerceToInt(cfg.minIdle, 0);
        poolOptions.validation = coerceToBoolean(cfg.validation, false);
        const poolFactory: IPoolFactory<PoolConnection> = {
            create: async () => {
                const connection = new PoolConnection(this, cfg);
                connection.on('close', () => this.release(connection));
                await connection.connect();
                return connection;
            },
            destroy: connection => connection.close(),
            reset: async (connection: PoolConnection) => {
                if (connection.state === ConnectionState.READY)
                    await connection.execute('ROLLBACK;')
            },
            validate: async (connection: PoolConnection) => {
                if (connection.state !== ConnectionState.READY)
                    throw new Error('Connection is not active');
                await connection.execute('select 1;');
            },
        };

        this._pool = createPool<PoolConnection>(poolFactory, poolOptions);
        this._pool.on('return', (...args) => this.emit('release', ...args));
        this._pool.on('error', (...args) => this.emit('error', ...args));
        this._pool.on('acquire', (...args) => this.emit('acquire', ...args));
        this._pool.on('destroy', (...args) => this.emit('destroy', ...args));
        this._pool.start();
    }

    /**
     * Returns number of connections that are currently acquired
     */
    get acquiredConnections() {
        return this._pool.acquired;
    }

    /**
     * Returns number of unused connections in the pool
     */
    get idleConnections() {
        return this._pool.available;
    }

    /**
     * Returns total number of connections in the pool
     * regardless of whether they are idle or in use
     */
    get totalConnections() {
        return this._pool.size;
    }

    /**
     * Obtains a connection from the connection pool.
     */
    async acquire(): Promise<PoolConnection> {
        return await this._pool.acquire();
    }

    /**
     * Shuts down the pool and destroys all resources.
     */
    async close(terminateWait?: number): Promise<void> {
        if (this._pool.state === PoolState.CLOSED)
            return;
        this._pool.close(false, () => 0);
        return new Promise(resolve => {
            const ms = terminateWait == null ? 10000 : terminateWait;
            if (ms > 0) {
                const startTime = Date.now();
                const timer = setInterval(() => {
                    if (this._pool.acquired === 0 || Date.now() > startTime + ms) {
                        clearInterval(timer);
                        this._pool.close(true, resolve);
                    }
                }, 50);
                return;
            }
            this._pool.close(true, resolve);
        });
    }

    /**
     * Executes a script
     */
    async execute(sql: string, options?: ScriptExecuteOptions): Promise<ScriptResult> {
        const connection = await this.acquire();
        try {
            return await connection.execute(sql, options);
        } finally {
            await this.release(connection);
        }
    }

    /**
     * Executes a query
     */
    async query(sql: string, options?: QueryOptions): Promise<QueryResult> {
        const connection = await this.acquire();
        try {
            return await connection.query(sql, options);
        } finally {
            await this.release(connection);
        }
    }

    async prepare(sql: string, options?: StatementPrepareOptions): Promise<PreparedStatement> {
        const connection = await this.acquire();
        const statement = await connection.prepare(sql, options);
        statement.once('close', () => this.release(connection).catch(() => 0));
        return statement;
    }

    /**
     * Releases a connection
     */
    async release(connection: PoolConnection): Promise<void> {
        return this._pool.release(connection);
    }

}
