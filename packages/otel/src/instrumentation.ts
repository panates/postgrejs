import { AsyncLocalStorage } from 'node:async_hooks';
import diagnosticsChannel, {
  type TracingChannelSubscribers,
} from 'node:diagnostics_channel';
import { createRequire } from 'node:module';
import {
  type Attributes,
  type Context,
  context,
  diag,
  type Link,
  type Span,
  type SpanContext,
  SpanKind,
  SpanStatusCode,
  trace,
  type Tracer,
  type TracerProvider,
} from '@opentelemetry/api';
import { warnOnHiddenProvider } from './hidden-provider.js';
import { buildSqlComment } from './sql-comment.js';
import type {
  ConnectContext,
  ConnectionInfo,
  ConnectionLike,
  CopyContext,
  CursorFetchContext,
  ExecuteContext,
  PipelineContext,
  PoolAcquireContext,
  PrepareContext,
  QueryContext,
  StatementExecuteContext,
} from './types.js';

/** The statement operations a request or response hook is called for. */
export type StatementInfo =
  | { operation: 'query'; context: QueryContext }
  | { operation: 'execute'; context: ExecuteContext }
  | { operation: 'copy'; context: CopyContext }
  | { operation: 'prepare'; context: PrepareContext }
  | { operation: 'executePrepared'; context: StatementExecuteContext }
  | { operation: 'pipeline'; context: PipelineContext }
  | { operation: 'fetch'; context: CursorFetchContext };

/** What to put in a comment in front of every statement. */
export interface SqlCommentOptions {
  /**
   * Key/value pairs to add, or a function that returns them for the
   * connection a statement runs on. Called once per statement.
   * {@link datadogDbmTags} returns one for Datadog Database Monitoring.
   */
  tags?:
    | Record<string, string | undefined>
    | ((connection: ConnectionLike) => Record<string, string | undefined>);
  /**
   * Adds the statement span's W3C `traceparent`, which ties a row in
   * `pg_stat_activity` or a database monitoring sample to the trace.
   *
   * It changes the statement text on every call. postgrejs reuses a
   * prepared statement only while the text stays the same, so with this on
   * every query is parsed again. Off by default.
   */
  traceparent?: boolean;
}

/** Options for {@link PostgrejsInstrumentation}. */
export interface PostgrejsInstrumentationConfig {
  /** Whether to subscribe on construction. Defaults to true. */
  enabled?: boolean;
  /**
   * Only create a span when there is already an active span to be its
   * parent, so that work outside any trace (a pool warming up, a
   * background job) does not produce root spans. Defaults to false.
   */
  requireParentSpan?: boolean;
  /**
   * Record the statement in `db.query.text`. Defaults to true.
   *
   * Parameter values are never recorded, but a statement sent without
   * parameters may carry literal values in its text; turn this off when
   * those can be sensitive.
   */
  captureQueryText?: boolean;
  /** Adds a comment in front of every statement. Off unless given. */
  sqlComment?: SqlCommentOptions;
  /**
   * Called when a statement span starts, before the statement is sent.
   * An exception it throws is logged through `diag` and otherwise ignored.
   */
  requestHook?: (span: Span, info: StatementInfo) => void;
  /**
   * Called before a statement span ends after the statement succeeded,
   * with `info.context.result` set. An exception it throws is logged
   * through `diag` and otherwise ignored.
   */
  responseHook?: (span: Span, info: StatementInfo) => void;
}

/**
 * Turns the events postgrejs publishes on `node:diagnostics_channel` into
 * OpenTelemetry spans.
 *
 * It creates a client span for every `query()` and `execute()`, for
 * every `prepare()` and every execution of a prepared statement, an
 * internal `postgrejs.pool.acquire` span for the time a caller waits for a
 * pooled connection, and a client `postgrejs.connect` span for each new
 * connection. Attributes follow the stable OpenTelemetry database
 * semantic conventions.
 *
 * It has the shape of the `Instrumentation` interface of
 * `@opentelemetry/instrumentation`, so it can be passed to
 * `registerInstrumentations()` or the Node SDK, without depending on that
 * package. It patches nothing, so the order of imports does not matter.
 *
 * @example
 * ```ts
 * import { registerInstrumentations } from '@opentelemetry/instrumentation';
 * import { PostgrejsInstrumentation } from 'postgrejs-otel';
 *
 * registerInstrumentations({
 *   instrumentations: [new PostgrejsInstrumentation()],
 * });
 * ```
 */
