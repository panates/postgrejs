import type { SQL } from 'bun';
import type { BenchDbConfig } from '../config.js';
import {
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
  unitOfWorkStatements,
} from '../scenarios/index.js';
import type { Adapter } from './adapter.js';

interface BunSqlHandle {
  sql: SQL;
  schema: string;
}

function sqlConfig(config: BenchDbConfig, max: number) {
  return {
    hostname: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    database: config.database,
    max,
  };
}

// Only reachable when this whole process was itself started with the `bun`
// executable (see runner/orchestrator.ts's spawnWorker(), which always
// re-spawns with process.execPath - so `--lib=bun` only works from a
// `bun run benchmark/cli.ts` invocation, never a plain `node` one).
// DEFAULT_LIB_IDS (registry.ts) includes it in `--lib=all`'s expansion
// precisely when the orchestrator is itself running under bun, and
// excludes it otherwise - so a plain `node` run of `--lib=all` never
// tries to `import('bun')` and crash.
export const bunSqlAdapter: Adapter = {
  id: 'bun',
  // Bun's SQL client ships inside the runtime itself, not as an installed
  // npm package - there's no package.json to read a version from, so this
  // reports the Bun runtime version instead (undefined under plain Node,
  // which is caught by loadAdapter()'s own restriction to bun-only use).
  libraryVersion: process.versions.bun ?? 'unknown',

  async setup(config: BenchDbConfig) {
    const { SQL: BunSQL } = await import('bun');
    // max: 1 keeps a single underlying connection, matching the
    // "already-open single connection" semantics used by the other
    // adapters for these scenarios (pool-simple-query-execute measures
    // Bun's own implicit pool separately, see below).
    const sql = new BunSQL(sqlConfig(config, 1));
    await sql`select 1`;
    const handle: BunSqlHandle = { sql, schema: config.schema };
    return handle;
  },

  async teardown(handle: unknown) {
    const { sql } = handle as BunSqlHandle;
    await sql.close();
  },

  scenarios: {
    connect(config, bench) {
      bench.add('connect', async () => {
        const { SQL: BunSQL } = await import('bun');
        const sql = new BunSQL(sqlConfig(config, 1));
        await sql`select 1`;
        await sql.close();
      });
    },

    // .simple() forces a genuine Simple Query message - unsafe() alone
    // doesn't default to it the way postgres.js's does (verified against
    // Bun's own SQL.Query type: simple() is a distinct opt-in method).
    simpleQueryExecute(handle, bench) {
      const { sql } = handle as BunSqlHandle;
      bench.add('simple-query-execute', async () => {
        await sql.unsafe(SIMPLE_QUERY_SQL).simple();
      });
    },

    simpleQueryExecuteConcurrent(handle, bench, concurrency) {
      const { sql } = handle as BunSqlHandle;
      bench.add('simple-query-execute-concurrent', async () => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            sql.unsafe(simpleQueryExecuteConcurrentSql(i)).simple(),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const val = (results[i] as any)[0]?.val;
          if (Number(val) !== i) {
            throw new Error(`call ${i}: expected val=${i}, got ${val}`);
          }
        }
      });
    },

    // unsafe(query, args) with a real params array goes out as a genuine
    // Extended Query (Parse/Bind/Describe/Execute), not simple() - the
    // Extended Query counterpart to simpleQueryExecute.
    extendedQueryExecute(handle, bench) {
      const { sql } = handle as BunSqlHandle;
      bench.add('extended-query-execute', async () => {
        const rows = await sql.unsafe(EXTENDED_QUERY_SQL, [
          EXTENDED_QUERY_PARAM,
        ]);
        const val = (rows as any)[0]?.one;
        if (Number(val) !== EXTENDED_QUERY_PARAM) {
          throw new Error(`expected one=${EXTENDED_QUERY_PARAM}, got ${val}`);
        }
      });
    },

    extendedQueryExecuteConcurrent(handle, bench, concurrency) {
      const { sql } = handle as BunSqlHandle;
      bench.add('extended-query-execute-concurrent', async () => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            sql.unsafe(EXTENDED_QUERY_EXECUTE_CONCURRENT_SQL, [i]),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const val = (results[i] as any)[0]?.val;
          if (Number(val) !== i) {
            throw new Error(`call ${i}: expected val=${i}, got ${val}`);
          }
        }
      });
    },

    unitOfWork(handle, bench, statementCount) {
      const { sql, schema } = handle as BunSqlHandle;
      const statements = unitOfWorkStatements(schema);
      bench.add('unit-of-work', async () => {
        const results = await Promise.all(
          statements.map(s => sql.unsafe(s.sql, s.params)),
        );
        if (results.length !== statementCount) {
          throw new Error(
            `expected ${statementCount} results, got ${results.length}`,
          );
        }
      });
    },

    copyFromText() {
      // Bun.sql exposes no COPY API at all (see copy-from.ts's
      // unsupportedLibs); the orchestrator skips this pair, so nothing
      // should reach here.
      throw new Error('Bun.sql does not support COPY');
    },

    mixedTypesDecode(handle, bench, rowTarget) {
      const { sql, schema } = handle as BunSqlHandle;
      const text = mixedTypesDecodeSql(schema);
      bench.add('mixed-types-decode', async () => {
        const rows = await sql.unsafe(text, [rowTarget]);
        if (rows.length !== rowTarget) {
          throw new Error(`expected ${rowTarget} rows, got ${rows.length}`);
        }
      });
    },

    // Bun's SQL client already requests binary for several column types by
    // default (int4, float4/8, timestamp(tz), bytea - verified by capturing
    // its actual Bind message over a logging TCP proxy) but always text for
    // others (int2, int8, varchar, json, jsonb), with no exposed option to
    // override either way - see mixed-types-decode-binary.ts's
    // unsupportedLibs for why this scenario excludes it rather than
    // reporting a number that's neither a text-protocol nor a binary-
    // protocol result.

    // Bun decodes bytea as a real Buffer, same as the other adapters - it's
    // one of the types Bun already requests binary for by default (see
    // above), not something this call chooses.
    largeBlobFetch(handle, bench, sizeBytes, rowCount) {
      const { sql, schema } = handle as BunSqlHandle;
      const text = largeBlobFetchSql(schema);
      bench.add('large-blob-fetch', async () => {
        const rows = await sql.unsafe(text, [rowCount]);
        if (rows.length !== rowCount) {
          throw new Error(`expected ${rowCount} rows, got ${rows.length}`);
        }
        for (const row of rows as any[]) {
          const data = row.data;
          if (!Buffer.isBuffer(data) || data.length !== sizeBytes) {
            throw new Error(
              `expected a ${sizeBytes}-byte Buffer, got ${data?.length ?? typeof data}`,
            );
          }
        }
      });
    },

    // Bun decodes int4[] as an Int32Array, not a plain JS Array (verified
    // live: Array.isArray() is false, constructor.name is "Int32Array") -
    // a real, distinct design choice from pg/postgres.js/PostgreJS, which
    // all hand back a plain Array here. Indexing/length work identically
    // either way, so the correctness check accepts both rather than
    // assuming Array.isArray().
    largeArrayFetch(handle, bench, elementCount, rowCount) {
      const { sql, schema } = handle as BunSqlHandle;
      const text = largeArrayFetchSql(schema);
      bench.add('large-array-fetch', async () => {
        const rows = await sql.unsafe(text, [rowCount]);
        if (rows.length !== rowCount) {
          throw new Error(`expected ${rowCount} rows, got ${rows.length}`);
        }
        for (const row of rows as any[]) {
          const raw = row.data;
          if (!Array.isArray(raw) && !ArrayBuffer.isView(raw)) {
            throw new Error(
              `expected an array-like value, got ${JSON.stringify(raw)?.slice(0, 100)}`,
            );
          }
          // Normalized to a plain array either way (Int32Array's own
          // .length/indexing would work identically, but TS narrows
          // ArrayBuffer.isView() down to a type with no .length -
          // DataView's - so this sidesteps that rather than fighting it).
          const data: any[] = Array.isArray(raw) ? raw : Array.from(raw as any);
          if (
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
      const { sql, schema } = handle as BunSqlHandle;
      const text = simpleQueryFetchSql(schema, rowTarget);
      bench.add('simple-query-fetch', async () => {
        const rows = await sql.unsafe(text).simple();
        if (rows.length !== rowTarget) {
          throw new Error(`expected ${rowTarget} rows, got ${rows.length}`);
        }
      });
    },

    // Bun's SQL client has no cursor/streaming API at all (no .cursor(),
    // no forEach(), no Symbol.asyncIterator on Query - verified against
    // its own type declarations and empirically at a REPL) - see
    // cursor-stream.ts's unsupportedLibs for why this scenario excludes
    // it rather than reporting a misleading number.

    // Bun's `sql` instance is itself a connection pool (its own `max`
    // option), same model as postgres.js's - measured as a real feature.
    poolSimpleQueryExecute(config, bench, concurrency, poolSize) {
      // tinybench calls beforeAll/afterAll once per hook *mode* (warmup and
      // run separately), not once per bench.run() call - so `sql` must be
      // (re)built in beforeAll rather than once at registration time,
      // otherwise it gets closed by afterAll after warmup and the timed
      // run fails trying to reuse it.
      let sql!: SQL;
      bench.add(
        'pool-simple-query-execute',
        async () => {
          await Promise.all(
            Array.from({ length: concurrency }, () =>
              sql.unsafe(SIMPLE_QUERY_SQL).simple(),
            ),
          );
        },
        {
          beforeAll: async () => {
            const { SQL: BunSQL } = await import('bun');
            sql = new BunSQL(sqlConfig(config, poolSize));
          },
          afterAll: async () => {
            await sql.close();
          },
        },
      );
    },

    poolExtendedQueryExecute(config, bench, concurrency, poolSize) {
      let sql!: SQL;
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
          beforeAll: async () => {
            const { SQL: BunSQL } = await import('bun');
            sql = new BunSQL(sqlConfig(config, poolSize));
          },
          afterAll: async () => {
            await sql.close();
          },
        },
      );
    },

    // Bun auto-prepares/caches by unique SQL text by default (`prepare:
    // true`), same model as postgres.js's - no special option needed.
    preparedStatementReuse(handle, bench, iterations) {
      const { sql, schema } = handle as BunSqlHandle;
      const text = preparedStatementSql(schema);
      bench.add(
        'prepared-statement-reuse',
        async () => {
          for (let i = 0; i < iterations; i++) {
            await sql.unsafe(text, [1]);
          }
        },
        {
          beforeAll: async () => {
            await sql.unsafe(text, [1]);
          },
        },
      );
    },

    preparedStatementReuseConcurrent(handle, bench, concurrency) {
      const { sql, schema } = handle as BunSqlHandle;
      const text = preparedStatementSql(schema);
      bench.add(
        'prepared-statement-reuse-concurrent',
        async () => {
          const results = await Promise.all(
            Array.from({ length: concurrency }, () => sql.unsafe(text, [1])),
          );
          for (let i = 0; i < results.length; i++) {
            const id = (results[i] as any)[0]?.id;
            if (Number(id) !== 1) {
              throw new Error(`call ${i}: expected id=1, got ${id}`);
            }
          }
        },
        {
          beforeAll: async () => {
            await sql.unsafe(text, [1]);
          },
        },
      );
    },
  },
};
