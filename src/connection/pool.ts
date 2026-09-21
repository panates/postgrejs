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
import { normalizeChannelName } from '../util/channel-name.js';
import { getConnectionConfig } from '../util/connection-config.js';
import { QueryRequest } from '../util/sql-tag.js';
import { startsCopy, startsTransaction } from '../util/starts-transaction.js';
import { Connection, type NotificationCallback } from './connection.js';
import { getIntlConnection, IntlConnection } from './intl-connection.js';
import type { PreparedStatement } from './prepared-statement.js';

/**
 * @deprecated `pipeline` is part of `QueryOptions` and
 * `ScriptExecuteOptions` now, so every connection takes it too. Kept as
 * an alias of that one field so the exported type still means what it
 * did.
 */
export type PoolPipelineOptions = Pick<QueryOptions, 'pipeline'>;

export type PoolQueryOptions = QueryOptions;
export type PoolScriptExecuteOptions = ScriptExecuteOptions;

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
  /**
   * Why a connection is about to be destroyed, for the ones that were not
   * destroyed on purpose. lightning-pool's own 'destroy' carries the
   * resource and nothing else, so the reason is recorded on the way in -
   * when the connection reports its close - and read back out when the
   * pool reports the removal.
   */
  protected readonly _destroyReasons = new WeakMap<IntlConnection, Error>();
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
        /* c8 ignore start */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.create',
            pool: this,
            message: `new connection creating`,
          });
        }
        /* c8 ignore stop */
        const intlCon = new IntlConnection(cfg);
        await intlCon.connect();
        intlCon.on('close', (reason?: Error) =>
          this._onConnectionClosed(intlCon, reason),
        );
        /* c8 ignore start */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.create',
            pool: this,
            message: `[${intlCon.processID}] connection created`,
          });
        }
        /* c8 ignore stop */
        return intlCon;
      },
      destroy: intlCon => {
        /* c8 ignore start */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.destroy',
            pool: this,
            message: `[${intlCon.processID}] connection destroy`,
          });
        }
        /* c8 ignore stop */
        return intlCon.close();
      },
      reset: (intlCon: IntlConnection) => {
        /* c8 ignore start */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.reset',
            pool: this,
            message: `[${intlCon.processID}] connection reset`,
          });
        }
        /* c8 ignore stop */
        intlCon.owner = undefined;
        intlCon.removeAllListeners();
        intlCon.once('close', (reason?: Error) =>
          this._onConnectionClosed(intlCon, reason),
        );
        (intlCon as any)._refCount = 0;
      },
      validate: async (intlCon: IntlConnection) => {
        /* c8 ignore start */
        if (this.listenerCount('debug')) {
          this.emit('debug', {
            location: 'Pool.factory.validate',
            pool: this,
            message: `[${intlCon.processID}] connection validate`,
          });
        }
        /* c8 ignore stop */
        if (intlCon.state !== ConnectionState.READY)
          throw new Error('Connection is not active');
        await intlCon.execute('select 1;');
      },
    };

    this._pool = new LightningPool<IntlConnection>(poolFactory, poolOptions);
    this._pool.on('return', (...args) => this.emit('release', ...args));
    this._pool.on('error', (...args) => this.emit('error', ...args));
    this._pool.on('acquire', (...args) => this.emit('acquire', ...args));
    this._pool.on('destroy', (intlCon: IntlConnection) =>
      this._onConnectionDestroyed(intlCon),
    );
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
    /* c8 ignore start */
    if (this.listenerCount('debug')) {
      this.emit('debug', {
        location: 'Pool.acquire',
        pool: this,
        message: `[${intlCon.processID}] acquired`,
      });
    }
    /* c8 ignore stop */
    const connection = new Connection(this, intlCon);
    /* c8 ignore next */
    if (this.listenerCount('debug'))
      connection.on('debug', (...args) => this.emit('debug', ...args));
    if (this.listenerCount('execute'))
      connection.on('execute', (...args) => this.emit('execute', ...args));
    if (this.listenerCount('query'))
      connection.on('query', (...args) => this.emit('query', ...args));
    // Forwarded with the connection that raised it, the way 'destroy'
    // names its own subject: a caller using pool.query() never sees the
    // Connection, so without this a notice raised by their statement has
    // nowhere to go at all.
    if (this.listenerCount('notice'))
      connection.on('notice', msg => this.emit('notice', msg, connection));
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
    sql: string | QueryRequest,
    options?: PoolScriptExecuteOptions,
  ): Promise<ScriptResult> {
    if (sql instanceof QueryRequest)
      sql = sql.stringify({ ...options, typeMap: options?.typeMap });
    const slot = this._canPipeline(
      options?.pipeline,
      sql,
      options?.autoCommit,
      options?.signal,
    )
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
  async query(
    sql: string | QueryRequest,
    options?: PoolQueryOptions,
  ): Promise<QueryResult> {
    if (sql instanceof QueryRequest) {
      if (options?.params)
        throw new TypeError(
          'A statement built with sql`` carries its own parameters; passing `params` as well is ambiguous',
        );
      options = { ...options, params: sql.params };
      sql = sql.sql;
    }
    // A cursor hands the caller something that outlives this call and must
    // keep its own portal on its own connection, so it can never share.
    const slot =
      !options?.cursor &&
      this._canPipeline(
        options?.pipeline,
        sql,
        options?.autoCommit,
        options?.signal,
      )
        ? this._acquireShared()
        : undefined;
    if (!slot) {
      const connection = await this.acquire();
      let result: QueryResult;
      try {
        result = await connection.query(sql, options);
      } catch (e) {
        await this.release(connection);
        throw e;
      }
      // A portal lives only as long as the transaction it was created in,
      // and outside an explicit one that is the implicit transaction any
      // other statement's Sync ends. So a connection carrying an open
      // cursor cannot go back in the pool when this call returns - handing
      // it to the next caller would destroy the cursor's portal, and did
      // ("portal ... does not exist", nondeterministically, depending on
      // which connection that caller happened to get). It goes back when
      // the cursor closes instead, which for-await and `await using` both
      // do on their own; a cursor that is never closed holds its
      // connection until the pool itself is closed.
      if (result.cursor) {
        result.cursor.once('close', () => {
          this.release(connection).catch(e => this.emit('error', e));
        });
        return result;
      }
      await this.release(connection);
      return result;
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

  /**
   * Takes a connection out of the pool, runs `fn` inside a transaction on
   * it, and gives the connection back however that ends.
   *
   * ```ts
   * await pool.transaction(async tx => {
   *   await tx.query('insert into orders (total) values ($1)', { params: [total] });
   *   await tx.query('update stock set n = n - 1 where sku = $1', { params: [sku] });
   * });
   * ```
   *
   * A transaction cannot be spread over pool.query() calls - each of those
   * is free to pick a different connection, and a transaction lives on
   * one. This is the way to get several statements onto the same one.
   */
  async transaction<T>(fn: (connection: Connection) => Promise<T>): Promise<T> {
    const connection = await this.acquire();
    try {
      return await connection.transaction(fn);
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
    // Folded here as well as in Connection.listen(): this emitter's keys
    // have to be the same strings the inner connection registers, or
    // unListen() would miss them.
    channel = normalizeChannelName(channel);
    // Bug: _initNotificationConnection() only ever bootstraps the shared
    // connection and registers every channel known at that moment - it
    // returns immediately once that connection already exists, so a second,
    // different channel added afterwards was recorded here but never
    // reached the server at all (same root cause fixed in
    // Connection.listen(), one layer up).
    const alreadyListening =
      !!this._notificationListeners.listenerCount(channel);
    this._notificationListeners.on(channel, callback);
    if (!this._notificationConnection) {
      await this._initNotificationConnection();
    } else if (!alreadyListening) {
      await this._notificationConnection.listen(channel, callback);
    }
  }

  async unListen(channel: string) {
    channel = normalizeChannelName(channel);
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

  /**
   * A pooled connection reported that its socket closed. `reason` is set
   * only when that was not asked for - see PgSocket._handleClose().
   */
  protected _onConnectionClosed(intlCon: IntlConnection, reason?: Error) {
    if (reason) this._destroyReasons.set(intlCon, reason);
    this._pool.destroy(intlCon);
  }

  /**
   * The pool has removed a connection. `destroy` fires the same way for an
   * ordinary eviction (idle timeout, close(), a failed validate) as for a
   * connection that died, so the reason is what tells them apart - an
   * admin kill, a failover and a network fault were otherwise
   * indistinguishable from a timeout, with nothing at all reported when
   * the connection had no query in flight to reject.
   */
  protected _onConnectionDestroyed(intlCon: IntlConnection) {
    const reason = this._destroyReasons.get(intlCon);
    if (reason) this._destroyReasons.delete(intlCon);
    this.emit('destroy', intlCon, reason);
    if (!reason) return;
    // Reported on 'error' as well, which is where pg puts a pooled
    // connection dying and where code ported from it listens. Safe to do
    // unconditionally here: SafeEventEmitter drops an 'error' that has no
    // listener instead of throwing, so this cannot turn a recovery the
    // pool already made into a crashed process. The error names the pid
    // and carries the socket error as its cause; no second argument, so
    // the existing `(err, meta)` shape lightning-pool emits for a
    // connection that could not be created stays unambiguous.
    this.emit('error', reason);
  }

  /**
   * Whether a one-shot query may share a pooled connection with the
   * queries already in flight on it. On by default: the alternative is
   * `max` being a ceiling on concurrent queries rather than on
   * connections, which is what made a burst of 1000 queries run as 100
   * sequential rounds of 10.
   *
   * The exclusions are not policy, they are statements that need a
   * connection to themselves for longer than the call takes to resolve:
   * a cursor reads from a portal afterwards, a transaction spans later
   * statements, a COPY holds the connection mid-stream, `autoCommit:
   * false` says a transaction is being managed by hand, and an
   * `AbortSignal` cancels by tearing down whatever the connection is
   * doing - which, shared, is not only this query.
   */
  protected _canPipeline(
    pipeline: boolean | undefined,
    sql: string,
    autoCommit: boolean | undefined,
    signal: AbortSignal | undefined,
  ): boolean {
    return (
      (pipeline != null ? pipeline : this.config.pipeline !== false) &&
      !signal &&
      this._pipelineMaxQueries > 1 &&
      this._pipelineMaxConnections > 0 &&
      autoCommit !== false &&
      this.config.autoCommit !== false &&
      !startsTransaction(sql) &&
      !startsCopy(sql)
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
      /* c8 ignore next */
      if (slot.connection?.inTransaction) continue;
      if (!best || slot.load < best.load) best = slot;
    }
    if ((!best || best.load > 0) && l < this._pipelineMaxConnections)
      return this._growPipeline();
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
        // Bug: a successful reconnect never re-issued LISTEN for anything -
        // Connection.close() clears `conn`'s own _notificationListeners,
        // and registerEvents() (which reads the Pool's, a separate
        // instance) was only ever called once, right after the first
        // connect(). A connection drop silently ended every subscription.
        conn
          .connect()
          .then(registerEvents)
          .catch(() => reConnect());
      }, 500).unref();
    };

    await conn.connect();
    await registerEvents();
  }
}