/* No `@opentelemetry/instrumentation` dependency: its base class exists to
   patch modules through require/import hooks, and nothing here needs one.
   Subscribing to a channel by name works whichever copy of postgrejs the
   application loaded, ESM or bundled. */
export class PostgrejsInstrumentation {
  protected _config: PostgrejsInstrumentationConfig;
  protected _tracer: Tracer;
  protected _enabled = false;
  protected _spans = new WeakMap<object, Span>();
  protected _connAttributes = new WeakMap<ConnectionInfo, Attributes>();
  /* The span of the statement that opened each cursor, which every fetch
     from it links to: the statement's span is over before the first fetch,
     and a fetch's parent is whatever the reader had active. */
  protected _cursorOrigins = new WeakMap<object, SpanContext>();
  /* The context a span started inside pool acquire takes as its parent.
     OpenTelemetry's own context is not reachable from here, since its
     AsyncLocalStorage belongs to the context manager the application
     registered, so the acquire span is carried in a store of our own.
     Without it a connection opened for a waiting caller would be a sibling
     of the acquire span instead of its child. */
  protected _parentStore = new AsyncLocalStorage<Context>();
  /* Whether the global-provider check below is still to be made: it is
     made once, at the first span, since the application may register its
     provider after constructing the instrumentation. */
  protected _checkGlobalProvider = true;
  protected _handlers: {
    channel: string;
    handlers: TracingChannelSubscribers<any>;
  }[];
  readonly instrumentationName = 'postgrejs-otel';
  readonly instrumentationVersion = VERSION;

  constructor(config: PostgrejsInstrumentationConfig = {}) {
    this._config = { enabled: true, ...config };
    this._tracer = trace.getTracer(
      this.instrumentationName,
      this.instrumentationVersion,
    );
    this._handlers = [
      {
        channel: 'postgrejs:query',
        handlers: this._statementHandlers('query'),
      },
      {
        channel: 'postgrejs:execute',
        handlers: this._statementHandlers('execute'),
      },
      {
        channel: 'postgrejs:copy',
        handlers: this._statementHandlers('copy'),
      },
      {
        channel: 'postgrejs:prepare',
        handlers: this._statementHandlers('prepare'),
      },
      {
        channel: 'postgrejs:statement:execute',
        handlers: this._statementHandlers('executePrepared'),
      },
      {
        channel: 'postgrejs:pipeline',
        handlers: this._statementHandlers('pipeline'),
      },
      {
        channel: 'postgrejs:cursor:fetch',
        handlers: this._statementHandlers('fetch'),
      },
      {
        channel: 'postgrejs:pool:acquire',
        handlers: this._spanHandlers(ctx => this._startAcquire(ctx)),
      },
      {
        channel: 'postgrejs:connect',
        handlers: this._spanHandlers(
          ctx => this._startConnect(ctx),
          (ctx: ConnectContext) => this._endConnect(ctx),
        ),
      },
    ];
    if (this._config.enabled) this.enable();
  }

  /** Subscribes to postgrejs's channels. Calling it twice does nothing. */
  enable(): void {
    if (this._enabled) return;
    this._enabled = true;
    this._config.enabled = true;
    for (const { channel, handlers } of this._handlers) {
      diagnosticsChannel.tracingChannel(channel).subscribe(handlers);
    }
    diagnosticsChannel
      .tracingChannel('postgrejs:pool:acquire')
      .start.bindStore(
        this._parentStore,
        ctx => this._contextFor(ctx as PoolAcquireContext) as Context,
      );
  }

  /**
   * Unsubscribes. A span already started is still ended when its
   * operation finishes.
   */
  disable(): void {
    if (!this._enabled) return;
    this._enabled = false;
    this._config.enabled = false;
    for (const { channel, handlers } of this._handlers) {
      diagnosticsChannel.tracingChannel(channel).unsubscribe(handlers);
    }
    diagnosticsChannel
      .tracingChannel('postgrejs:pool:acquire')
      .start.unbindStore(this._parentStore);
  }

