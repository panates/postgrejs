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
  /**
   * Opens the connection in replication mode, which is what lets it run
   * START_REPLICATION. Set by LogicalReplication; a connection in this mode
   * cannot serve ordinary queries once streaming has begun.
   */
  replication?: 'database' | 'true';
  /**
   * Additional servers to try, in order, when the first one cannot be used.
   *
   * Also accepted as a comma-separated `host`, or in a connection string:
   * `postgres://a:5432,b:5433/db`. Each entry falls back to the top-level
   * `port` when it does not carry one of its own.
   *
   * Selection happens when a connection is opened, so a cluster that has
   * failed over to another node is found on the next connect - a query
   * already in flight when a server goes down still fails.
   */
  hosts?: { host: string; port?: number }[];
  /**
   * Which server in `hosts` is acceptable, mirroring libpq's option of the
   * same name: `read-write`, `read-only`, `primary`, `standby` or
   * `prefer-standby`. A server that does not match is dropped and the next
   * one tried, which is how `read-write` finds the current primary.
   */
  targetSessionAttrs?: TargetSessionAttrs;
  /**
   * How TLS is started: `postgres` (the default) asks first with an
   * SSLRequest and waits for the server's yes or no; `direct` begins the
   * TLS handshake straight away, announcing the `postgresql` protocol over
   * ALPN so the server can tell what it is talking to.
   *
   * Direct saves a round trip and leaves no plaintext preamble for a
   * middlebox to read or strip, but it needs PostgreSQL 17 or later and
   * `ssl` set - an older server just closes the connection.
   */
  sslNegotiation?: 'postgres' | 'direct';
  /**
   * Whether SCRAM authentication binds itself to the TLS channel, mirroring
   * libpq's option of the same name: `prefer` (the default there and here)
   * uses it when the server offers it, `require` refuses to connect
   * otherwise, `disable` never asks for it.
   *
   * Binding mixes a hash of the server's certificate into the SCRAM proof,
   * so an attacker who terminates TLS in the middle - necessarily with a
   * different certificate - cannot relay the exchange. It is what protects
   * the login when the certificate itself is not verified, which is the
   * usual case with `sslmode=require` or a self-signed certificate.
   */
  channelBinding?: 'prefer' | 'require' | 'disable';
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
  /**
   * Whether a thrown error's stack trace points at the application code
   * that called query()/execute() (etc.) across the `await`, instead of an
   * internal async frame inside this library.
   *
   * Getting this right costs a real, measurable amount of CPU when many
   * calls are in flight at once (e.g. a burst of pipelined queries on one
   * connection) - set to `false` to skip it, which is also what makes an
   * apples-to-apples benchmark against a client that does not offer this
   * fair.
   * @default true
   */
  asyncErrorHandling?: boolean;
  /**
   * Whether `query()`/`execute()` (etc.) measure how long the call took -
   * `CommandResult.executeTime` and `ScriptResult.totalTime`.
   *
   * Off by default: each measurement is a `performance.now()` call, and
   * unlike `asyncErrorHandling` there is no way to compute it lazily only
   * once something actually reads it - a real, if small, cost paid on
   * every call whether or not the result is ever inspected, and one a
   * client that does not offer this at all does not pay. Set to `true` to
   * turn it on, connection-wide or for one call.
   * @default false
   */
  timing?: boolean;
  debugLogger?: DebugLogger;
}

export type TargetSessionAttrs =
  'read-write' | 'read-only' | 'primary' | 'standby' | 'prefer-standby';

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
