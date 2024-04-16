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

export interface ConnectionConfiguration extends DatabaseConnectionParams, SocketOptions {
  buffer?: SmartBufferConfig;
}

export interface PoolConfiguration extends ConnectionConfiguration, LPoolConfiguration {}