  /** Uses this provider instead of the global one for spans started from now on. */
  setTracerProvider(tracerProvider: TracerProvider): void {
    this._checkGlobalProvider = false;
    this._tracer = tracerProvider.getTracer(
      this.instrumentationName,
      this.instrumentationVersion,
    );
  }

  /** Accepted for the `Instrumentation` interface; no metrics are recorded yet. */
  setMeterProvider(): void {
    // No metrics yet.
  }

  /** Replaces the configuration. `enabled` is not acted on; use enable() and disable(). */
  setConfig(config: PostgrejsInstrumentationConfig): void {
    this._config = { ...config, enabled: this._enabled };
  }

  /** The current configuration. */
  getConfig(): PostgrejsInstrumentationConfig {
    return this._config;
  }

  protected _statementHandlers(
    operation: StatementInfo['operation'],
  ): TracingChannelSubscribers<any> {
    return {
      start: (ctx: StatementInfo['context']) =>
        this._startStatement(operation, ctx),
      end: (ctx: any) => {
        // A synchronous throw: no asyncEnd will follow.
        if (ctx.error !== undefined) this._finish(ctx);
      },
      asyncStart: () => undefined,
      asyncEnd: (ctx: StatementInfo['context']) => {
        const span = this._spans.get(ctx);
        // Recorded on failure too: how far a failed COPY got is the point.
        if (span && operation === 'copy') endCopy(span, ctx as CopyContext);
        if (span && ctx.error === undefined) {
          const result = (ctx as QueryContext).result;
          const rows = result?.rows;
          if (rows) span.setAttribute('db.response.returned_rows', rows.length);
          if (result?.cursor)
            this._cursorOrigins.set(result.cursor, span.spanContext());
          if (operation === 'fetch') endFetch(span, ctx as CursorFetchContext);
          const hook = this._config.responseHook;
          if (hook) {
            safely('responseHook', () =>
              hook(span, { operation, context: ctx } as StatementInfo),
            );
          }
        }
        this._finish(ctx);
      },
      error: (ctx: any) => {
        this._recordError(ctx);
        const index = ctx.error?.failedIndex;
        const span = this._spans.get(ctx);
        if (span && operation === 'pipeline' && typeof index === 'number')
          span.setAttribute('postgrejs.pipeline.failed_index', index);
      },
    };
  }

  protected _spanHandlers(
    start: (ctx: any) => void,
    beforeEnd?: (ctx: any) => void,
  ): TracingChannelSubscribers<any> {
    return {
      start,
      end: (ctx: any) => {
        if (ctx.error !== undefined) this._finish(ctx);
      },
      asyncStart: () => undefined,
      asyncEnd: (ctx: any) => {
        beforeEnd?.(ctx);
        this._finish(ctx);
      },
      error: (ctx: any) => this._recordError(ctx),
    };
  }

