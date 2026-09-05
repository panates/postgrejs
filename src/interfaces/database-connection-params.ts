import type { PoolConfiguration as LPoolConfiguration } from 'lightning-pool';
import type { ConnectionOptions as TlsConnectionOptions } from 'tls';
import type { SmartBufferConfig } from '../protocol/smart-buffer.js';
import type { DebugLogger } from '../types.js';

export interface DatabaseConnectionParams {
  host?: string;
  port?: number;
  user?: string;
  password?: string | (() => string | Promise<string>);
  database?: string;
  applicationName?: string;
  requireSSL?: boolean;
  ssl?: TlsConnectionOptions;
  timezone?: string;
  schema?: string;
  connectTimeoutMs?: number;
  /**
   * Specifies weather execute query in auto-commit mode
   * @default false
   */
  autoCommit?: boolean;
  /**
   * When on, if a statement in a transaction block generates an error,
   * the error is ignored and the transaction continues.
   * When off (the default), a statement in a transaction block that generates an error aborts the entire transaction
   * @default true
   */
  rollbackOnError?: boolean;
  debugLogger?: DebugLogger;
}

export interface SocketOptions {
  keepAlive?: boolean;
}

export interface ConnectionConfiguration
  extends DatabaseConnectionParams, SocketOptions {
  buffer?: SmartBufferConfig;
}

export interface PoolConfiguration
  extends ConnectionConfiguration, LPoolConfiguration {
  /**
   * How many of Pool.query()'s one-shot queries may share a single pooled
   * connection at the same time (default 100).
   *
   * PostgreSQL correlates responses to requests by order, so several
   * queries can be in flight on one connection at once, each with its own
   * Sync and therefore its own error boundary. Dispatching that way means
   * `max` stops being a ceiling on concurrent queries and becomes only a
   * ceiling on connections - with the default pool of 10, a burst of 1000
   * queries no longer has to run as 100 sequential rounds of 10.
   *
   * Set to 1 for the older behaviour, where Pool.query() holds a
   * connection exclusively for the duration of each query. Connections
   * handed out by acquire() are never shared, whatever this is set to, so
   * transactions, cursors and prepared statements are unaffected.
   */
  pipelineMaxQueries?: number;

  /**
   * How many pooled connections the pipelined path may borrow at once
   * (default: the pool's own `max`).
   *
   * The server runs one connection's statements serially, so a burst
   * spread over ten connections finishes in a fraction of the time it
   * takes on one. Borrowed connections are handed straight back the
   * moment they go idle, so this is a ceiling on how wide a single burst
   * may fan out, not a reservation - lower it to keep connections free
   * for acquire() while a burst is running.
   */
  pipelineMaxConnections?: number;
}
