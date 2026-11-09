import {
  type DataPoint,
  MeterProvider,
  MetricReader,
} from '@opentelemetry/sdk-metrics';
import { expect } from 'expect';
import { PostgrejsMetrics } from '../src/metrics.js';
import type { PoolLike } from '../src/types.js';

/**
 * PostgrejsMetrics against pools made by hand: the shapes a test server
 * does not give, such as a pool with no database or a unix socket.
 */
describe('postgrejs-otel metrics', () => {
  class TestReader extends MetricReader {
    protected onForceFlush(): Promise<void> {
      return Promise.resolve();
    }

    protected onShutdown(): Promise<void> {
      return Promise.resolve();
    }
  }

  let reader: TestReader;
  let meterProvider: MeterProvider;
  let recorder: PostgrejsMetrics;

  beforeEach(() => {
    reader = new TestReader();
    meterProvider = new MeterProvider({ readers: [reader] });
    recorder = new PostgrejsMetrics('test', '1');
    recorder.setMeterProvider(meterProvider);
  });

  afterEach(() => meterProvider.shutdown());

  async function points(name: string): Promise<DataPoint<any>[]> {
    const { resourceMetrics } = await reader.collect();
    for (const scope of resourceMetrics.scopeMetrics) {
      for (const metric of scope.metrics) {
        if (metric.descriptor.name === name) return metric.dataPoints;
      }
    }
    return [];
  }

  function pool(config: PoolLike['config']): PoolLike {
    return {
      config,
      idleConnections: 0,
      acquiredConnections: 0,
      pendingAcquires: 0,
    };
  }

  it('should name a pool with no name or database after its server', async () => {
    recorder.observePool(pool({ host: 'db.local', port: 6432 }));
    recorder.observePool(pool({ host: '::1' }));
    recorder.observePool(pool({ host: '/var/run/postgresql' }));
    recorder.observePool(pool({}));
    const limits = await points('db.client.connection.limit');
    expect(
      limits.map(p => [
        p.attributes['db.client.connection.pool.name'],
        p.attributes['server.port'],
        p.value,
      ]),
    ).toStrictEqual([
      ['db.local:6432', 6432, 10],
      ['[::1]:5432', 5432, 10],
      ['/var/run/postgresql', undefined, 10],
      ['postgresql', undefined, 10],
    ]);
  });

  it('should drop a pool that was collected', async () => {
    recorder.observePool(pool({ name: 'kept', max: 2, minIdle: 1 }));
    // What a WeakRef gives back once its pool is gone.
    (recorder as any)._pools.add({ deref: () => undefined });
    const limits = await points('db.client.connection.limit');
    expect(limits.map(p => p.value)).toStrictEqual([2]);
    const [idleMin] = await points('db.client.connection.idle.min');
    expect(idleMin.value).toStrictEqual(1);
    expect((recorder as any)._pools.size).toStrictEqual(1);
  });

  it('should ignore an end with no start, and a pool it does not know', async () => {
    const p = pool({ name: 'x' });
    recorder.operationEnd({});
    recorder.waitEnd({}, p);
    recorder.checkin({}, p);
    recorder.forgetPool(p);
    expect(await points('db.client.operation.duration')).toStrictEqual([]);
    expect(await points('db.client.connection.wait_time')).toStrictEqual([]);
    expect(await points('db.client.connection.use_time')).toStrictEqual([]);
  });

  it('should move to a new provider, leaving the old one behind', async () => {
    recorder.observePool(pool({ name: 'moved' }));
    expect((await points('db.client.connection.limit')).length).toBe(1);
    const next = new TestReader();
    const nextProvider = new MeterProvider({ readers: [next] });
    try {
      recorder.setMeterProvider(nextProvider);
      recorder.timeout(pool({ name: 'moved' }));
      const { resourceMetrics } = await next.collect();
      const names = resourceMetrics.scopeMetrics.flatMap(s =>
        s.metrics.map(m => m.descriptor.name),
      );
      expect(names).toContain('db.client.connection.timeouts');
      expect(names).toContain('db.client.connection.limit');
    } finally {
      await nextProvider.shutdown();
    }
  });
});
