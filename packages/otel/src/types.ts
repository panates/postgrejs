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
  /** The host the connection reached, which with several hosts configured is not `config.host`. */
  readonly host?: string;
  readonly port?: number;
}

/** What `postgrejs:query` publishes. See postgrejs's `QueryTraceContext`. */
export interface QueryContext {
  sql: string;
  paramCount: number;
  connection: ConnectionLike;
  result?: { rows?: unknown[]; cursor?: object };
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
  /** Set when `copyFromRows()` looks up the columns of this table. */
  table?: string;
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
  result?: { rows?: unknown[]; cursor?: object };
  error?: unknown;
}

/** What `postgrejs:pipeline` publishes. See postgrejs's `PipelineTraceContext`. */
export interface PipelineContext {
  statements: { sql: string; paramCount: number }[];
  connection: ConnectionLike;
  result?: unknown[];
  error?: unknown;
}

/** What `postgrejs:cursor:fetch` publishes. See postgrejs's `CursorFetchTraceContext`. */
export interface CursorFetchContext {
  readonly sql: string;
  connection: ConnectionLike;
  cursor: object;
  fetchCount: number;
  rowCount?: number;
  done?: boolean;
  error?: unknown;
}

/** The parts of a postgrejs `Pool` read here. */
export interface PoolLike {
  readonly config: ConnectionInfo & {
    name?: string;
    max?: number;
    minIdle?: number;
  };
  readonly idleConnections: number;
  readonly acquiredConnections: number;
  readonly pendingAcquires: number;
}

/** What the `postgrejs:pool:*` channels publish. See postgrejs's `poolChannels`. */
export interface PoolMessage {
  pool: PoolLike;
  /** Set on checkout and checkin. */
  resource?: object;
}

/** What `postgrejs:pool:acquire` publishes. */
export interface PoolAcquireContext {
  pool: PoolLike;
  result?: ConnectionLike;
  error?: unknown;
}

/** What `postgrejs:connect` publishes. */
export interface ConnectContext {
  config: ConnectionInfo;
  /** The pool opening the connection, when a pool is. */
  pool?: PoolLike;
  processID?: number;
  host?: string;
  port?: number;
  error?: unknown;
}
