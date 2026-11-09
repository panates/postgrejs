/* The shapes postgrejs publishes on its tracing channels, written out here
   rather than imported from postgrejs: importing them pulls the driver's
   sources into this package's program (or needs the driver built first),
   and the channels are looked up by name anyway, so only the shape is
   shared. Only the fields read here are listed. */

/** The parts of a connection's configuration recorded on spans. */
export interface ConnectionInfo {
  host?: string;
  port?: number;
  database?: string;
}

/** The parts of a postgrejs `Connection` read here. */
export interface ConnectionLike {
  readonly config: ConnectionInfo;
  readonly processID?: number;
}

/** What `postgrejs:query` publishes. See postgrejs's `QueryTraceContext`. */
export interface QueryContext {
  sql: string;
  paramCount: number;
  connection: ConnectionLike;
  result?: { rows?: unknown[] };
  error?: unknown;
}

/** What `postgrejs:execute` publishes. See postgrejs's `ExecuteTraceContext`. */
export interface ExecuteContext {
  sql: string;
  connection: ConnectionLike;
  /** Set for a transaction command, e.g. `BEGIN` or `ROLLBACK TO SAVEPOINT`. */
  command?: string;
  result?: unknown;
  error?: unknown;
}

/** What `postgrejs:copy` publishes. See postgrejs's `CopyTraceContext`. */
export interface CopyContext {
  sql: string;
  direction: 'to' | 'from';
  connection: ConnectionLike;
  table?: string;
  rowCount?: number;
  bytes?: number;
  aborted?: boolean;
  error?: unknown;
}

/** What `postgrejs:prepare` publishes. See postgrejs's `PrepareTraceContext`. */
export interface PrepareContext {
  sql: string;
  paramTypeCount: number;
  connection: ConnectionLike;
  result?: unknown;
  error?: unknown;
}

/**
 * What `postgrejs:statement:execute` publishes for a prepared statement's
 * `execute()` or `executeBatch()`. See postgrejs's
 * `StatementExecuteTraceContext`.
 */
export interface StatementExecuteContext {
  readonly sql: string;
  connection: ConnectionLike;
  paramCount: number;
  /** Set for `executeBatch()` only. */
  batchSize?: number;
  result?: { rows?: unknown[] };
  error?: unknown;
}

/** What `postgrejs:pipeline` publishes. See postgrejs's `PipelineTraceContext`. */
export interface PipelineContext {
  statements: { sql: string; paramCount: number }[];
  connection: ConnectionLike;
  result?: unknown[];
  error?: unknown;
}

/** What `postgrejs:pool:acquire` publishes. */
export interface PoolAcquireContext {
  pool: { readonly config: ConnectionInfo };
  result?: ConnectionLike;
  error?: unknown;
}

/** What `postgrejs:connect` publishes. */
export interface ConnectContext {
  config: ConnectionInfo;
  processID?: number;
  error?: unknown;
}
