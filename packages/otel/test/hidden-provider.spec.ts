import process from 'node:process';
import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';
import { Connection } from 'postgrejs';
import { PostgrejsInstrumentation } from 'postgrejs-otel';
import { warnOnHiddenProvider } from '../src/hidden-provider.js';

/**
 * A provider registered through an older minor of @opentelemetry/api than
 * the copy this package loaded is invisible to it, and every span is
 * dropped without a word. That is what an application on API 1.10 running
 * dd-trace 6 (which keeps a 1.9.x copy) gets, so it has to be reported.
 */
describe('postgrejs-otel hidden provider warning', () => {
  const key = Symbol.for('opentelemetry.js.api.1');
  let saved: unknown;
  let warnings: string[];
  let emitWarning: typeof process.emitWarning;

  /** Installs a registry as dd-trace's 1.9.1 copy would have left it. */
  function installOlderRegistry() {
    (globalThis as any)[key] = { version: '1.9.1', trace: {} };
  }

  beforeEach(() => {
    saved = (globalThis as any)[key];
    warnings = [];
    emitWarning = process.emitWarning;
    process.emitWarning = ((msg: string, opts: any) => {
      warnings.push(`${opts?.code}: ${msg}`);
    }) as any;
  });

  afterEach(() => {
    process.emitWarning = emitWarning;
    (globalThis as any)[key] = saved;
  });

  it('should warn when the registered provider is out of reach', () => {
    installOlderRegistry();
    warnOnHiddenProvider();
    expect(warnings.length).toStrictEqual(1);
    expect(warnings[0]).toMatch(
      /^POSTGREJS_OTEL_HIDDEN_PROVIDER: .*@opentelemetry\/api 1\.9\.1/,
    );
  });

  it('should stay quiet with no provider registered', () => {
    (globalThis as any)[key] = { version: '1.9.1' };
    warnOnHiddenProvider();
    delete (globalThis as any)[key];
    warnOnHiddenProvider();
    expect(warnings).toEqual([]);
  });

  it('should stay quiet when the provider is visible', () => {
    trace.setGlobalTracerProvider(new BasicTracerProvider());
    try {
      warnOnHiddenProvider();
    } finally {
      trace.disable();
    }
    expect(warnings).toEqual([]);
  });

  it('should check once, at the first span, when using the global provider', async () => {
    const conn = new Connection();
    await conn.connect();
    const instrumentation = new PostgrejsInstrumentation();
    try {
      // Registered after construction, as an application may well do.
      installOlderRegistry();
      await conn.query('select 1');
      await conn.query('select 1');
    } finally {
      instrumentation.disable();
      (globalThis as any)[key] = saved;
      await conn.close(0);
    }
    expect(warnings.length).toStrictEqual(1);
  });

  it('should not check when given a provider of its own', async () => {
    const conn = new Connection();
    await conn.connect();
    const exporter = new InMemorySpanExporter();
    const instrumentation = new PostgrejsInstrumentation({ enabled: false });
    instrumentation.setTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      }),
    );
    instrumentation.enable();
    try {
      installOlderRegistry();
      await conn.query('select 1');
    } finally {
      instrumentation.disable();
      (globalThis as any)[key] = saved;
      await conn.close(0);
    }
    expect(warnings).toEqual([]);
    expect(exporter.getFinishedSpans().length).toStrictEqual(1);
  });
});
