import {
  Pool as LightningPool,
  type PoolConfiguration as LPoolConfiguration,
  type PoolFactory,
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
import { startsTransaction } from '../util/starts-transaction.js';
import { Connection, type NotificationCallback } from './connection.js';
import { getIntlConnection, IntlConnection } from './intl-connection.js';
import type { PreparedStatement } from './prepared-statement.js';

export interface PoolPipelineOptions {
  pipeline?: boolean;
}

export type PoolQueryOptions = QueryOptions & PoolPipelineOptions;
export type PoolScriptExecuteOptions = ScriptExecuteOptions &
  PoolPipelineOptions;

/**
 * One pooled connection the pipelined path is currently borrowing.
 *
 * A slot joins the list the moment its acquire starts rather than when it
 * finishes, so callers arriving while a connection is still being opened
 * queue onto `promise` instead of starting a second acquire of their own.
 * `load` counts queries handed to this slot that have not settled yet - it
 * is incremented synchronously, at selection time, which `runningQueryCount`
 * cannot be: everything in a Promise.all() burst picks its connection before
 * any of them reaches execute(), so at that point every connection still
 * reports zero running queries.
 */
interface PipelineSlot {
  connection?: Connection;
  promise: Promise<Connection>;
  load: number;
}

export class Pool extends SafeEventEmitter {
  protected readonly _pool: LightningPool<IntlConnection>;
  protected readonly _notificationListeners = new SafeEventEmitter();
  protected _notificationConnection?: Connection;
  protected readonly _pipelineSlots: PipelineSlot[] = [];
  protected _pipelineMaxQueries: number;
  protected _pipelineMaxConnections: number;
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
    this._pipelineMaxQueries = Math.max(
      coerceToInt(cfg.pipelineMaxQueries, 100),
      1,
    );
    this._pipelineMaxConnections = Math.max(
      coerceToInt(cfg.pipelineMaxConnections, poolOptions.max),
      0,
    );
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
      reset: (intlCon: IntlConnection) => {
        /* istanbul ignore next */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.reset',
            pool: this,
            message: `[${intlCon.processID}] connection reset`,
          });
        }
        intlCon.owner = undefined;
        intlCon.removeAllListeners();
        intlCon.once('close', () => this._pool.destroy(intlCon));
        (intlCon as any)._refCount = 0;
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
  }

  /**
   * Returns the number of connections that are currently acquired
   */
  get acquiredConnections() {
    return this._pool.acquired;
  }

  /**
   * Returns the number of unused connections in the pool
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

  start() {
    return this._pool.start();
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
    options?: PoolScriptExecuteOptions,
  ): Promise<ScriptResult> {
    const slot = this._canPipeline(options?.pipeline, sql, options?.autoCommit)
      ? this._acquireShared()
      : undefined;
    if (!slot) {
      const connection = await this.acquire();
      try {
        return await connection.execute(sql, options);
      } finally {
        await this.release(connection);
      }
    }
    try {
      const shared = slot.connection || (await slot.promise);
      const result = await shared.execute(sql, options);
      this._checkSharedTransaction(slot, shared);
      return result;
    } finally {
      slot.load--;
    }
  }

  /**
   * Executes a query
   */
  async query(sql: string, options?: PoolQueryOptions): Promise<QueryResult> {
    // A cursor hands the caller something that outlives this call and must
    // keep its own portal on its own connection, so it can never share.
    const slot =
      !options?.cursor &&
      this._canPipeline(options?.pipeline, sql, options?.autoCommit)
        ? this._acquireShared()
        : undefined;
    if (!slot) {
      const connection = await this.acquire();
      try {
        return await connection.query(sql, options);
      } finally {
        await this.release(connection);
      }
    }
    try {
      const shared = slot.connection || (await slot.promise);
      const result = await shared.query(sql, options);
      this._checkSharedTransaction(slot, shared);
      return result;
    } finally {
      slot.load--;
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

  protected _canPipeline(
    pipeline: boolean | undefined,
    sql: string,
    autoCommit: boolean | undefined,
  ): boolean {
    return (
      pipeline === true &&
      this._pipelineMaxQueries > 1 &&
      this._pipelineMaxConnections > 0 &&
      // autoCommit:false sends Connection.query() down the prepare /
      // execute / close path, and the connection's refCount falls back to
      // zero between those steps - the 'idle' that fires there would hand
      // the connection back to the pool with the query only half done.
      autoCommit !== false &&
      this.config.autoCommit !== false &&
      !startsTransaction(sql)
    );
  }

  /**
   * Picks the pooled connection a pipelined query should ride on, or
   * undefined when the caller should take a connection of its own.
   *
   * Deliberately synchronous: it must never await, because everything in a
   * Promise.all() burst has to pick its connection and reach execute()
   * within a single event loop tick for PgSocket to coalesce the whole
   * burst into one write per connection. Opening another connection is
   * started here but never awaited by the caller that triggered it.
   */
  protected _acquireShared(): PipelineSlot | undefined {
    const slots = this._pipelineSlots;
    const l = slots.length;
    let best: PipelineSlot | undefined;
    let slot: PipelineSlot;
    let i: number;
    for (i = 0; i < l; i++) {
      slot = slots[i];
      /* istanbul ignore next - dropped on sight, so rarely observable */
      if (slot.connection?.inTransaction) continue;
      if (!best || slot.load < best.load) best = slot;
    }
    // Another connection is only worth opening once the least loaded one
    // already has something queued behind it: the server runs a single
    // connection's statements serially, so spreading is what buys the
    // parallelism, and this way an idle burst still reuses what is open.
    if ((!best || best.load > 0) && l < this._pipelineMaxConnections)
      return this._growPipeline();
    // Every slot is at its query cap and the pool has nothing left to
    // borrow: fall back to an exclusive connection, whose acquire queues
    // in the pool and gives the caller real backpressure.
    if (!best || best.load >= this._pipelineMaxQueries) return undefined;
    best.load++;
    return best;
  }

  /**
   * Starts borrowing one more connection and returns its slot right away,
   * already carrying the caller that triggered the growth.
   */
  protected _growPipeline(): PipelineSlot {
    const slot = { load: 1 } as PipelineSlot;
    slot.promise = this.acquire().then(
      connection => {
        slot.connection = connection;
        // 'idle' fires when nothing is in flight on the connection any
        // more (IntlConnection forwards its events to the owning
        // Connection), so it needs no further check - whoever finishes
        // goes straight back to the pool.
        connection.once('idle', () => {
          this._dropPipelineSlot(slot);
          this.release(connection).catch(e => this.emit('error', e));
        });
        return connection;
      },
      e => {
        this._dropPipelineSlot(slot);
        throw e;
      },
    );
    this._pipelineSlots.push(slot);
    return slot;
  }

  /**
   * Stops new queries joining a slot. Queries already on it are unaffected.
   */
  protected _dropPipelineSlot(slot: PipelineSlot): void {
    const i = this._pipelineSlots.indexOf(slot);
    if (i >= 0) this._pipelineSlots.splice(i, 1);
  }

  /**
   * Backstop for a transaction startsTransaction() could not see coming -
   * one opened inside a stored procedure, for instance. The connection is
   * still sound, but nothing else may join it while it is in a
   * transaction, so the slot goes away and the connection returns to the
   * pool once its own queries finish.
   */
  protected _checkSharedTransaction(
    slot: PipelineSlot,
    connection: Connection,
  ): void {
    if (connection.inTransaction) this._dropPipelineSlot(slot);
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
