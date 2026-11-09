import diagnosticsChannel from 'node:diagnostics_channel';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';
import {
  Connection,
  type CopyTraceContext,
  DatabaseError,
  Pool,
  type PrepareTraceContext,
  type QueryTraceContext,
  type StatementExecuteTraceContext,
} from 'postgrejs';
import {
  type CopyContext,
  datadogDbmTags,
  PostgrejsInstrumentation,
  type PrepareContext,
  type QueryContext,
  type StatementExecuteContext,
} from 'postgrejs-otel';
import pkg from '../package.json' with { type: 'json' };

/* Compile-time check that the shapes this package declares for itself
   accept what postgrejs actually publishes. */
const _shapeCheck: (ctx: QueryTraceContext) => QueryContext = ctx => ctx;
const _copyShapeCheck: (ctx: CopyTraceContext) => CopyContext = ctx => ctx;
const _prepareShapeCheck: (ctx: PrepareTraceContext) => PrepareContext = ctx =>
  ctx;
const _statementShapeCheck: (
  ctx: StatementExecuteTraceContext,
) => StatementExecuteContext = ctx => ctx;
void _shapeCheck;
void _copyShapeCheck;
void _prepareShapeCheck;
void _statementShapeCheck;

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const tracer = provider.getTracer('test');

function spans(name?: string): ReadableSpan[] {
  return exporter
    .getFinishedSpans()
    .filter(s => s.name !== 'parent' && (!name || s.name === name));
}

function parentId(span: ReadableSpan): string | undefined {
  return span.parentSpanContext?.spanId;
}

/** Runs fn inside an active parent span and returns that span's id. */
async function inParent(fn: () => Promise<unknown>): Promise<string> {
  return tracer.startActiveSpan('parent', async parent => {
    try {
      await fn().catch(() => undefined);
    } finally {
      parent.end();
    }
    return parent.spanContext().spanId;
  });
}

