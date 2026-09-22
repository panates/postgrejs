import { merge } from '@jsopen/objects';
import type {
  ConnectionConfiguration,
  TargetSessionAttrs,
} from '../interfaces/database-connection-params.js';
import { configFromEnv } from './config-from-env.js';

/**
 * Spellings from other clients that mean something here under a
 * different name.
 *
 * Nothing checks that a configuration's keys are keys this client knows,
 * and it deliberately stays that way: a `PoolConfiguration` carries
 * `lightning-pool`'s own options, which are not declared here, and
 * callers pass configurations that carry their own fields. An allowlist
 * would reject those, and would have to be kept current forever.
 *
 * What is caught instead is the short list of names that are *wrong* -
 * each is the right idea under another client's spelling, so it can be
 * answered with the name that works rather than merely refused.
 */
const FOREIGN_KEYS: Record<string, string> = {
  connection_string: 'connectionString',
  connectionUri: 'connectionString',
  uri: 'connectionString',
  url: 'connectionString',
  dbname: 'database',
  db: 'database',
  username: 'user',
  pass: 'password',
  passwd: 'password',
  hostname: 'host',
  application_name: 'applicationName',
  connect_timeout: 'connectTimeoutMs',
  connectionTimeoutMillis: 'connectTimeoutMs',
};

function checkForeignKeys(config: object): void {
  let k: string;
  for (k in config) {
    const meant = FOREIGN_KEYS[k];
    if (meant && (config as any)[k] !== undefined)
      throw new TypeError(
        `"${k}" is not a connection option here - did you mean "${meant}"? ` +
          'An option this client does not know is otherwise ignored, so a ' +
          'name that is nearly right does nothing and says nothing.',
      );
  }
}

export function getConnectionConfig(
  config?: ConnectionConfiguration | string,
): ConnectionConfiguration {
  const cfg = configFromEnv();
  if (typeof config === 'string') {
    merge(cfg, parseConnectionString(config));
  } else if (typeof config === 'object') {
    checkForeignKeys(config);
    merge(cfg, config);
    // `pg`'s spelling of the same thing, and what `drizzle-orm`'s first
    // example writes - so it is the single most likely key someone
    // moving from `pg` puts here. Ignored, it did not fail: it connected
    // to whatever the environment defaults to, which in development is
    // usually a database that exists, so the mistake surfaced as missing
    // tables or as writes landing somewhere else. Applied after the
    // merge and not before it, because `pg` lets the string win over the
    // fields beside it.
    const cs = (cfg as any).connectionString;
    if (cs !== undefined) {
      delete (cfg as any).connectionString;
      if (cs) merge(cfg, parseConnectionString('' + cs));
    }
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

/**
 * The schemes whose path is the database name.
 *
 * PostgreSQL gives two URI forms of its own, `postgres://` and
 * `postgresql://`, and the longer one is what Prisma, TypeORM and most
 * tutorials write - it was missing here, so a string naming a database
 * connected to the default one instead, with nothing reported. `pg:`
 * has been accepted for longer than either and stays.
 */
const DATABASE_PATH_SCHEMES = ['pg:', 'postgres:', 'postgresql:'];

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
  } else if (DATABASE_PATH_SCHEMES.includes(parsed.protocol)) {
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
