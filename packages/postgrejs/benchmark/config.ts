export interface BenchDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema: string;
}

/**
 * Connection config for the benchmark's own `bench` schema, env-driven the
 * same way test/_support/env.ts drives the test suite's `test` schema
 * (PGUSER/PGPASSWORD/PGDATABASE), pointed at the same Postgres instance.
 */
export function getBenchDbConfig(): BenchDbConfig {
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'postgres',
    schema: process.env.PGBENCHSCHEMA || 'bench',
  };
}

/**
 * Row count seeded into bench.bulk_rows, used by the cursor-stream scenario.
 * Configurable so a "real" run can seed more rows.
 */
export function getBulkRowCount(): number {
  return process.env.BENCH_BULK_ROWS
    ? parseInt(process.env.BENCH_BULK_ROWS, 10)
    : 50_000;
}
