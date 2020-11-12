import {DatabaseConnectionParams} from '../definitions';

export function configFromEnv(): DatabaseConnectionParams {
    const env = process.env;
    const result: DatabaseConnectionParams = {};

    result.host = env.PGHOST || env.PGHOSTADDR;
    if (env.PGPORT)
        result.port = parseInt(env.PGPORT, 10) || 5432;
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
    if (env.PGSEARCHPATH)
        result.searchPath = env.PGSEARCHPATH;
    if (env.PGCONNECT_TIMEOUT)
        result.connectTimeoutMs = parseInt(env.PGCONNECT_TIMEOUT, 10);

    return result;
}
