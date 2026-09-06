import type { Bench } from 'tinybench';
import type { BenchDbConfig } from '../config.js';
import type { LibId } from '../types.js';

/**
 * Each adapter implements whole named scenarios using its own idiomatic,
 * fastest calling convention (rather than a shared SQL-call-level
 * `query(sql, params)` shape, which would flatten postgres.js's
 * tagged-template/auto-pipelining model, pg's callback/promise + named
 * statement model, and PostgreJS's Connection/Pool/Cursor/PreparedStatement
 * split into a shape none of them actually use idiomatically). All three
 * adapters read the same shared constants from benchmark/scenarios/*.ts, so
 * only the mechanism varies per library, not the workload.
 */
export interface Adapter {
  readonly id: LibId;
  /** Read from the installed package's own package.json at runtime */
  readonly libraryVersion: string;
  /** Opens a connection/pool, idiomatic per library */
  setup(config: BenchDbConfig): Promise<unknown>;
  teardown(handle: unknown): Promise<void>;
  scenarios: {
    connect(config: BenchDbConfig, bench: Bench): void;
    simpleQueryExecute(handle: unknown, bench: Bench): void;
    /**
     * Fires `concurrency` execute()/query() calls on the same connection
     * without awaiting each individually, then Promise.all()s them - checks
     * that the connection correctly serializes/pipelines concurrent calls
     * instead of cross-talking results between callers.
     */
    simpleQueryExecuteConcurrent(
      handle: unknown,
      bench: Bench,
      concurrency: number,
    ): void;
    /**
     * Same shape of call as simpleQueryExecute, but the value is bound as
     * a real query parameter (`select $1::int2`) so every library goes
     * through Parse/Bind/Describe/Execute/Sync instead of a single Query
     * message - the Extended Query counterpart to that scenario.
     */
    extendedQueryExecute(handle: unknown, bench: Bench): void;
    /**
     * Fires `concurrency` genuine Extended Query calls (a real bind
     * parameter, not a reused statement) on the same connection without
     * awaiting each individually, then Promise.all()s them - the Extended
     * Query counterpart to simpleQueryExecuteConcurrent.
     */
    extendedQueryExecuteConcurrent(
      handle: unknown,
      bench: Bench,
      concurrency: number,
    ): void;
    mixedTypesDecode(handle: unknown, bench: Bench, rowTarget: number): void;
    /**
     * Same fetch as mixedTypesDecode, but requesting binary result format.
     * Optional: only PostgreJS implements this (see mixed-types-decode-
     * binary.ts's ScenarioMeta.unsupportedLibs for why pg/postgres.js are
     * excluded rather than given a misleading number) - the orchestrator
     * never calls this for a lib not implementing it.
     */
    mixedTypesDecodeBinary?(
      handle: unknown,
      bench: Bench,
      rowTarget: number,
    ): void;
    /**
     * Fetches `rowCount` large (multi-MB) bytea values via a real bind
     * parameter (the row count itself). No protocol format is forced:
     * PostgreJS is left on its own Extended Query default (binary), pg and
     * postgres.js are left on their own defaults too (text - see
     * large-blob-fetch.ts's ScenarioMeta description for why binary isn't
     * viable for either of them here). Each library shows its own real,
     * best-available path.
     */
    largeBlobFetch(
      handle: unknown,
      bench: Bench,
      sizeBytes: number,
      rowCount: number,
    ): void;
    /**
     * Fetches `rowCount` rows of an int4[] with `elementCount` elements
     * each via a real bind parameter (the row count itself). No protocol
     * format is forced onto anyone: PostgreJS is left on its own Extended
     * Query default (binary), pg and postgres.js are left on their own
     * defaults too (text - see large-array-fetch.ts's ScenarioMeta
     * description for why pg's binary array decode isn't safe to use
     * here despite having a registered parser for it).
     */
    largeArrayFetch(
      handle: unknown,
      bench: Bench,
      elementCount: number,
      rowCount: number,
    ): void;
    simpleQueryFetch(handle: unknown, bench: Bench, rowTarget: number): void;
    cursorStream(
      handle: unknown,
      bench: Bench,
      rowTarget: number,
      batchSize: number,
    ): void;
    poolSimpleQueryExecute(
      config: BenchDbConfig,
      bench: Bench,
      concurrency: number,
      poolSize: number,
    ): void;
    /**
     * poolSimpleQueryExecute's Extended Query counterpart: the same pooled
     * burst, but each call binds a real parameter so it goes through
     * Parse/Bind/Describe/Execute/Sync rather than a single Query message.
     */
    poolExtendedQueryExecute(
      config: BenchDbConfig,
      bench: Bench,
      concurrency: number,
      poolSize: number,
    ): void;
    preparedStatementReuse(
      handle: unknown,
      bench: Bench,
      iterations: number,
    ): void;
    /**
     * Fires `concurrency` executions of the SAME reused prepared statement
     * on the same connection without awaiting each individually, then
     * Promise.all()s them - the concurrent counterpart to
     * preparedStatementReuse.
     */
    preparedStatementReuseConcurrent(
      handle: unknown,
      bench: Bench,
      concurrency: number,
    ): void;
  };
}
