import {toIntDef} from 'putil-varhelpers';
import {DatabaseConnectionParams} from '../definitions.js';

export function configFromEnv(): DatabaseConnectionParams {
  const env = process.env;
  const result: DatabaseConnectionParams = {};

  result.host = env.PGHOST || env.PGHOSTADDR;
  if (env.PGPORT)
    result.port = toIntDef(env.PGPORT, 5432);
  if (env.PGDATABASE)
    result.database = env.PGDATABASE;
  if (env.PGUSER)
    result.user = env.PGUSER;
  if (env.PGPASSWORD)
    result.password = env.PGPASSWORD;
  if (env.PGAPPNAME)
    result.applicationName = env.PGAPPNAME;
  if (env.PGTZ)
    result.timezone = env.PGTZ;
  if (env.PGSCHEMA)
    result.schema = env.PGSCHEMA;
  if (env.PGCONNECT_TIMEOUT)
    result.connectTimeoutMs = toIntDef(env.PGCONNECT_TIMEOUT, 30000);

  return result;
}