  protected _startStatement(
    operation: StatementInfo['operation'],
    ctx: StatementInfo['context'],
  ): void {
    const config = ctx.connection.config;
    const attributes: Attributes = {
      ...this._connectionAttributes(config),
      ...serverAttributes(ctx.connection.host, ctx.connection.port),
    };
    if (this._config.captureQueryText !== false) {
      /* A pipeline's statements are joined the way the conventions ask
         for a batch whose statements differ. */
      attributes['db.query.text'] =
        operation === 'pipeline'
          ? (ctx as PipelineContext).statements.map(s => s.sql).join('; ')
          : (ctx as { sql: string }).sql;
    }
    const pid = ctx.connection.processID;
    if (pid != null) attributes['postgrejs.backend_pid'] = pid;
    /* A COPY is known to be one without reading the SQL, so it can be
       named the way the semantic conventions prefer, operation and table;
       the table only when copyFromRows() was given it by name. Any other
       statement is named after the database, as the conventions ask when
       neither is known without parsing. */
    let name = config.database || 'postgresql';
    if (operation === 'prepare') {
      // The protocol's Parse and Describe, which is what SQL PREPARE does.
      attributes['db.operation.name'] = 'PREPARE';
      name = 'PREPARE';
      // copyFromRows() looking up the columns of its table.
      const table = (ctx as PrepareContext).table;
      if (table) {
        attributes['db.collection.name'] = table;
        name += ' ' + table;
      }
    } else if (operation === 'executePrepared') {
      // The conventions count only two or more as a batch.
      const size = (ctx as StatementExecuteContext).batchSize;
      if (size != null && size > 1)
        attributes['db.operation.batch.size'] = size;
    } else if (operation === 'execute' && (ctx as ExecuteContext).command) {
      // A transaction method says which command it sends.
      const command = (ctx as ExecuteContext).command!;
      attributes['db.operation.name'] = command;
      name = command;
    } else if (operation === 'pipeline') {
      const size = (ctx as PipelineContext).statements.length;
      if (size > 1) attributes['db.operation.batch.size'] = size;
    } else if (operation === 'fetch') {
      // The protocol's Execute of a portal, which is what SQL FETCH does.
      attributes['db.operation.name'] = 'FETCH';
      attributes['postgrejs.cursor.fetch_count'] = (
        ctx as CursorFetchContext
      ).fetchCount;
      name = 'FETCH';
    } else if (operation === 'copy') {
      const copy = ctx as CopyContext;
      attributes['db.operation.name'] = 'COPY';
      attributes['postgrejs.copy.direction'] = copy.direction;
      name = 'COPY';
      if (copy.table) {
        attributes['db.collection.name'] = copy.table;
        name += ' ' + copy.table;
      }
    }
    const origin =
      operation === 'fetch'
        ? this._cursorOrigins.get((ctx as CursorFetchContext).cursor)
        : undefined;
    const span = this._startSpan(
      name,
      SpanKind.CLIENT,
      attributes,
      origin && [{ context: origin }],
    );
    if (span) {
      this._spans.set(ctx, span);
      const hook = this._config.requestHook;
      if (hook) {
        safely('requestHook', () =>
          hook(span, { operation, context: ctx } as StatementInfo),
        );
      }
    }
    /* An execution of a prepared statement sends no text, only the name it
       was prepared under, so there is nothing to put a comment in front
       of; the comment went in at prepare(), without the traceparent,
       which would otherwise tie every later execution to the span of the
       prepare. */
    const comment =
      operation === 'executePrepared' || operation === 'fetch'
        ? undefined
        : this._config.sqlComment;
    if (comment) {
      const tags =
        typeof comment.tags === 'function'
          ? safely('sqlComment.tags', () =>
              (comment.tags as (c: ConnectionLike) => Record<string, any>)(
                ctx.connection,
              ),
            )
          : comment.tags;
      const text = buildSqlComment(
        tags,
        comment.traceparent && span && operation !== 'prepare'
          ? span.spanContext()
          : undefined,
      );
      if (text) {
        if (operation === 'pipeline') {
          for (const st of (ctx as PipelineContext).statements)
            st.sql = text + st.sql;
        } else
          (ctx as { sql: string }).sql = text + (ctx as { sql: string }).sql;
      }
    }
  }

  protected _startAcquire(ctx: PoolAcquireContext): void {
    this._contextFor(ctx);
  }

  /* Called from the store binding and from the start subscriber, in
     whichever order the runtime runs them, so the span is created by
     whichever comes first. */
  protected _contextFor(ctx: PoolAcquireContext): Context | undefined {
    let span = this._spans.get(ctx);
    if (!span) {
      const config = ctx.pool.config;
      span = this._startSpan(
        'postgrejs.pool.acquire',
        SpanKind.INTERNAL,
        this._connectionAttributes(config),
      );
      if (!span) return undefined;
      this._spans.set(ctx, span);
    }
    return trace.setSpan(this._parentContext(), span);
  }

  protected _startConnect(ctx: ConnectContext): void {
    const span = this._startSpan(
      'postgrejs.connect',
      SpanKind.CLIENT,
      this._connectionAttributes(ctx.config),
    );
    if (span) this._spans.set(ctx, span);
  }

