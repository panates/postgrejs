import { toInt, toIntDef } from 'putil-varhelpers';
import { ConnectionConfiguration } from '../interfaces/database-connection-params.js';

export function configFromEnv(): ConnectionConfiguration {
  const env = process.env;
  const result: ConnectionConfiguration = {};

  result.host = env.PGHOST || env.PGHOSTADDR;
  if (env.PGPORT) result.port = toIntDef(env.PGPORT, 5432);
  if (env.PGDATABASE) result.database = env.PGDATABASE;
  if (env.PGUSER) result.user = env.PGUSER;
  if (env.PGPASSWORD) result.password = env.PGPASSWORD;
  if (env.PGAPPNAME) result.applicationName = env.PGAPPNAME;
  if (env.PGTZ) result.timezone = env.PGTZ;
  if (env.PGSCHEMA) result.schema = env.PGSCHEMA;
  if (env.PGCONNECT_TIMEOUT) result.connectTimeoutMs = toIntDef(env.PGCONNECT_TIMEOUT, 30000);
  if (env.PGMAX_BUFFER_SIZE) {
    result.buffer = { maxLength: toInt(env.PGMAX_BUFFER_SIZE) };
  }
  return result;
}
