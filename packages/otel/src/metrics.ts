import { performance } from 'node:perf_hooks';
import {
  type Attributes,
  type BatchObservableCallback,
  type Counter,
  type Histogram,
  type Meter,
  type MeterProvider,
  metrics,
  type ObservableUpDownCounter,
} from '@opentelemetry/api';
import type { PoolLike } from './types.js';

/* Advised by the database metric conventions. */
const DURATION_BUCKETS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10];
const ROW_BUCKETS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];

/* The span attributes a metric keeps: the ones the conventions list for
   db.client.operation.duration, minus db.query.text, which is opt-in and
   would give every distinct statement a series of its own. */
const OPERATION_KEYS = [
  'db.system.name',
  'db.namespace',
  'db.operation.name',
  'db.collection.name',
  'server.address',
  'server.port',
];

/* What Pool uses when its configuration leaves these out. */
const DEFAULT_MAX = 10;
const DEFAULT_MIN_IDLE = 0;

interface Instruments {
  meter: Meter;
  duration: Histogram;
  returnedRows: Histogram;
  waitTime: Histogram;
  createTime: Histogram;
  useTime: Histogram;
  timeouts: Counter;
  count: ObservableUpDownCounter;
  limit: ObservableUpDownCounter;
  idleMin: ObservableUpDownCounter;
  pending: ObservableUpDownCounter;
  observe: BatchObservableCallback;
}

/**
 * The metrics postgrejs-otel records, following the OpenTelemetry
 * database metric conventions: how long operations take and how many rows
 * they return, and how full each pool is and how long its connections
 * are waited for, opened and held.
 *
 * @internal
 */
/* Timed from the tracing events rather than read off the spans, because a
   span is not always made: with requireParentSpan, an operation outside
   any trace has none, and it still took the time it took. */
export class PostgrejsMetrics {
  protected _meterProvider?: MeterProvider;
  protected _instruments?: Instruments;
  protected _starts = new WeakMap<object, number>();
  protected _operationAttributes = new WeakMap<object, Attributes>();
  protected _checkouts = new WeakMap<object, number>();
  protected _pools = new Set<WeakRef<PoolLike>>();
  protected _known = new WeakSet<PoolLike>();
  protected _poolAttributes = new WeakMap<PoolLike, Attributes>();
  /* The pool names last observed, with their attributes. A name whose
     pools have all gone is observed at zero once: the SDK keeps reporting
     the last value of a series nobody observes any more, which would show
     a closed pool's connections as open for good. */
  protected _observed = new Map<string, Attributes>();

  constructor(
    readonly name: string,
    readonly version: string,
  ) {}

  /**
   * Records with this provider from now on instead of the global one.
   *
   * @param meterProvider The provider.
   */
  setMeterProvider(meterProvider: MeterProvider): void {
    this._meterProvider = meterProvider;
    this.reset();
  }

  /** Drops the instruments, so the next record creates them again. */
  reset(): void {
    const instruments = this._instruments;
    if (!instruments) return;
    this._instruments = undefined;
    instruments.meter.removeBatchObservableCallback(instruments.observe, [
      instruments.count,
      instruments.limit,
      instruments.idleMin,
      instruments.pending,
    ]);
  }

  /**
   * Notes when an operation started and what it is.
   *
   * @param ctx The context the driver published.
   * @param attributes The operation's span attributes; only the ones a
   * metric may carry are kept.
   */
  operationStart(ctx: object, attributes: Attributes): void {
    const kept: Attributes = {};
    for (const key of OPERATION_KEYS) {
      if (attributes[key] !== undefined) kept[key] = attributes[key];
    }
    this._operationAttributes.set(ctx, kept);
    this._starts.set(ctx, performance.now());
  }

  /**
   * Records an operation that ended, failed or not.
   *
   * @param ctx The context the driver published, with `error` set when
   * the operation failed.
   * @param rows The rows it returned, when it returns rows and succeeded.
   */
  operationEnd(ctx: { error?: unknown }, rows?: number): void {
    const seconds = this._elapsed(ctx);
    const base = this._operationAttributes.get(ctx);
    if (seconds === undefined || !base) return;
    this._operationAttributes.delete(ctx);
    const attributes =
      ctx.error === undefined
        ? base
        : { ...base, ...errorAttributes(ctx.error) };
    const instruments = this._get();
    instruments.duration.record(seconds, attributes);
    if (rows !== undefined) instruments.returnedRows.record(rows, attributes);
  }

