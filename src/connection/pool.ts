import {
  Pool as LightningPool,
  PoolConfiguration as LPoolConfiguration,
  PoolFactory,
} from 'lightning-pool';
import { coerceToBoolean, coerceToInt } from 'putil-varhelpers';
import { ConnectionState } from '../constants.js';
import type { PoolConfiguration } from '../interfaces/database-connection-params.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import type { QueryResult } from '../interfaces/query-result.js';
import type { ScriptExecuteOptions } from '../interfaces/script-execute-options.js';
import type { ScriptResult } from '../interfaces/script-result.js';
import type { StatementPrepareOptions } from '../interfaces/statement-prepare-options.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import { getConnectionConfig } from '../util/connection-config.js';
import { Connection, type NotificationCallback } from './connection.js';
import { getIntlConnection, IntlConnection } from './intl-connection.js';
import type { PreparedStatement } from './prepared-statement.js';

export class Pool extends SafeEventEmitter {
  protected readonly _pool: LightningPool<IntlConnection>;
  protected readonly _notificationListeners = new SafeEventEmitter();
  protected _notificationConnection?: Connection;
  readonly config: PoolConfiguration;

  constructor(config?: PoolConfiguration | string) {
    super();
    const cfg = getConnectionConfig(config) as PoolConfiguration;
    this.config = Object.freeze(cfg);
    const poolOptions: LPoolConfiguration = {};
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
    const poolFactory: PoolFactory<IntlConnection> = {
      create: async () => {
        /* istanbul ignore next */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.create',
            pool: this,
            message: `new connection creating`,
          });
        }
        const intlCon = new IntlConnection(cfg);
        await intlCon.connect();
        intlCon.on('close', () => this._pool.destroy(intlCon));
        /* istanbul ignore next */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.create',
            pool: this,
            message: `[${intlCon.processID}] connection created`,
          });
        }
        return intlCon;
      },
      destroy: intlCon => {
        /* istanbul ignore next */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.destroy',
            pool: this,
            message: `[${intlCon.processID}] connection destroy`,
          });
        }
        return intlCon.close();
      },
      reset: async (intlCon: IntlConnection) => {
        /* istanbul ignore next */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.reset',
            pool: this,
            message: `[${intlCon.processID}] connection reset`,
          });
        }
        try {
          if (intlCon.state === ConnectionState.READY) {
            await intlCon.execute('ROLLBACK;UNLISTEN *');
          }
        } finally {
          intlCon.removeAllListeners();
          intlCon.once('close', () => this._pool.destroy(intlCon));
          (intlCon as any)._refCount = 0;
        }
      },
      validate: async (intlCon: IntlConnection) => {
        /* istanbul ignore next */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.validate',
            pool: this,
            message: `[${intlCon.processID}] connection validate`,
          });
        }
        if (intlCon.state !== ConnectionState.READY)
          throw new Error('Connection is not active');
        await intlCon.execute('select 1;');
      },
    };

    this._pool = new LightningPool<IntlConnection>(poolFactory, poolOptions);
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
   * Returns total number of connections in the pool regardless of whether they are idle or in use
   */
  get totalConnections() {
    return this._pool.size;
  }

  /**
   * Obtains a connection from the connection pool
   */
  async acquire(): Promise<Connection> {
    const intlCon = await this._pool.acquire();
    /* istanbul ignore next */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Pool.acquire',
        pool: this,
        message: `[${intlCon.processID}] acquired`,
      });
    }
    const connection = new Connection(this, intlCon);
    /* istanbul ignore next */
    if (this.listenerCount('debug'))
      connection.on('debug', (...args) => this.emit('debug', ...args));
    if (this.listenerCount('execute'))
      connection.on('execute', (...args) => this.emit('execute', ...args));
    if (this.listenerCount('query'))
      connection.on('query', (...args) => this.emit('query', ...args));
    return connection;
  }

  /**
   * Shuts down the pool and destroys all resources.
   */
  async close(terminateWait?: number): Promise<void> {
    this._notificationListeners.removeAllListeners();
    await this._notificationConnection?.close(terminateWait);
    const ms = terminateWait == null ? 10000 : terminateWait;
    return this._pool.closeAsync(ms);
  }

  /**
   * Executes a script
   */
  async execute(
    sql: string,
    options?: ScriptExecuteOptions,
  ): Promise<ScriptResult> {
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

  async prepare(
    sql: string,
    options?: StatementPrepareOptions,
  ): Promise<PreparedStatement> {
    const connection = await this.acquire();
    const statement = await connection.prepare(sql, options);
    statement.once('close', () =>
      this._pool.release(getIntlConnection(connection)),
    );
    return statement;
  }

  release(connection: Connection): Promise<void> {
    return this._pool.releaseAsync(getIntlConnection(connection));
  }

  async listen(channel: string, callback: NotificationCallback) {
    if (!/^[A-Z]\w+$/i.test(channel))
      throw new TypeError(`Invalid channel name`);
    this._notificationListeners.on(channel, callback);
    await this._initNotificationConnection();
  }

  async unListen(channel: string) {
    if (!/^[A-Z]\w+$/i.test(channel))
      throw new TypeError(`Invalid channel name`);
    this._notificationListeners.removeAllListeners(channel);
    if (!this._notificationListeners.eventNames().length) {
      await this.unListenAll();
    } else if (this._notificationConnection)
      await this._notificationConnection.unListen(channel);
  }

  async unListenAll() {
    this._notificationListeners.removeAllListeners();
    if (this._notificationConnection) {
      const conn = this._notificationConnection;
      this._notificationConnection = undefined;
      await conn.close();
    }
  }

  protected async _initNotificationConnection() {
    if (this._notificationConnection) return;

    const conn = (this._notificationConnection = new Connection(this.config));
    // Reconnect on connection lost
    conn.on('close', () => reConnect());

    const registerEvents = async () => {
      const channels = this._notificationListeners.eventNames();
      for (const channel of channels) {
        const fns = this._notificationListeners.listeners(channel);
        for (const fn of fns) {
          await conn.listen(channel as string, fn as any);
        }
      }
    };

    const reConnect = async () => {
      setTimeout(() => {
        if (!this._notificationListeners.eventNames().length) return;
        conn.connect().catch(() => reConnect());
      }, 500).unref();
    };

    await conn.connect();
    await registerEvents();
  }
}
