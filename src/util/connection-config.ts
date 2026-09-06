import { merge } from '@jsopen/objects';
import type {
  ConnectionConfiguration,
  TargetSessionAttrs,
} from '../interfaces/database-connection-params.js';
import { configFromEnv } from './config-from-env.js';

export function getConnectionConfig(
  config?: ConnectionConfiguration | string,
): ConnectionConfiguration {
  const cfg = configFromEnv();
  if (typeof config === 'string') {
    merge(cfg, parseConnectionString(config));
  } else if (typeof config === 'object') {
    merge(cfg, config);
  }
  if (cfg.host) {
    const explicitRequireSSL = cfg.requireSSL;
    const x = parseConnectionString('' + cfg.host);
    merge(cfg, x);
    if (explicitRequireSSL !== undefined) cfg.requireSSL = explicitRequireSSL;
  }
  // A comma-separated host is the same thing as a `hosts` list; normalise
  // to one shape so nothing downstream has to know both.
  if (!cfg.hosts?.length && cfg.host?.includes(','))
    cfg.hosts = splitHosts(cfg.host, cfg.port);
  if (cfg.hosts?.length) {
    // Resolve each candidate's port now, from the shared `port` where it
    // has none of its own. Doing it later would mean reading `cfg.port`
    // after the line below has overwritten it with the first host's, so a
    // second candidate without a port would inherit the first one's.
    const sharedPort = cfg.port;
    cfg.hosts = cfg.hosts.map(x => ({
      host: x.host,
      port: x.port ?? sharedPort,
    }));
    cfg.host = cfg.hosts[0].host;
    cfg.port = cfg.hosts[0].port;
  }
  /*c8 ignore else */
  cfg.user = cfg.user || 'postgres';
  /*c8 ignore else */
  cfg.database = cfg.database || 'postgres';
  cfg.host = cfg.host || '127.0.0.1';
  return cfg;
}

const TARGET_SESSION_ATTRS: TargetSessionAttrs[] = [
  'read-write',
  'read-only',
  'primary',
  'standby',
  'prefer-standby',
];

/** `a:5432,b` -> [{host:'a',port:5432},{host:'b',port:fallback}] */
function splitHosts(
  value: string,
  fallbackPort?: number,
): { host: string; port?: number }[] {
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const i = entry.lastIndexOf(':');
      // A bare IPv6 address has colons of its own; only treat the last one
      // as a port when what follows it is a number.
      if (i > 0 && /^\d+$/.test(entry.substring(i + 1)))
        return { host: entry.substring(0, i), port: +entry.substring(i + 1) };
      return { host: entry, port: fallbackPort };
    });
}

export function parseConnectionString(str: string): ConnectionConfiguration {
  if (str.startsWith('/')) str = 'socket:/' + str;

  if (!str.includes('://')) str = 'postgres://' + str;

  // URL() cannot parse a multi-host authority, so it is parsed with the
  // first host in place and the full list kept separately.
  const authority = str.slice(str.indexOf('://') + 3).split(/[?/]/)[0];
  const hostPart = authority.slice(authority.indexOf('@') + 1);
  const multiHost = hostPart.includes(',') ? hostPart : undefined;
  if (multiHost) str = str.replace(hostPart, hostPart.split(',')[0]);

  const parsed = new URL(str);
  // URLSearchParams.get() only ever returns string | null, never an array,
  // so the array branch below is unreachable in practice; kept defensively
  // since the parameter type is technically wider.
  const getFirst = (v: string | string[] | null) =>
    typeof v === 'string' ? v : Array.isArray(v) ? v[0] : '';

  const cfg: ConnectionConfiguration = {};
  cfg.host = decodeURI(parsed.hostname || '');
  if (parsed.port) cfg.port = parseInt(parsed.port, 10);

  if (parsed.protocol === 'socket:' || parsed.protocol === 'unix:') {
    if (!cfg.host.startsWith('/')) cfg.host = '/' + cfg.host;
    cfg.host += decodeURI(parsed.pathname || '');
    if (parsed.searchParams.get('db'))
      cfg.database = decodeURI(getFirst(parsed.searchParams.get('db')));
  } else if (parsed.protocol === 'pg:' || parsed.protocol === 'postgres:') {
    if (parsed.pathname) cfg.database = decodeURI(parsed.pathname.substring(1));
  }

  if (parsed.searchParams.get('host'))
    cfg.host = decodeURI(getFirst(parsed.searchParams.get('host')));

  if (parsed.searchParams.get('db'))
    cfg.database = decodeURI(getFirst(parsed.searchParams.get('db')));

  if (parsed.searchParams.get('schema'))
    cfg.schema = decodeURI(getFirst(parsed.searchParams.get('schema')));

  if (parsed.searchParams.get('application_name')) {
    cfg.applicationName = decodeURI(
      getFirst(parsed.searchParams.get('application_name')),
    );
  }
  if (parsed.username) cfg.user = decodeURIComponent(parsed.username);
  if (parsed.password) cfg.password = decodeURIComponent(parsed.password);

  cfg.requireSSL = ['require', 'verify-ca', 'verify-full'].includes(
    parsed.searchParams.get('sslmode') || '',
  );

  const cb = parsed.searchParams.get('channel_binding');
  if (cb) {
    if (cb !== 'prefer' && cb !== 'require' && cb !== 'disable')
      throw new Error(
        `channel_binding "${cb}" is not supported; use "prefer", "require" or "disable"`,
      );
    cfg.channelBinding = cb;
  }

  const sslneg = parsed.searchParams.get('sslnegotiation');
  if (sslneg) {
    if (sslneg !== 'postgres' && sslneg !== 'direct')
      throw new Error(
        `sslnegotiation "${sslneg}" is not supported; use "postgres" or "direct"`,
      );
    cfg.sslNegotiation = sslneg;
  }

  const tsa = parsed.searchParams.get('target_session_attrs');
  if (tsa) {
    if (!TARGET_SESSION_ATTRS.includes(tsa as TargetSessionAttrs))
      throw new Error(`target_session_attrs "${tsa}" is not supported`);
    cfg.targetSessionAttrs = tsa as TargetSessionAttrs;
  }

  if (multiHost) cfg.hosts = splitHosts(multiHost, cfg.port);

  return cfg;
}