  /**
   * Notes the start of something timed against a pool: a wait for a
   * connection, or opening one.
   *
   * @param ctx The context the driver published.
   */
  timedStart(ctx: object): void {
    this._starts.set(ctx, performance.now());
  }

  /**
   * Records how long a caller waited for a pooled connection.
   *
   * @param ctx The acquire context.
   * @param pool The pool waited on.
   */
  waitEnd(ctx: object, pool: PoolLike): void {
    const seconds = this._elapsed(ctx);
    if (seconds !== undefined)
      this._get().waitTime.record(seconds, this._attributesOf(pool));
  }

  /**
   * Records how long a pool took to open a connection.
   *
   * @param ctx The connect context.
   * @param pool The pool that opened it.
   */
  createEnd(ctx: object, pool: PoolLike): void {
    const seconds = this._elapsed(ctx);
    if (seconds !== undefined)
      this._get().createTime.record(seconds, this._attributesOf(pool));
  }

  /**
   * Notes a pooled connection handed out.
   *
   * @param resource The pool's own object for the connection.
   */
  checkout(resource: object): void {
    this._checkouts.set(resource, performance.now());
  }

  /**
   * Records how long a pooled connection was held, now that it is back.
   *
   * @param resource The pool's own object for the connection.
   * @param pool The pool it came back to.
   */
  checkin(resource: object, pool: PoolLike): void {
    const start = this._checkouts.get(resource);
    if (start === undefined) return;
    this._checkouts.delete(resource);
    this._get().useTime.record(
      (performance.now() - start) / 1000,
      this._attributesOf(pool),
    );
  }

  /**
   * Counts a caller that gave up waiting for a pooled connection.
   *
   * @param pool The pool waited on.
   */
  timeout(pool: PoolLike): void {
    this._get().timeouts.add(1, this._attributesOf(pool));
  }

  /**
   * Starts reporting how full a pool is. Reporting stops when the pool
   * closes or is collected.
   *
   * @param pool The pool.
   */
  observePool(pool: PoolLike): void {
    if (this._known.has(pool)) return;
    this._known.add(pool);
    this._pools.add(new WeakRef(pool));
    // The pool gauges are observed only once their instruments exist.
    this._get();
  }

  /**
   * Stops reporting a pool.
   *
   * @param pool The pool.
   */
  forgetPool(pool: PoolLike): void {
    if (!this._known.has(pool)) return;
    this._known.delete(pool);
    for (const ref of this._pools) {
      if (ref.deref() === pool) this._pools.delete(ref);
    }
  }

  protected _elapsed(ctx: object): number | undefined {
    const start = this._starts.get(ctx);
    if (start === undefined) return;
    this._starts.delete(ctx);
    return (performance.now() - start) / 1000;
  }

  protected _get(): Instruments {
    if (this._instruments) return this._instruments;
    const meter = (this._meterProvider ?? metrics.getMeterProvider()).getMeter(
      this.name,
      this.version,
    );
    const histogram = (
      name: string,
      unit: string,
      description: string,
      buckets: number[],
    ) =>
      meter.createHistogram(name, {
        unit,
        description,
        advice: { explicitBucketBoundaries: buckets },
      });
    const connections = (name: string, description: string) =>
      meter.createObservableUpDownCounter(name, {
        unit: '{connection}',
        description,
      });
    const instruments: Instruments = {
      meter,
      duration: histogram(
        'db.client.operation.duration',
        's',
        'Duration of database client operations.',
        DURATION_BUCKETS,
      ),
      returnedRows: histogram(
        'db.client.response.returned_rows',
        '{row}',
        'The actual number of records returned by the database operation.',
        ROW_BUCKETS,
      ),
      waitTime: histogram(
        'db.client.connection.wait_time',
        's',
        'The time it took to obtain an open connection from the pool.',
        DURATION_BUCKETS,
      ),
      createTime: histogram(
        'db.client.connection.create_time',
        's',
        'The time it took to create a new connection.',
        DURATION_BUCKETS,
      ),
      useTime: histogram(
        'db.client.connection.use_time',
        's',
        'The time between borrowing a connection and returning it to the pool.',
        DURATION_BUCKETS,
      ),
      timeouts: meter.createCounter('db.client.connection.timeouts', {
        unit: '{timeout}',
        description:
          'The number of connection timeouts that have occurred trying to obtain a connection from the pool.',
      }),
      count: connections(
        'db.client.connection.count',
        'The number of connections that are currently in the state described by the state attribute.',
      ),
      limit: connections(
        'db.client.connection.limit',
        'The maximum number of open connections allowed.',
      ),
      idleMin: connections(
        'db.client.connection.idle.min',
        'The minimum number of idle open connections allowed.',
      ),
      pending: meter.createObservableUpDownCounter(
        'db.client.connection.pending_requests',
        {
          unit: '{request}',
          description:
            'The number of current pending requests for an open connection.',
        },
      ),
      observe: result => this._observePools(result, instruments),
    };
    meter.addBatchObservableCallback(instruments.observe, [
      instruments.count,
      instruments.limit,
      instruments.idleMin,
      instruments.pending,
    ]);
    this._instruments = instruments;
    return instruments;
  }

