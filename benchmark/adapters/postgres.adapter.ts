import postgres from 'postgres';
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

interface PostgresHandle {
  sql: postgres.Sql;
  schema: string;
}

function sqlConfig(config: BenchDbConfig, max: number) {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max,
  };
}

export const postgresAdapter: Adapter = {
  id: 'postgres',
  libraryVersion: readInstalledVersion('postgres'),

  async setup(config: BenchDbConfig) {
    // max: 1 keeps a single underlying connection, matching the
    // "already-open single connection" semantics used by the pg and
    // postgrejs adapters for these scenarios (pool-simple-query-execute
    // measures postgres.js's own implicit pool separately, see below).
    const sql = postgres(sqlConfig(config, 1));
    await sql`select 1`;
    const handle: PostgresHandle = { sql, schema: config.schema };
    return handle;
  },

  async teardown(handle: unknown) {
    const { sql } = handle as PostgresHandle;
    await sql.end();
  },

  scenarios: {
    connect(config, bench) {
      bench.add('connect', async () => {
        const sql = postgres(sqlConfig(config, 1));
        await sql`select 1`;
        await sql.end();
      });
    },

    simpleQueryExecute(handle, bench) {
      const { sql } = handle as PostgresHandle;
      bench.add('simple-query-execute', async () => {
        // unsafe() with no args defaults `simple: true` regardless of any
        // `prepare` option (see index.js's unsafe()), so this already goes
        // out as a genuine Simple Query message - no options needed.
        await sql.unsafe(SIMPLE_QUERY_SQL);
      });
    },

    // Same concurrent-without-await pattern as postgrejs's
    // simpleQueryExecuteConcurrent - postgres.js is inherently designed for
    // this (automatic pipelining), so it should serialize/pipeline results
    // correctly without cross-talk between callers. No args, so unsafe()
    // already sends a genuine Simple Query message (see simpleQueryExecute).
    simpleQueryExecuteConcurrent(handle, bench, concurrency) {
      const { sql } = handle as PostgresHandle;
      bench.add('simple-query-execute-concurrent', async () => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            sql.unsafe(simpleQueryExecuteConcurrentSql(i)),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const val = results[i][0]?.val;
          if (Number(val) !== i) {
            throw new Error(`call ${i}: expected val=${i}, got ${val}`);
          }
        }
      });
    },

    extendedQueryExecute(handle, bench) {
      const { sql } = handle as PostgresHandle;
      bench.add('extended-query-execute', async () => {
        // unsafe(query, args) with a non-empty args array defaults
        // `simple: false` (see index.js's unsafe()) - a genuine Extended
        // Query, and `prepare: false` keeps it one-shot rather than a
        // cached/reused prepared statement (see Prepared Statement Reuse).
        const rows = await sql.unsafe(EXTENDED_QUERY_SQL, [
          EXTENDED_QUERY_PARAM,
        ]);
        const val = rows[0]?.one;
        if (Number(val) !== EXTENDED_QUERY_PARAM) {
          throw new Error(`expected one=${EXTENDED_QUERY_PARAM}, got ${val}`);
        }
      });
    },

    extendedQueryExecuteConcurrent(handle, bench, concurrency) {
      const { sql } = handle as PostgresHandle;
      bench.add('extended-query-execute-concurrent', async () => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            sql.unsafe(EXTENDED_QUERY_EXECUTE_CONCURRENT_SQL, [i]),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const val = results[i][0]?.val;
          if (Number(val) !== i) {
            throw new Error(`call ${i}: expected val=${i}, got ${val}`);
          }
        }
      });
    },

    mixedTypesDecode(handle, bench, rowTarget) {
      const { sql, schema } = handle as PostgresHandle;
      const text = mixedTypesDecodeSql(schema);
      bench.add('mixed-types-decode', async () => {
        const rows = await sql.unsafe(text, [rowTarget]);
        if (rows.length !== rowTarget) {
          throw new Error(`expected ${rowTarget} rows, got ${rows.length}`);
        }
      });
    },

    // postgres.js has no binary protocol support at all (verified
    // elsewhere in this benchmark), so this is just its own text default -
    // no special options needed.
    largeBlobFetch(handle, bench, sizeBytes, rowCount) {
      const { sql, schema } = handle as PostgresHandle;
      const text = largeBlobFetchSql(schema);
      bench.add('large-blob-fetch', async () => {
        const rows = await sql.unsafe(text, [rowCount]);
        if (rows.length !== rowCount) {
          throw new Error(`expected ${rowCount} rows, got ${rows.length}`);
        }
        for (const row of rows) {
          const data = row.data;
          if (!Buffer.isBuffer(data) || data.length !== sizeBytes) {
            throw new Error(
              `expected a ${sizeBytes}-byte Buffer, got ${data?.length ?? typeof data}`,
            );
          }
        }
      });
    },

    // postgres.js has no binary protocol support at all (verified
    // elsewhere in this benchmark), so this is just its own text default -
    // no special options needed.
    largeArrayFetch(handle, bench, elementCount, rowCount) {
      const { sql, schema } = handle as PostgresHandle;
      const text = largeArrayFetchSql(schema);
      bench.add('large-array-fetch', async () => {
        const rows = await sql.unsafe(text, [rowCount]);
        if (rows.length !== rowCount) {
          throw new Error(`expected ${rowCount} rows, got ${rows.length}`);
        }
        for (const row of rows) {
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

    // Same genuine Simple Query path as simpleQueryExecute, but fetching
    // many rows in one round trip.
    simpleQueryFetch(handle, bench, rowTarget) {
      const { sql, schema } = handle as PostgresHandle;
      const text = simpleQueryFetchSql(schema, rowTarget);
      bench.add('simple-query-fetch', async () => {
        const rows = await sql.unsafe(text);
        if (rows.length !== rowTarget) {
          throw new Error(`expected ${rowTarget} rows, got ${rows.length}`);
        }
      });
    },

    // postgres.js's own `.cursor(batchSize)` async iterator — its native
    // streaming path, not an emulation.
    cursorStream(handle, bench, rowTarget, batchSize) {
      const { sql, schema } = handle as PostgresHandle;
      const text = cursorStreamSql(schema, rowTarget);
      bench.add('cursor-stream', async () => {
        let rowCount = 0;
        for await (const rows of sql
          .unsafe(text, [], { prepare: true })
          .cursor(batchSize)) {
          rowCount += rows.length;
        }
        if (rowCount === 0) throw new Error('cursor-stream returned no rows');
      });
    },

    // postgres.js's `sql` instance is itself an automatically pipelined
    // pool; measured as a real feature (concurrency: 'bench' is not used
    // here — the fair comparison is each library's own top-level entry
    // point called N times, not tinybench's own concurrency).
    poolSimpleQueryExecute(config, bench, concurrency, poolSize) {
      // tinybench calls beforeAll/afterAll once per hook *mode* (warmup and
      // run separately), not once per bench.run() call — so the `sql`
      // instance must be (re)built in beforeAll rather than once at
      // registration time, otherwise it gets ended by afterAll after
      // warmup and the timed run fails trying to reuse it.
      let sql!: postgres.Sql;
      bench.add(
        'pool-simple-query-execute',
        async () => {
          await Promise.all(
            Array.from({ length: concurrency }, () =>
              sql.unsafe(SIMPLE_QUERY_SQL),
            ),
          );
        },
        {
          beforeAll: () => {
            sql = postgres(sqlConfig(config, poolSize));
          },
          afterAll: async () => {
            await sql.end();
          },
        },
      );
    },

    // The Extended Query counterpart: unsafe(query, args) with a non-empty
    // args array defaults `simple: false`, so this is a genuine Extended
    // Query, still one-shot rather than a cached prepared statement.
    poolExtendedQueryExecute(config, bench, concurrency, poolSize) {
      let sql!: postgres.Sql;
      bench.add(
        'pool-extended-query-execute',
        async () => {
          await Promise.all(
            Array.from({ length: concurrency }, () =>
              sql.unsafe(EXTENDED_QUERY_SQL, [EXTENDED_QUERY_PARAM]),
            ),
          );
        },
        {
          beforeAll: () => {
            sql = postgres(sqlConfig(config, poolSize));
          },
          afterAll: async () => {
            await sql.end();
          },
        },
      );
    },

    // postgres.js auto-prepares/caches transparently per unique SQL text on
    // a connection (its own default for tagged-template queries; `.unsafe`
    // is opted into the same behavior via `{ prepare: true }` since the
    // query text here is trusted, not user input).
    preparedStatementReuse(handle, bench, iterations) {
      const { sql, schema } = handle as PostgresHandle;
      const text = preparedStatementSql(schema);
      bench.add(
        'prepared-statement-reuse',
        async () => {
          for (let i = 0; i < iterations; i++) {
            await sql.unsafe(text, [1], { prepare: true });
          }
        },
        {
          beforeAll: async () => {
            await sql.unsafe(text, [1], { prepare: true });
          },
        },
      );
    },

    // Same auto-prepared/cached statement as preparedStatementReuse, but
    // firing `concurrency` calls without awaiting each individually, then
    // Promise.all()ing them.
    preparedStatementReuseConcurrent(handle, bench, concurrency) {
      const { sql, schema } = handle as PostgresHandle;
      const text = preparedStatementSql(schema);
      bench.add(
        'prepared-statement-reuse-concurrent',
        async () => {
          const results = await Promise.all(
            Array.from({ length: concurrency }, () =>
              sql.unsafe(text, [1], { prepare: true }),
            ),
          );
          for (let i = 0; i < results.length; i++) {
            const id = results[i][0]?.id;
            if (Number(id) !== 1) {
              throw new Error(`call ${i}: expected id=1, got ${id}`);
            }
          }
        },
        {
          beforeAll: async () => {
            await sql.unsafe(text, [1], { prepare: true });
          },
        },
      );
    },
  },
};