describe('postgrejs-otel', () => {
  const contextManager = new AsyncLocalStorageContextManager();
  let instrumentation: PostgrejsInstrumentation;
  let conn: Connection;

  before(async () => {
    context.setGlobalContextManager(contextManager.enable());
    conn = new Connection();
    await conn.connect();
  });

  after(async () => {
    await conn.close(0);
    context.disable();
  });

  beforeEach(() => {
    exporter.reset();
    instrumentation = new PostgrejsInstrumentation({ enabled: false });
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
  });

  afterEach(() => instrumentation.disable());

  describe('query spans', () => {
    it('should record a query with the database semantic conventions', async () => {
      const parent = await inParent(() =>
        conn.query('select $1::int as n', { params: [7] }),
      );
      const [span] = spans();
      expect(spans().length).toStrictEqual(1);
      expect(span.name).toStrictEqual(conn.config.database);
      expect(span.kind).toStrictEqual(SpanKind.CLIENT);
      expect(parentId(span)).toStrictEqual(parent);
      expect(span.status.code).toStrictEqual(SpanStatusCode.UNSET);
      expect(span.attributes).toEqual({
        'db.system.name': 'postgresql',
        'db.namespace': conn.config.database,
        'server.address': conn.config.host,
        'server.port': conn.config.port || 5432,
        'db.query.text': 'select $1::int as n',
        'db.response.returned_rows': 1,
        'postgrejs.backend_pid': conn.processID,
      });
      expect(span.instrumentationScope).toEqual({
        name: 'postgrejs-otel',
        version: pkg.version,
        schemaUrl: undefined,
      });
    });

    it('should record execute() as a span too', async () => {
      await conn.execute('select 1; select 2');
      const [span] = spans();
      expect(span.attributes['db.query.text']).toStrictEqual(
        'select 1; select 2',
      );
      expect(span.attributes['db.response.returned_rows']).toBeUndefined();
    });

    it('should record a server error with its SQLSTATE', async () => {
      let caught: unknown;
      await conn.query('select * from no_such_table_for_otel').catch(e => {
        caught = e;
      });
      expect(caught).toBeInstanceOf(DatabaseError);
      const [span] = spans();
      expect(span.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: (caught as Error).message,
      });
      expect(span.attributes['db.response.status_code']).toStrictEqual('42P01');
      expect(span.attributes['error.type']).toStrictEqual('42P01');
      expect(span.events.map(e => e.name)).toEqual(['exception']);
    });

    it('should not record the statement when captureQueryText is false', async () => {
      instrumentation.setConfig({ captureQueryText: false });
      await conn.query('select 1');
      expect(spans()[0].attributes['db.query.text']).toBeUndefined();
    });

    it('should not start a root span when requireParentSpan is set', async () => {
      instrumentation.setConfig({ requireParentSpan: true });
      await conn.query('select 1');
      expect(spans()).toEqual([]);
      const parent = await inParent(() => conn.query('select 1'));
      expect(spans().map(parentId)).toEqual([parent]);
    });

    it('should record nothing for a pool or a failure outside a trace with requireParentSpan', async () => {
      instrumentation.setConfig({ requireParentSpan: true });
      const pool = new Pool({ max: 1 });
      try {
        await pool.query('select 1');
      } finally {
        await pool.close(0);
      }
      await expect(conn.query('select * from no_such_table')).rejects.toThrow(
        DatabaseError,
      );
      expect(spans()).toEqual([]);
    });

    it('should call the request and response hooks', async () => {
      const calls: string[] = [];
      instrumentation.setConfig({
        requestHook: (span, info) => {
          calls.push(`request ${info.operation} ${info.context.sql}`);
          span.setAttribute('custom', 'yes');
        },
        responseHook: (_span, info) => {
          calls.push(
            `response ${info.operation} ${info.operation !== 'copy' && info.context.result !== undefined}`,
          );
        },
      });
      await conn.query('select 1');
      await conn.execute('select 2');
      expect(calls).toEqual([
        'request query select 1',
        'response query true',
        'request execute select 2',
        'response execute true',
      ]);
      expect(spans()[0].attributes.custom).toStrictEqual('yes');
    });

    it('should keep running the query when a hook throws', async () => {
      instrumentation.setConfig({
        requestHook: () => {
          throw new Error('request hook');
        },
        responseHook: () => {
          throw new Error('response hook');
        },
      });
      const result = await conn.query('select 1');
      expect(result.rows).toEqual([[1]]);
      expect(spans().length).toStrictEqual(1);
    });
  });

  describe('pool spans', () => {
    it('should nest connect under acquire, and the query beside acquire', async () => {
      const pool = new Pool({ max: 1 });
      let parent: string | undefined;
      try {
        parent = await inParent(() => pool.query('select 1'));
      } finally {
        await pool.close(0);
      }
      const acquire = spans('postgrejs.pool.acquire')[0];
      const connect = spans('postgrejs.connect')[0];
      const query = spans(pool.config.database)[0];
      expect(acquire.kind).toStrictEqual(SpanKind.INTERNAL);
      expect(connect.kind).toStrictEqual(SpanKind.CLIENT);
      expect(parentId(acquire)).toStrictEqual(parent);
      expect(parentId(connect)).toStrictEqual(acquire.spanContext().spanId);
      expect(parentId(query)).toStrictEqual(parent);
      expect(typeof connect.attributes['postgrejs.backend_pid']).toStrictEqual(
        'number',
      );
      expect(connect.attributes['postgrejs.backend_pid']).toStrictEqual(
        query.attributes['postgrejs.backend_pid'],
      );
    });

    it('should record a connection that cannot be opened', async () => {
      const pool = new Pool({ max: 1, port: 1, acquireTimeoutMillis: 2000 });
      try {
        await inParent(() => pool.acquire());
      } finally {
        await pool.close(0);
      }
      const connect = spans('postgrejs.connect')[0];
      const acquire = spans('postgrejs.pool.acquire')[0];
      expect(connect.status.code).toStrictEqual(SpanStatusCode.ERROR);
      expect(connect.attributes['error.type']).toStrictEqual('ECONNREFUSED');
      expect(connect.attributes['server.port']).toStrictEqual(1);
      expect(acquire.status.code).toStrictEqual(SpanStatusCode.ERROR);
    });

    it('should record a standalone connect with no pool', async () => {
      const c = new Connection();
      try {
        await c.connect();
      } finally {
        await c.close(0);
      }
      expect(spans().map(s => s.name)).toEqual(['postgrejs.connect']);
      expect(parentId(spans()[0])).toBeUndefined();
    });
  });

  describe('copy spans', () => {
    /** COPY spans end at ReadyForQuery, which can follow the stream's end. */
    async function settled(): Promise<void> {
      const until = Date.now() + 10_000;
      while (
        Date.now() < until &&
        !spans().some(s => s.name.startsWith('COPY'))
      )
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    // beforeEach's truncate leaves a span of its own.
    const copySpan = () => spans().find(s => s.name.startsWith('COPY'))!;

    async function drain(stream: Readable): Promise<string> {
      let out = '';
      await pipeline(
        stream,
        new Writable({
          write(chunk, _enc, cb) {
            out += chunk.toString();
            cb();
          },
        }),
      );
      return out;
    }

    before(() =>
      conn.execute(`
        drop table if exists copy_otel_test;
        create table copy_otel_test (id int4 primary key, name text);`),
    );
    beforeEach(() => conn.execute('truncate table copy_otel_test'));
    after(() => conn.execute('drop table if exists copy_otel_test'));

    it('should record copyTo() as a COPY span with rows and bytes', async () => {
      await conn.execute(
        `insert into copy_otel_test values (1, 'a'), (2, 'b')`,
      );
      exporter.reset();
      let out = '';
      const parent = await inParent(async () => {
        out = await drain(await conn.copyTo('copy copy_otel_test to stdout'));
        await settled();
      });
      const span = copySpan();
      expect(span.name).toStrictEqual('COPY');
      expect(span.kind).toStrictEqual(SpanKind.CLIENT);
      expect(parentId(span)).toStrictEqual(parent);
      expect(span.attributes).toMatchObject({
        'db.system.name': 'postgresql',
        'db.operation.name': 'COPY',
        'db.query.text': 'copy copy_otel_test to stdout',
        'db.response.returned_rows': 2,
        'postgrejs.copy.direction': 'to',
        'postgrejs.copy.bytes': Buffer.byteLength(out),
      });
      expect(span.attributes['db.collection.name']).toBeUndefined();
      expect(span.attributes['postgrejs.copy.aborted']).toBeUndefined();
    });

    it('should name the table for copyFromRows()', async () => {
      await conn.copyFromRows('copy_otel_test', [
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
      await settled();
      const span = spans('COPY copy_otel_test')[0];
      expect(span.attributes).toMatchObject({
        'db.operation.name': 'COPY',
        'db.collection.name': 'copy_otel_test',
        'postgrejs.copy.direction': 'from',
        'postgrejs.copy.rows': 3,
      });
      expect(span.attributes['db.response.returned_rows']).toBeUndefined();
      expect(span.attributes['postgrejs.copy.bytes']).toBeGreaterThan(0);
    });

    it('should record a CopyFail as an error, with what was sent', async () => {
      const stream = await conn.copyFrom('copy copy_otel_test from stdin');
      const source = Readable.from(
        (function* () {
          yield '1\ta\n';
          throw new Error('source exploded');
        })(),
      );
      await expect(pipeline(source, stream)).rejects.toThrow('source exploded');
      await settled();
      const span = copySpan();
      expect(span.status.code).toStrictEqual(SpanStatusCode.ERROR);
      expect(span.attributes['db.response.status_code']).toStrictEqual('57014');
      expect(span.attributes['postgrejs.copy.bytes']).toStrictEqual(4);
      expect(span.attributes['postgrejs.copy.rows']).toBeUndefined();
    });

    it('should mark a copyTo() its consumer gave up on as aborted, not failed', async () => {
      const stream = await conn.copyTo(
        `copy (select g, repeat('x', 100) from generate_series(1, 200000) g) to stdout`,
      );
      stream.destroy();
      await settled();
      const span = copySpan();
      expect(span.status.code).toStrictEqual(SpanStatusCode.UNSET);
      expect(span.attributes['postgrejs.copy.aborted']).toStrictEqual(true);
    });

    it('should put the sqlComment in front of a COPY too', async () => {
      instrumentation.setConfig({ sqlComment: { tags: { app: 'x' } } });
      const out = await drain(
        await conn.copyTo('copy (select current_query()) to stdout'),
      );
      expect(out).toStrictEqual(
        "/*app='x'*/ copy (select current_query()) to stdout\n",
      );
    });

    it('should call the hooks with the copy operation', async () => {
      const calls: string[] = [];
      instrumentation.setConfig({
        requestHook: (_span, info) => calls.push(`request ${info.operation}`),
        responseHook: (_span, info) => calls.push(`response ${info.operation}`),
      });
      await drain(await conn.copyTo('copy copy_otel_test to stdout'));
      await settled();
      expect(calls).toEqual(['request copy', 'response copy']);
    });
  });

  describe('prepared statement spans', () => {
    it('should record prepare() as PREPARE and each execution as a statement', async () => {
      const parent = await inParent(async () => {
        const statement = await conn.prepare('select $1::int as n');
        try {
          await statement.execute({ params: [1] });
          await statement.execute({ params: [2] });
        } finally {
          await statement.close();
        }
      });
      const [prepare, ...executions] = spans();
      expect(spans().length).toStrictEqual(3);
      expect(prepare.name).toStrictEqual('PREPARE');
      expect(prepare.kind).toStrictEqual(SpanKind.CLIENT);
      expect(parentId(prepare)).toStrictEqual(parent);
      expect(prepare.attributes['db.operation.name']).toStrictEqual('PREPARE');
      expect(prepare.attributes['db.query.text']).toStrictEqual(
        'select $1::int as n',
      );
      for (const span of executions) {
        expect(span.name).toStrictEqual(conn.config.database);
        expect(parentId(span)).toStrictEqual(parent);
        expect(span.attributes['db.query.text']).toStrictEqual(
          'select $1::int as n',
        );
        expect(span.attributes['db.response.returned_rows']).toStrictEqual(1);
        expect(span.attributes['db.operation.name']).toBeUndefined();
        expect(span.attributes['db.operation.batch.size']).toBeUndefined();
      }
    });

    it('should record executeBatch() as one span with the batch size', async () => {
      const statement = await conn.prepare('select $1::int');
      try {
        await statement.executeBatch([[1], [2], [3]]);
        await statement.executeBatch([[4]]);
      } finally {
        await statement.close();
      }
      const [, batch, single] = spans();
      expect(spans().length).toStrictEqual(3);
      expect(batch.attributes['db.operation.batch.size']).toStrictEqual(3);
      expect(batch.attributes['db.response.returned_rows']).toBeUndefined();
      // A batch of one is not a batch to the conventions.
      expect(single.attributes['db.operation.batch.size']).toBeUndefined();
    });

    it('should record a failed execution with its SQLSTATE', async () => {
      const statement = await conn.prepare('select 1 / $1::int');
      try {
        await statement.execute({ params: [0] }).catch(() => undefined);
      } finally {
        await statement.close();
      }
      const span = spans()[1];
      expect(span.status.code).toStrictEqual(SpanStatusCode.ERROR);
      expect(span.attributes['db.response.status_code']).toStrictEqual('22012');
    });

    it('should record a query that prepares a statement for itself once', async () => {
      const r = await conn.query('select 1', { cursor: true });
      await r.cursor!.close();
      expect(spans().map(s => s.name)).toStrictEqual([conn.config.database]);
    });

    it('should pass the operation to the hooks', async () => {
      const seen: string[] = [];
      instrumentation.setConfig({
        requestHook: (_span, info) => seen.push('request ' + info.operation),
        responseHook: (_span, info) => seen.push('response ' + info.operation),
      });
      const statement = await conn.prepare('select 1');
      try {
        await statement.execute();
      } finally {
        await statement.close();
      }
      expect(seen).toStrictEqual([
        'request prepare',
        'response prepare',
        'request executePrepared',
        'response executePrepared',
      ]);
    });

    it('should comment the statement at prepare(), without a traceparent', async () => {
      instrumentation.setConfig({
        sqlComment: { tags: { app: 'billing' }, traceparent: true },
      });
      const statement = await conn.prepare('select current_query()');
      let result: any;
      try {
        result = await statement.execute();
      } finally {
        await statement.close();
      }
      expect(result.rows[0][0]).toStrictEqual(
        "/*app='billing'*/ select current_query()",
      );
      expect(spans()[1].attributes['db.query.text']).toStrictEqual(
        "/*app='billing'*/ select current_query()",
      );
    });
  });

  describe('sqlComment', () => {
    it('should put the tags and the traceparent in front of the statement', async () => {
      instrumentation.setConfig({
        sqlComment: { tags: { app: "it's" }, traceparent: true },
      });
      const result = await conn.query('select current_query()');
      const [span] = spans();
      const { traceId, spanId } = span.spanContext();
      expect(result.rows![0][0]).toStrictEqual(
        `/*app='it\\'s',traceparent='00-${traceId}-${spanId}-01'*/ select current_query()`,
      );
      // The span keeps the statement as the application wrote it.
      expect(span.attributes['db.query.text']).toStrictEqual(
        'select current_query()',
      );
    });

    it('should write the keys Datadog Database Monitoring reads', async () => {
      instrumentation.setConfig({
        sqlComment: {
          tags: datadogDbmTags({ service: 'api', env: 'prod', version: '1.4' }),
        },
      });
      const result = await conn.execute('select current_query()');
      const { database, host } = conn.config;
      expect(result.results[0].rows![0][0]).toStrictEqual(
        `/*dddb='${database}',dddbs='api',dde='prod',ddh='${encodeURIComponent(host!)}',` +
          `ddps='api',ddpv='1.4'*/ select current_query()`,
      );
    });

    it('should leave the statement alone when the tags come back empty', async () => {
      instrumentation.setConfig({
        sqlComment: { tags: () => ({ none: undefined }) },
      });
      const result = await conn.query('select current_query()');
      expect(result.rows![0][0]).toStrictEqual('select current_query()');
    });

    it('should leave the statement alone when the tags function throws', async () => {
      instrumentation.setConfig({
        sqlComment: {
          tags: () => {
            throw new Error('tags');
          },
        },
      });
      const result = await conn.query('select current_query()');
      expect(result.rows![0][0]).toStrictEqual('select current_query()');
    });

    it('should add no traceparent when there is no span', async () => {
      instrumentation.setConfig({
        requireParentSpan: true,
        sqlComment: { tags: { a: 'b' }, traceparent: true },
      });
      const result = await conn.query('select current_query()');
      expect(result.rows![0][0]).toStrictEqual(
        "/*a='b'*/ select current_query()",
      );
    });
  });

  describe('events published by hand', () => {
    /* Shapes the driver does not produce against the test server: a unix
       socket, a synchronous throw, a rejection that is not an Error. */
    const channel = diagnosticsChannel.tracingChannel<any, any>(
      'postgrejs:query',
    );
    const ctx = (config: object) => ({
      sql: 'select 1',
      paramCount: 0,
      connection: { config },
    });

    it('should record a unix socket without a port', async () => {
      await channel.tracePromise(async () => undefined, ctx({ host: '/tmp' }));
      const [span] = spans();
      expect(span.name).toStrictEqual('postgresql');
      expect(span.attributes['server.address']).toStrictEqual('/tmp');
      expect(span.attributes['server.port']).toBeUndefined();
      expect(span.attributes['postgrejs.backend_pid']).toBeUndefined();
    });

    it('should end the span on a synchronous throw', () => {
      expect(() =>
        channel.tracePromise(() => {
          throw new TypeError('sync');
        }, ctx({})),
      ).toThrow('sync');
      const [span] = spans();
      expect(span.attributes['error.type']).toStrictEqual('TypeError');
      expect(span.attributes['server.address']).toBeUndefined();
    });

    it('should end a connect span on a synchronous throw', () => {
      const connect = diagnosticsChannel.tracingChannel<any, any>(
        'postgrejs:connect',
      );
      expect(() =>
        connect.tracePromise(
          () => {
            throw new Error('sync');
          },
          { config: {} },
        ),
      ).toThrow('sync');
      expect(spans('postgrejs.connect')[0].attributes['error.type']).toBe(
        'Error',
      );
    });

    it('should record a rejection that is not an Error', async () => {
      await expect(
        channel.tracePromise(() => Promise.reject('plain'), ctx({})),
      ).rejects.toStrictEqual('plain');
      const [span] = spans();
      expect(span.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: 'plain',
      });
      expect(span.attributes['error.type']).toStrictEqual('String');
      expect(span.events).toEqual([]);
    });
  });

  describe('Instrumentation interface', () => {
    it('should record nothing once disabled, and enable only once', async () => {
      instrumentation.enable();
      await conn.query('select 1');
      expect(spans().length).toStrictEqual(1);
      instrumentation.disable();
      instrumentation.disable();
      expect(instrumentation.getConfig().enabled).toStrictEqual(false);
      await conn.query('select 1');
      expect(spans().length).toStrictEqual(1);
    });

    it('should keep enabled as it is when the config is replaced', () => {
      instrumentation.setConfig({ enabled: false, captureQueryText: false });
      expect(instrumentation.getConfig()).toEqual({
        enabled: true,
        captureQueryText: false,
      });
    });

    it('should work with registerInstrumentations()', async () => {
      instrumentation.disable();
      const other = new PostgrejsInstrumentation();
      const unregister = registerInstrumentations({
        instrumentations: [other],
        tracerProvider: provider,
        meterProvider: {} as any,
      });
      try {
        await conn.query('select 1');
      } finally {
        unregister();
      }
      expect(spans().length).toStrictEqual(1);
      expect(other.getConfig().enabled).toStrictEqual(false);
      expect(other.instrumentationName).toStrictEqual('postgrejs-otel');
    });

    it('should use the global tracer provider by default', async () => {
      instrumentation.disable();
      trace.setGlobalTracerProvider(provider);
      const other = new PostgrejsInstrumentation();
      try {
        await conn.query('select 1');
      } finally {
        other.disable();
        trace.disable();
      }
      expect(spans().length).toStrictEqual(1);
    });
  });
});
