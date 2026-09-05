import type { PreparedStatement } from 'postgrejs';
import { Connection, DataFormat, Pool } from 'postgrejs';
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
import { readOwnPackageVersion } from './pkg-version.js';

interface PostgrejsHandle {
  connection: Connection;
  schema: string;
}

function connectionConfig(config: BenchDbConfig) {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  };
}

export const postgrejsAdapter: Adapter = {
  id: 'postgrejs',
  libraryVersion: readOwnPackageVersion(),

  async setup(config: BenchDbConfig) {
    const connection = new Connection(connectionConfig(config));
    await connection.connect();
    const handle: PostgrejsHandle = { connection, schema: config.schema };
    return handle;
  },

  async teardown(handle: unknown) {
    const { connection } = handle as PostgrejsHandle;
    await connection.close();
  },

  scenarios: {
    connect(config, bench) {
      bench.add('connect', async () => {
        const connection = new Connection(connectionConfig(config));
        await connection.connect();
        await connection.close();
      });
    },

    simpleQueryExecute(handle, bench) {
      const { connection } = handle as PostgrejsHandle;
      bench.add('simple-query-execute', async () => {
        // execute() uses the Simple Query protocol (one round trip), same
        // as pg's query(text) with no params and postgres.js's cached
        // prepared path — matching each library's own fast path for a
        // parameterless query, per disclosed asymmetry #1's principle.
        // objectRows: true so postgrejs's output shape matches pg's and
        // postgres.js's defaults (see disclosed asymmetry #5) — the one
        // deliberate normalization across adapters.
        await connection.execute(SIMPLE_QUERY_SQL, { objectRows: true });
      });
    },

    // Fires `concurrency` execute() calls on the SAME connection without
    // awaiting each individually, then Promise.all()s them. postgrejs
    // serializes these internally via a statement queue so results never
    // cross-talk between callers even though the caller never awaited
    // between calls; each call selects a distinct literal and the result is
    // checked against it.
    simpleQueryExecuteConcurrent(handle, bench, concurrency) {
      const { connection } = handle as PostgrejsHandle;
      bench.add('simple-query-execute-concurrent', async () => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            connection.execute(simpleQueryExecuteConcurrentSql(i), {
              objectRows: true,
            }),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const val = results[i].results[0]?.rows?.[0]?.val;
          if (Number(val) !== i) {
            throw new Error(`call ${i}: expected val=${i}, got ${val}`);
          }
        }
      });
    },

    extendedQueryExecute(handle, bench) {
      const { connection } = handle as PostgrejsHandle;
      bench.add('extended-query-execute', async () => {
        // query() always goes through the Extended Query protocol (Parse/
        // Bind/Describe/Execute/Sync); passing a real parameter here (as
        // opposed to a literal) makes that unambiguous and matches how
        // pg/postgres.js are driven for this scenario too.
        // columnFormat: text - postgrejs defaults to requesting binary
        // result columns (DEFAULT_COLUMN_FORMAT), but neither pg (unless
        // binary:true, which we never set) nor postgres.js (no binary
        // protocol support at all - verified in its source) ever use
        // binary here, so leaving postgrejs on its default would compare
        // binary decode against text decode, not decode speed.
        const result = await connection.query(EXTENDED_QUERY_SQL, {
          params: [EXTENDED_QUERY_PARAM],
          objectRows: true,
          columnFormat: DataFormat.text,
        });
        const val = result.rows?.[0]?.one;
        if (Number(val) !== EXTENDED_QUERY_PARAM) {
          throw new Error(`expected one=${EXTENDED_QUERY_PARAM}, got ${val}`);
        }
      });
    },

    extendedQueryExecuteConcurrent(handle, bench, concurrency) {
      const { connection } = handle as PostgrejsHandle;
      bench.add('extended-query-execute-concurrent', async () => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            connection.query(EXTENDED_QUERY_EXECUTE_CONCURRENT_SQL, {
              params: [i],
              objectRows: true,
              columnFormat: DataFormat.text,
            }),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const val = results[i].rows?.[0]?.val;
          if (Number(val) !== i) {
            throw new Error(`call ${i}: expected val=${i}, got ${val}`);
          }
        }
      });
    },

    mixedTypesDecode(handle, bench, rowTarget) {
      const { connection, schema } = handle as PostgrejsHandle;
      const sql = mixedTypesDecodeSql(schema);
      bench.add('mixed-types-decode', async () => {
        // columnFormat: text - see extendedQueryExecute's comment.
        // fetchCount: query() defaults Execute's fetchCount to 100 rows
        // per portal fetch when not given (see Portal.execute() -
        // `fetchCount || 100`), silently truncating a >100-row result
        // instead of fetching it all in one Execute - must be raised to
        // rowTarget to actually measure decoding rowTarget rows.
        const result = await connection.query(sql, {
          params: [rowTarget],
          objectRows: true,
          columnFormat: DataFormat.text,
          fetchCount: rowTarget,
        });
        if (result.rows?.length !== rowTarget) {
          throw new Error(
            `expected ${rowTarget} rows, got ${result.rows?.length ?? 0}`,
          );
        }
      });
    },

    // Same fetch as mixedTypesDecode, but leaving columnFormat unset so
    // query() uses its actual default (DEFAULT_COLUMN_FORMAT = binary) -
    // postgrejs's own binary decode path, on its own terms. Only postgrejs
    // implements this (see the scenario's unsupportedLibs).
    mixedTypesDecodeBinary(handle, bench, rowTarget) {
      const { connection, schema } = handle as PostgrejsHandle;
      const sql = mixedTypesDecodeSql(schema);
      bench.add('mixed-types-decode-binary', async () => {
        // fetchCount: see mixedTypesDecode's comment.
        const result = await connection.query(sql, {
          params: [rowTarget],
          objectRows: true,
          fetchCount: rowTarget,
        });
        if (result.rows?.length !== rowTarget) {
          throw new Error(
            `expected ${rowTarget} rows, got ${result.rows?.length ?? 0}`,
          );
        }
      });
    },

    // No columnFormat override - uses query()'s own Extended Query default
    // (binary), postgrejs's real path on its own terms, same as
    // mixedTypesDecodeBinary above.
    largeBlobFetch(handle, bench, sizeBytes, rowCount) {
      const { connection, schema } = handle as PostgrejsHandle;
      const sql = largeBlobFetchSql(schema);
      bench.add('large-blob-fetch', async () => {
        const result = await connection.query(sql, {
          params: [rowCount],
          fetchCount: rowCount,
        });
        const rows = result.rows;
        if (rows?.length !== rowCount) {
          throw new Error(
            `expected ${rowCount} rows, got ${rows?.length ?? 0}`,
          );
        }
        for (const row of rows) {
          const data = row[0];
          if (!Buffer.isBuffer(data) || data.length !== sizeBytes) {
            throw new Error(
              `expected a ${sizeBytes}-byte Buffer, got ${data?.length ?? typeof data}`,
            );
          }
        }
      });
    },

    // No columnFormat override - uses query()'s own Extended Query default
    // (binary), postgrejs's real path on its own terms, same as
    // largeBlobFetch above.
    largeArrayFetch(handle, bench, elementCount, rowCount) {
      const { connection, schema } = handle as PostgrejsHandle;
      const sql = largeArrayFetchSql(schema);
      bench.add('large-array-fetch', async () => {
        const result = await connection.query(sql, {
          params: [rowCount],
          fetchCount: rowCount,
        });
        const rows = result.rows;
        if (rows?.length !== rowCount) {
          throw new Error(
            `expected ${rowCount} rows, got ${rows?.length ?? 0}`,
          );
        }
        for (const row of rows) {
          const data = row[0];
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

    // Same execute()/Simple Query path as simpleQueryExecute, but fetching
    // many rows in one round trip rather than a single-value select.
    simpleQueryFetch(handle, bench, rowTarget) {
      const { connection, schema } = handle as PostgrejsHandle;
      const sql = simpleQueryFetchSql(schema, rowTarget);
      bench.add('simple-query-fetch', async () => {
        const result = await connection.execute(sql, { objectRows: true });
        const rows = result.results[0]?.rows;
        if (rows?.length !== rowTarget) {
          throw new Error(
            `expected ${rowTarget} rows, got ${rows?.length ?? 0}`,
          );
        }
      });
    },

    // postgrejs's native Cursor, fetched in batches via cursor.fetch(n).
    cursorStream(handle, bench, rowTarget, batchSize) {
      const { connection, schema } = handle as PostgrejsHandle;
      const sql = cursorStreamSql(schema, rowTarget);
      bench.add('cursor-stream', async () => {
        // columnFormat: text - see extendedQueryExecute's comment; cursors
        // also go through query()/Extended Query, so the same asymmetry
        // applies here.
        const result = await connection.query(sql, {
          objectRows: true,
          cursor: true,
          fetchCount: batchSize,
          columnFormat: DataFormat.text,
        });
        const cursor = result.cursor!;
        // eslint-disable-next-line no-empty
        while ((await cursor.fetch(batchSize)).length > 0) {}
        if (!cursor.isClosed) await cursor.close();
      });
    },

    // postgrejs's own Pool.query(), the library's top-level pooled entry
    // point.
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
              // pipeline: several of these share one pooled connection
              // instead of each holding one, so the pool's max stops
              // capping how many queries can be in flight. Opt-in per
              // call - see PoolPipelineOptions for when not to.
              pool.execute(SIMPLE_QUERY_SQL, {
                objectRows: true,
                pipeline: true,
              }),
            ),
          );
        },
        {
          beforeAll: async () => {
            pool = new Pool({
              ...connectionConfig(config),
              min: poolSize,
              max: poolSize,
              pipelineMaxQueries: 1000,
              validation: false,
            });
            return pool.start();
          },
          afterAll: async () => {
            await pool.close();
          },
        },
      );
    },

    // The Extended Query counterpart: postgrejs's own Pool.query(), which
    // always goes through Parse/Bind/Describe/Execute/Sync.
    poolExtendedQueryExecute(config, bench, concurrency, poolSize) {
      let pool!: Pool;
      bench.add(
        'pool-extended-query-execute',
        async () => {
          await Promise.all(
            Array.from({ length: concurrency }, () =>
              pool.query(EXTENDED_QUERY_SQL, {
                params: [EXTENDED_QUERY_PARAM],
                objectRows: true,
                // Text columns for the same reason as the single-connection
                // Extended Query scenario: neither pg nor postgres.js ever
                // decodes binary here.
                columnFormat: DataFormat.text,
                pipeline: true,
              }),
            ),
          );
        },
        {
          beforeAll: async () => {
            pool = new Pool({
              ...connectionConfig(config),
              min: poolSize,
              max: poolSize,
              pipelineMaxQueries: concurrency,
              validation: false,
            });
            return pool.start();
          },
          afterAll: async () => {
            await pool.close();
          },
        },
      );
    },

    // postgrejs's explicit prepare()/execute()/close() mechanism: prepared
    // once up front, executed `iterations` times per sample, closed once at
    // the end.
    preparedStatementReuse(handle, bench, iterations) {
      const { connection, schema } = handle as PostgrejsHandle;
      const sql = preparedStatementSql(schema);
      let statement!: PreparedStatement;
      bench.add(
        'prepared-statement-reuse',
        async () => {
          for (let i = 0; i < iterations; i++) {
            // columnFormat: text - see extendedQueryExecute's comment.
            await statement.execute({
              params: [1],
              objectRows: true,
              columnFormat: DataFormat.text,
            });
          }
        },
        {
          beforeAll: async () => {
            statement = await connection.prepare(sql);
          },
          afterAll: async () => {
            await statement.close();
          },
        },
      );
    },

    // Same reused statement as preparedStatementReuse, but firing
    // `concurrency` execute() calls without awaiting each individually,
    // then Promise.all()ing them.
    preparedStatementReuseConcurrent(handle, bench, concurrency) {
      const { connection, schema } = handle as PostgrejsHandle;
      const sql = preparedStatementSql(schema);
      let statement!: PreparedStatement;
      bench.add(
        'prepared-statement-reuse-concurrent',
        async () => {
          const results = await Promise.all(
            Array.from({ length: concurrency }, () =>
              statement.execute({
                params: [1],
                objectRows: true,
                columnFormat: DataFormat.text,
              }),
            ),
          );
          for (let i = 0; i < results.length; i++) {
            const id = results[i].rows?.[0]?.id;
            if (Number(id) !== 1) {
              throw new Error(`call ${i}: expected id=1, got ${id}`);
            }
          }
        },
        {
          beforeAll: async () => {
            statement = await connection.prepare(sql);
          },
          afterAll: async () => {
            await statement.close();
          },
        },
      );
    },
  },
};