  /* The host is known only once the attempt is over: with several hosts
     configured, the start knows the list, not which one will answer. */
  protected _endConnect(ctx: ConnectContext): void {
    const span = this._spans.get(ctx);
    if (span) span.setAttributes(serverAttributes(ctx.host, ctx.port));
  }

  protected _startSpan(
    name: string,
    kind: SpanKind,
    attributes: Attributes,
    links?: Link[],
  ): Span | undefined {
    if (this._checkGlobalProvider) {
      this._checkGlobalProvider = false;
      warnOnHiddenProvider();
    }
    const parent = this._parentContext();
    if (this._config.requireParentSpan && !trace.getSpan(parent)) return;
    return this._tracer.startSpan(name, { kind, attributes, links }, parent);
  }

  protected _parentContext(): Context {
    return this._parentStore.getStore() ?? context.active();
  }

  protected _recordError(ctx: { error?: unknown }): void {
    const span = this._spans.get(ctx);
    if (!span) return;
    const err = ctx.error as any;
    const code: unknown = err?.code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
      span.setAttribute('db.response.status_code', code);
      span.setAttribute('error.type', code);
    } else if (typeof code === 'string') {
      // A Node.js system error, e.g. ECONNREFUSED.
      span.setAttribute('error.type', code);
    } else {
      span.setAttribute(
        'error.type',
        err?.constructor?.name || /* c8 ignore next */ '_OTHER',
      );
    }
    if (err instanceof Error) span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  protected _finish(ctx: object): void {
    const span = this._spans.get(ctx);
    if (!span) return;
    this._spans.delete(ctx);
    if ((ctx as ConnectContext).processID != null) {
      span.setAttribute(
        'postgrejs.backend_pid',
        (ctx as ConnectContext).processID!,
      );
    }
    span.end();
  }

  protected _connectionAttributes(config: ConnectionInfo): Attributes {
    let attributes = this._connAttributes.get(config);
    if (!attributes) {
      attributes = {
        'db.system.name': 'postgresql',
        ...serverAttributes(config.host, config.port || 5432),
      };
      if (config.database) attributes['db.namespace'] = config.database;
      this._connAttributes.set(config, attributes);
    }
    return attributes;
  }
}

/**
 * `server.address` and `server.port` for a host, or nothing when there is
 * no host to name.
 */
function serverAttributes(host?: string, port?: number): Attributes {
  if (!host) return {};
  // A host starting with a slash is a unix socket directory.
  return host.startsWith('/')
    ? { 'server.address': host }
    : { 'server.address': host, 'server.port': port };
}

/* COPY TO returns rows, so it gets the convention's returned_rows; the
   conventions have no attribute for rows written, so COPY FROM's count
   goes under the package's own name. */
function endCopy(span: Span, ctx: CopyContext): void {
  if (ctx.rowCount != null) {
    span.setAttribute(
      ctx.direction === 'to'
        ? 'db.response.returned_rows'
        : 'postgrejs.copy.rows',
      ctx.rowCount,
    );
  }
  if (ctx.bytes != null) span.setAttribute('postgrejs.copy.bytes', ctx.bytes);
  if (ctx.aborted) span.setAttribute('postgrejs.copy.aborted', true);
}

/** Records what a cursor fetch read. */
function endFetch(span: Span, ctx: CursorFetchContext): void {
  // Always set once a fetch succeeds.
  span.setAttribute('db.response.returned_rows', ctx.rowCount as number);
  if (ctx.done) span.setAttribute('postgrejs.cursor.done', true);
}

function safely<T>(what: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    diag.error(`postgrejs-otel: ${what} threw`, e);
    return undefined;
  }
}

/* Read at runtime so a lockstep version bump needs no code change. The
   build puts package.json next to index.js; from the sources it is one
   level up. */
function readVersion(): string {
  const require = createRequire(import.meta.url);
  for (const p of ['./package.json', '../package.json']) {
    try {
      const pkg = require(p);
      if (pkg.name === 'postgrejs-otel') return pkg.version;
    } catch {
      // Not there; try the next one.
    }
  }
  // Only when package.json was left out of the bundle; not reached in tests.
  return '0.0.0';
}

const VERSION = readVersion();
