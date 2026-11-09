import diagnosticsChannel, {
  type TracingChannel,
} from 'node:diagnostics_channel';
import type { Connection } from './connection/connection.js';
import type { Pool } from './connection/pool.js';
import type { ConnectionConfiguration } from './interfaces/database-connection-params.js';
import type { QueryResult } from './interfaces/query-result.js';
import type { ScriptResult } from './interfaces/script-result.js';

/**
 * What `postgrejs:query` publishes for one `Connection.query()` call, and
 * `pool.query()` through the connection it lands on.
 *
 * A subscriber may replace `sql` in its `start` handler, and the driver
 * then sends the replaced text: this is how a trace comment is put in
 * front of the statement for database monitoring. Error positions the
 * server reports refer to the replaced text. A statement whose text
 * changes on every call is never prepared and reused, so a comment that
 * carries a per-call trace id costs a parse on every query.
 *
 * `result` is set once the query resolves, `error` once it rejects.
 */
export interface QueryTraceContext {
  /** The statement as it will be sent. */
  sql: string;
  /** How many bind parameters the statement carries. Their values are not published. */
  paramCount: number;
  /** The connection that runs the statement. */
  connection: Connection;
  result?: QueryResult;
  error?: unknown;
}

/**
 * What `postgrejs:execute` publishes for one `Connection.execute()` call
 * (the Simple Query protocol, one or more statements in a script). `sql`
 * can be replaced in `start` as described for {@link QueryTraceContext}.
 */
export interface ExecuteTraceContext {
  /** The script as it will be sent. */
  sql: string;
  /** The connection that runs the script. */
  connection: Connection;
  result?: ScriptResult;
  error?: unknown;
}

/**
 * What `postgrejs:pool:acquire` publishes while a caller waits for a
 * connection from a pool, including the time it takes to open a new one.
 * This is the wait that a query span alone would hide.
 */
export interface PoolAcquireTraceContext {
  pool: Pool;
  /** The connection handed out. */
  result?: Connection;
  error?: unknown;
}

/**
 * What `postgrejs:connect` publishes while a new connection is opened:
 * the socket, TLS, authentication and the startup commands.
 */
export interface ConnectTraceContext {
  /** The configuration being connected with. It includes the password. */
  config: ConnectionConfiguration;
  /** The server's backend process id, set once the connection is ready. */
  processID?: number;
  error?: unknown;
}

/**
 * What `postgrejs:copy` publishes for one COPY, from `copyTo()`,
 * `copyFrom()` or `copyFromRows()`.
 *
 * The operation lasts from the moment the statement is sent until the
 * server reports it finished (ReadyForQuery), not until `copyTo()` or
 * `copyFrom()` resolves: those resolve as soon as the server accepts the
 * copy. A small export can be over by then, sent whole in one packet; a
 * larger one is held by backpressure, and a consumer that reads slowly
 * keeps the copy, and the operation, open for as long as it holds the
 * server.
 *
 * `sql` can be replaced in `start` as described for
 * {@link QueryTraceContext}. `rowCount` and `bytes` are set by the time
 * the operation ends, whether it succeeded or not.
 */
export interface CopyTraceContext {
  /** The COPY statement as it will be sent. */
  sql: string;
  /** `to` for COPY ... TO STDOUT, `from` for COPY ... FROM STDIN. */
  direction: 'to' | 'from';
  /** The connection that runs the copy. */
  connection: Connection;
  /** The destination table, when `copyFromRows()` was given one by name. */
  table?: string;
  /** Rows the server reported for the copy. */
  rowCount?: number;
  /** Bytes of CopyData sent or received. */
  bytes?: number;
  /**
   * True when a `copyTo()` stream was destroyed by its consumer before the
   * end. The server still finishes the copy and its output is discarded,
   * so this is not an error.
   */
  aborted?: boolean;
  error?: unknown;
}

/**
 * The `node:diagnostics_channel` tracing channels postgrejs publishes on.
 *
 * Each one is a `TracingChannel`, so a subscriber gets `start`, `end`,
 * `asyncStart`, `asyncEnd` and `error` events with the same context
 * object, and an `AsyncLocalStorage` bound to `start` is active for the
 * whole operation. Nothing is published, and nothing is allocated for it,
 * while a channel has no subscribers.
 *
 * ```ts
 * import diagnosticsChannel from 'node:diagnostics_channel';
 *
 * diagnosticsChannel.tracingChannel('postgrejs:query').subscribe({
 *   start(ctx) { ... },
 *   asyncEnd(ctx) { ... },
 *   error(ctx) { ... },
 * });
 * ```
 */
export const tracingChannels = {
  query:
    diagnosticsChannel.tracingChannel<QueryTraceContext>('postgrejs:query'),
  execute:
    diagnosticsChannel.tracingChannel<ExecuteTraceContext>('postgrejs:execute'),
  poolAcquire: diagnosticsChannel.tracingChannel<PoolAcquireTraceContext>(
    'postgrejs:pool:acquire',
  ),
  connect:
    diagnosticsChannel.tracingChannel<ConnectTraceContext>('postgrejs:connect'),
  copy: diagnosticsChannel.tracingChannel<CopyTraceContext>('postgrejs:copy'),
};

/**
 * Whether anything listens on any of a tracing channel's five events.
 *
 * @internal
 */
/* Asked of each event channel rather than of the TracingChannel itself:
   Bun 1.4 implements tracePromise() but leaves TracingChannel.hasSubscribers
   undefined, which would read as "nobody listens" there forever. */
export function isTraced(channel: TracingChannel<any, any>): boolean {
  return (
    channel.start.hasSubscribers ||
    channel.end.hasSubscribers ||
    channel.asyncStart.hasSubscribers ||
    channel.asyncEnd.hasSubscribers ||
    channel.error.hasSubscribers
  );
}
