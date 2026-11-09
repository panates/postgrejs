import type { ConnectionInfo, ConnectionLike } from './types.js';

/** What {@link datadogDbmTags} needs to know about the application. */
export interface DatadogDbmOptions {
  /** The application's Datadog service name (`DD_SERVICE`). */
  service: string;
  /** The application's environment (`DD_ENV`). */
  env?: string;
  /** The application's version (`DD_VERSION`). */
  version?: string;
  /** The service name the database spans are reported under. Defaults to `service`. */
  dbService?: string;
}

/**
 * Returns a `sqlComment.tags` function that writes the comment Datadog
 * Database Monitoring reads to link query samples to an APM service, the
 * same keys dd-trace's own `pg` integration writes in its `service` mode.
 *
 * Add `traceparent: true` next to it for what dd-trace calls `full` mode,
 * which links each sample to the trace that ran it.
 *
 * @param options The application's service, environment and version.
 * @returns A function giving the tags for a connection.
 *
 * @example
 * ```ts
 * new PostgrejsInstrumentation({
 *   sqlComment: {
 *     tags: datadogDbmTags({ service: 'api', env: 'prod', version: '1.4.0' }),
 *   },
 * });
 * ```
 */
export function datadogDbmTags(
  options: DatadogDbmOptions,
): (connection: ConnectionLike) => Record<string, string | undefined> {
  const cache = new WeakMap<
    ConnectionInfo,
    Record<string, string | undefined>
  >();
  return (connection: ConnectionLike) => {
    const config = connection.config;
    let tags = cache.get(config);
    if (!tags) {
      tags = {
        dddb: config.database,
        dddbs: options.dbService || options.service,
        dde: options.env,
        ddh: config.host,
        ddps: options.service,
        ddpv: options.version,
      };
      cache.set(config, tags);
    }
    return tags;
  };
}
