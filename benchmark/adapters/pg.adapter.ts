import { Client, Pool } from 'pg';
import type { BenchDbConfig } from '../config.js';
import {
  cursorStreamSql,
  EXTENDED_QUERY_EXECUTE_CONCURRENT_SQL,
  EXTENDED_QUERY_PARAM,
  EXTENDED_QUERY_SQL,
  LARGE_ARRAY_FIRST_ELEMENT,
  LARGE_ARRAY_LAST_ELEMENT,
  largeArrayFetchSql,
  largeBlobFetchSql,
  mixedTypesDecodeSql,
  preparedStatementSql,
  SIMPLE_QUERY_SQL,
  simpleQueryExecuteConcurrentSql,
  simpleQueryFetchSql,
} from '../scenarios/index.js';
import type { Adapter } from './adapter.js';
import { readInstalledVersion } from './pkg-version.js';

interface PgHandle {
  client: Client;
  schema: string;
}

function clientConfig(config: BenchDbConfig) {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    // pg 8.23+ supports explicit wire pipelining (send multiple queries
    // without waiting for each one's ReadyForQuery before writing the
    // next) via this opt-in flag - off by default. Every *-concurrent
    // scenario here fires N queries via Promise.all without awaiting each
    // individually, which is exactly the pattern this flag is for; leaving
    // it off would benchmark pg's serialized-fallback path instead of its
    // real concurrent capability, understating it the same way testing
    // PostgreJS/postgres.js without their own pipelining would. Safe for
    // every sequential (always-awaited-one-at-a-time) scenario too, since
    // pipelining only changes behavior when more than one query is queued
    // at once - never the case there.
    pipeline: true,
  };
}

