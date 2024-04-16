import merge from 'putil-merge';
import type { ConnectionConfiguration } from '../interfaces/database-connection-params.js';
import { configFromEnv } from './config-from-env.js';

export function getConnectionConfig(config?: ConnectionConfiguration | string): ConnectionConfiguration {
  const cfg = configFromEnv();
  if (typeof config === 'string') {
    merge(cfg, parseConnectionString(config));
  } else if (typeof config === 'object') {
    merge(cfg, config);
  }
  if (cfg.host) {
    const x = parseConnectionString('' + cfg.host);
    merge(cfg, x);
  }
  cfg.user = cfg.user || 'postgres';
  cfg.database = cfg.database || 'postgres';
  cfg.host = cfg.host || '127.0.0.1';
  return cfg;
}

export function parseConnectionString(str: string): ConnectionConfiguration {
  if (str.startsWith('/')) str = 'socket:/' + str;

  if (!str.includes('://')) str = 'postgres://' + str;

  const parsed = new URL(str);
  const getFirst = (v: string | string[] | null) => {
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : '';
  };

  const cfg: ConnectionConfiguration = {};
  cfg.host = decodeURI(parsed.hostname || '');
  if (parsed.port) cfg.port = parseInt(parsed.port, 10);

  if (parsed.protocol === 'socket:' || parsed.protocol === 'unix:') {
    if (!cfg.host.startsWith('/')) cfg.host = '/' + cfg.host;
    cfg.host += decodeURI(parsed.pathname || '');
    if (parsed.searchParams.get('db')) cfg.database = decodeURI(getFirst(parsed.searchParams.get('db')));
  } else if (parsed.protocol === 'pg:' || parsed.protocol === 'postgres:') {
    if (parsed.pathname) cfg.database = decodeURI(parsed.pathname.substring(1));
  }

  if (parsed.searchParams.get('host')) cfg.host = decodeURI(getFirst(parsed.searchParams.get('host')));

  if (parsed.searchParams.get('db')) cfg.database = decodeURI(getFirst(parsed.searchParams.get('db')));

  if (parsed.searchParams.get('schema')) cfg.schema = decodeURI(getFirst(parsed.searchParams.get('schema')));

  if (parsed.searchParams.get('application_name'))
    cfg.applicationName = decodeURI(getFirst(parsed.searchParams.get('application_name')));

  if (parsed.username) cfg.user = parsed.username;
  if (parsed.password) cfg.password = parsed.password;

  return cfg;
}