  /* Pools that share a name are added up: the conventions name a pool
     after its database when it has no name of its own, and two series with
     the same attributes would otherwise each overwrite the other. */
  protected _observePools(
    result: Parameters<BatchObservableCallback>[0],
    instruments: Instruments,
  ): void {
    const totals = new Map<
      string,
      {
        attributes: Attributes;
        idle: number;
        used: number;
        limit: number;
        idleMin: number;
        pending: number;
      }
    >();
    for (const ref of this._pools) {
      const pool = ref.deref();
      if (!pool) {
        this._pools.delete(ref);
        continue;
      }
      const attributes = this._attributesOf(pool);
      const key = attributes['db.client.connection.pool.name'] as string;
      let total = totals.get(key);
      if (!total) {
        total = {
          attributes,
          idle: 0,
          used: 0,
          limit: 0,
          idleMin: 0,
          pending: 0,
        };
        totals.set(key, total);
      }
      total.idle += pool.idleConnections;
      total.used += pool.acquiredConnections;
      total.limit += pool.config.max ?? DEFAULT_MAX;
      total.idleMin += pool.config.minIdle ?? DEFAULT_MIN_IDLE;
      total.pending += pool.pendingAcquires;
    }
    for (const [key, attributes] of this._observed) {
      if (totals.has(key)) continue;
      this._observed.delete(key);
      totals.set(key, {
        attributes,
        idle: 0,
        used: 0,
        limit: 0,
        idleMin: 0,
        pending: 0,
      });
    }
    for (const [key, total] of totals) {
      const a = total.attributes;
      if (total.limit) this._observed.set(key, a);
      result.observe(instruments.count, total.idle, {
        ...a,
        'db.client.connection.state': 'idle',
      });
      result.observe(instruments.count, total.used, {
        ...a,
        'db.client.connection.state': 'used',
      });
      result.observe(instruments.limit, total.limit, a);
      result.observe(instruments.idleMin, total.idleMin, a);
      result.observe(instruments.pending, total.pending, a);
    }
  }

  protected _attributesOf(pool: PoolLike): Attributes {
    let attributes = this._poolAttributes.get(pool);
    if (attributes) return attributes;
    const { name, database, host, port } = pool.config;
    attributes = { 'db.system.name': 'postgresql' };
    if (database) attributes['db.namespace'] = database;
    if (host) {
      attributes['server.address'] = host;
      if (!host.startsWith('/')) attributes['server.port'] = port || 5432;
    }
    /* The conventions' fallbacks when a pool has no name: the database,
       then the server, then the database system. */
    attributes['db.client.connection.pool.name'] =
      name || database || (host ? poolAddress(host, port) : 'postgresql');
    this._poolAttributes.set(pool, attributes);
    return attributes;
  }
}

/* An IPv6 address goes in brackets, as the conventions ask, so the port
   after it can be told apart; a unix socket directory has no port. */
function poolAddress(host: string, port?: number): string {
  if (host.startsWith('/')) return host;
  const address = host.includes(':') ? `[${host}]` : host;
  return `${address}:${port || 5432}`;
}

/**
 * `error.type`, and `db.response.status_code` when the server sent one,
 * for a failed operation.
 *
 * @param error What the operation failed with.
 * @returns The attributes.
 * @internal
 */
export function errorAttributes(error: unknown): Attributes {
  const code: unknown = (error as any)?.code;
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code))
    return { 'db.response.status_code': code, 'error.type': code };
  // A Node.js system error, e.g. ECONNREFUSED.
  if (typeof code === 'string') return { 'error.type': code };
  return {
    'error.type':
      (error as any)?.constructor?.name || /* c8 ignore next */ '_OTHER',
  };
}