export const pgAdapter: Adapter = {
  id: 'pg',
  libraryVersion: readInstalledVersion('pg'),

  async setup(config: BenchDbConfig) {
    const client = new Client(clientConfig(config));
    await client.connect();
    const handle: PgHandle = { client, schema: config.schema };
    return handle;
  },

  async teardown(handle: unknown) {
    const { client } = handle as PgHandle;
    await client.end();
  },

  scenarios: {
    connect(config, bench) {
      bench.add('connect', async () => {
        const client = new Client(clientConfig(config));
        await client.connect();
        await client.end();
      });
    },

    simpleQueryExecute(handle, bench) {
      const { client } = handle as PgHandle;
      bench.add('simple-query-execute', async () => {
        await client.query(SIMPLE_QUERY_SQL);
      });
    },

    // Same concurrent-without-await pattern as PostgreJS's
    // simpleQueryExecuteConcurrent - checks whether pg's Client (which has
    // its own internal query queue) also serializes correctly on one
    // connection instead of cross-talking results between callers.
    simpleQueryExecuteConcurrent(handle, bench, concurrency) {
      const { client } = handle as PgHandle;
      bench.add('simple-query-execute-concurrent', async () => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            client.query(simpleQueryExecuteConcurrentSql(i)),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const val = results[i].rows[0]?.val;
          if (Number(val) !== i) {
            throw new Error(`call ${i}: expected val=${i}, got ${val}`);
          }
        }
      });
    },

    extendedQueryExecute(handle, bench) {
      const { client } = handle as PgHandle;
      bench.add('extended-query-execute', async () => {
        // Passing a values array (rather than a bare SQL string) is what
        // makes pg send Parse/Bind/Describe/Execute/Sync instead of a
        // Simple Query message - no `name`, so it's not a cached/reused
        // prepared statement either (see Prepared Statement Reuse).
        const r = await client.query(EXTENDED_QUERY_SQL, [
          EXTENDED_QUERY_PARAM,
        ]);
        const val = r.rows[0]?.one;
        if (Number(val) !== EXTENDED_QUERY_PARAM) {
          throw new Error(`expected one=${EXTENDED_QUERY_PARAM}, got ${val}`);
        }
      });
    },

    extendedQueryExecuteConcurrent(handle, bench, concurrency) {
      const { client } = handle as PgHandle;
      bench.add('extended-query-execute-concurrent', async () => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            client.query(EXTENDED_QUERY_EXECUTE_CONCURRENT_SQL, [i]),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const val = results[i].rows[0]?.val;
          if (Number(val) !== i) {
            throw new Error(`call ${i}: expected val=${i}, got ${val}`);
          }
        }
      });
    },

    mixedTypesDecode(handle, bench, rowTarget) {
      const { client, schema } = handle as PgHandle;
      const sql = mixedTypesDecodeSql(schema);
      bench.add('mixed-types-decode', async () => {
        const r = await client.query(sql, [rowTarget]);
        if (r.rows.length !== rowTarget) {
          throw new Error(`expected ${rowTarget} rows, got ${r.rows.length}`);
        }
      });
    },

    // pg's binary bytea decode is unsafe (pg-types has no registered binary
    // parser for bytea - verified live to return a corrupted value, not a
    // Buffer, when requested), so this is left on pg's own text default,
    // same as postgres.js - no `binary: true` requested.
    largeBlobFetch(handle, bench, sizeBytes, rowCount) {
      const { client, schema } = handle as PgHandle;
      const sql = largeBlobFetchSql(schema);
      bench.add('large-blob-fetch', async () => {
        const r = await client.query(sql, [rowCount]);
        if (r.rows.length !== rowCount) {
          throw new Error(`expected ${rowCount} rows, got ${r.rows.length}`);
        }
        for (const row of r.rows) {
          const data = row.data;
          if (!Buffer.isBuffer(data) || data.length !== sizeBytes) {
            throw new Error(
              `expected a ${sizeBytes}-byte Buffer, got ${data?.length ?? typeof data}`,
            );
          }
        }
      });
    },

    // pg's binary array decode (pg-types) is buggy for negative int4/int8
    // elements (verified live - see large-array-fetch.ts's ScenarioMeta
    // description), so this is left on pg's own text default, same as
    // postgres.js - no `binary: true` requested.
    largeArrayFetch(handle, bench, elementCount, rowCount) {
      const { client, schema } = handle as PgHandle;
      const sql = largeArrayFetchSql(schema);
      bench.add('large-array-fetch', async () => {
        const r = await client.query(sql, [rowCount]);
        if (r.rows.length !== rowCount) {
          throw new Error(`expected ${rowCount} rows, got ${r.rows.length}`);
        }
        for (const row of r.rows) {
          const data = row.data;
          if (
            !Array.isArray(data) ||
            data.length !== elementCount ||
            data[0] !== LARGE_ARRAY_FIRST_ELEMENT ||
            data[data.length - 1] !== LARGE_ARRAY_LAST_ELEMENT
          ) {
            throw new Error(
              `expected a ${elementCount}-element array, got ${JSON.stringify(data)?.slice(0, 100)}`,
            );
          }
        }
      });
    },

    // Same client.query(text) Simple Query path as simpleQueryExecute, but
    // fetching many rows in one round trip.
    simpleQueryFetch(handle, bench, rowTarget) {
      const { client, schema } = handle as PgHandle;
      const sql = simpleQueryFetchSql(schema, rowTarget);
      bench.add('simple-query-fetch', async () => {
        const r = await client.query(sql);
        if (r.rows.length !== rowTarget) {
          throw new Error(`expected ${rowTarget} rows, got ${r.rows.length}`);
        }
      });
    },

    // pg has no built-in cursor API; emulated here with raw
    // DECLARE CURSOR / FETCH n / CLOSE SQL via client.query() (no
    // `pg-cursor` dependency) — disclosed as an emulation, not pg's native
    // path.
    cursorStream(handle, bench, rowTarget, batchSize) {
      const { client, schema } = handle as PgHandle;
      const sql = cursorStreamSql(schema, rowTarget);
      bench.add('cursor-stream', async () => {
        await client.query('BEGIN');
        try {
          await client.query(
            `DECLARE bench_cursor NO SCROLL CURSOR FOR ${sql}`,
          );
          let rowCount = 0;
          for (;;) {
            const r = await client.query(
              `FETCH ${batchSize} FROM bench_cursor`,
            );
            if (r.rows.length === 0) break;
            rowCount += r.rows.length;
          }
          await client.query('CLOSE bench_cursor');
          await client.query('COMMIT');
          if (rowCount === 0) {
            throw new Error('cursor-stream returned no rows');
          }
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      });
    },

    poolSimpleQueryExecute(config, bench, concurrency, poolSize) {
      // tinybench calls beforeAll/afterAll once per hook *mode* (warmup and
      // run separately), not once per bench.run() call — so the pool must
      // be (re)built in beforeAll rather than once at registration time,
      // otherwise it gets closed by afterAll after warmup and the timed run
      // fails trying to reuse it.
      let pool!: Pool;
      bench.add(
        'pool-simple-query-execute',
        async () => {
          await Promise.all(
            Array.from({ length: concurrency }, () =>
              pool.query(SIMPLE_QUERY_SQL),
            ),
          );
        },
        {
          beforeAll: () => {
            pool = new Pool({ ...clientConfig(config), max: poolSize, min: 0 });
          },
          afterAll: async () => {
            await pool.end();
          },
        },
      );
    },

    // The Extended Query counterpart: passing a values array is what makes
    // pg send Parse/Bind/Describe/Execute/Sync, and with no `name` it stays
    // a one-shot statement rather than a cached prepared one.
    poolExtendedQueryExecute(config, bench, concurrency, poolSize) {
      let pool!: Pool;
      bench.add(
        'pool-extended-query-execute',
        async () => {
          await Promise.all(
            Array.from({ length: concurrency }, () =>
              pool.query(EXTENDED_QUERY_SQL, [EXTENDED_QUERY_PARAM]),
            ),
          );
        },
        {
          beforeAll: () => {
            pool = new Pool({ ...clientConfig(config), max: poolSize, min: 0 });
          },
          afterAll: async () => {
            await pool.end();
          },
        },
      );
    },

    // pg uses named statements: the server parses the statement once for a
    // given name on a given connection; subsequent queries reusing that name
    // skip re-parsing. There is no public API to explicitly close a named
    // statement, unlike PostgreJS's explicit close().
    preparedStatementReuse(handle, bench, iterations) {
      const { client, schema } = handle as PgHandle;
      const sql = preparedStatementSql(schema);
      const name = 'bench_prepared_statement';
      bench.add(
        'prepared-statement-reuse',
        async () => {
          for (let i = 0; i < iterations; i++) {
            await client.query({ name, text: sql, values: [1] });
          }
        },
        {
          beforeAll: async () => {
            await client.query({ name, text: sql, values: [1] });
          },
        },
      );
    },

    // Same reused (named) statement as preparedStatementReuse, but firing
    // `concurrency` query() calls without awaiting each individually, then
    // Promise.all()ing them.
    preparedStatementReuseConcurrent(handle, bench, concurrency) {
      const { client, schema } = handle as PgHandle;
      const sql = preparedStatementSql(schema);
      const name = 'bench_prepared_statement_concurrent';
      bench.add(
        'prepared-statement-reuse-concurrent',
        async () => {
          const results = await Promise.all(
            Array.from({ length: concurrency }, () =>
              client.query({ name, text: sql, values: [1] }),
            ),
          );
          for (let i = 0; i < results.length; i++) {
            const id = results[i].rows[0]?.id;
            if (Number(id) !== 1) {
              throw new Error(`call ${i}: expected id=1, got ${id}`);
            }
          }
        },
        {
          beforeAll: async () => {
            await client.query({ name, text: sql, values: [1] });
          },
        },
      );
    },
  },
};
