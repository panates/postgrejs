export type LibId = 'postgrejs' | 'pg' | 'postgres' | 'bun';

export type ScenarioName =
  | 'connect'
  | 'simple-query-execute'
  | 'simple-query-execute-concurrent'
  | 'extended-query-execute'
  | 'extended-query-execute-concurrent'
  | 'mixed-types-decode'
  | 'mixed-types-decode-binary'
  | 'unit-of-work'
  | 'copy-from-text'
  | 'copy-from-binary'
  | 'large-blob-fetch'
  | 'large-array-fetch'
  | 'simple-query-fetch'
  | 'cursor-stream'
  | 'pool-simple-query-execute'
  | 'pool-extended-query-execute'
  | 'prepared-statement-reuse'
  | 'prepared-statement-reuse-concurrent';

export interface ScenarioMeta {
  readonly name: ScenarioName;
  /** Human-readable display name, used in BENCHMARKS.md headings. */
  readonly title: string;
  readonly description: string;
  /**
   * tinybench run options for this scenario. Kept modest by default so a
   * full `npm run bench` finishes in a reasonable time; see
   * benchmark/README.md for how to raise rigor for a "real" run.
   */
  readonly bench: {
    readonly time: number;
    readonly iterations: number;
    readonly warmupTime: number;
    readonly warmupIterations: number;
  };
  /**
   * Libraries this scenario doesn't (fully) support, mapped to a short
   * label shown in BENCHMARKS.md instead of a results row - e.g. no
   * binary protocol support at all, or partial/incomplete support that
   * would produce a misleading or outright wrong number rather than a
   * meaningful one. The orchestrator skips running these (lib, scenario)
   * pairs entirely instead of reporting a number for them.
   */
  readonly unsupportedLibs?: Partial<Record<LibId, string>>;
  /**
   * Report the bytes this scenario moved, in each direction (a column and
   * a chart per direction, and each one is left out when nothing moved
   * that way). Worth it only where the wire size is itself part of what
   * separates the libraries - a large blob or array read, where one
   * library reads binary and the others read text, or a COPY, where the
   * payload each library formats is the whole scenario.
   */
  readonly reportWireBytes?: boolean;
}

export interface BenchResultStats {
  mean: number;
  p75: number;
  p99: number;
  opsPerSec: number;
  samples: number;
  /**
   * GC activity observed (via node:perf_hooks) during the bench.run() call
   * that produced this result - includes tinybench's own warmup iterations,
   * not just the timed ones, since tinybench doesn't expose a hook at the
   * boundary between them. gcCount/gcDurationMs are totals for the whole
   * run, always populated (observing GC events doesn't need --expose-gc).
   * peakHeapGrowthBytes is the highest usedBytes() - heapUsed plus
   * external, since a Buffer and a large string are both off-heap; see
   * runner/heap-usage.ts - observed at any point while bench.run() was
   * executing, minus a baseline captured right before it via a *forced*
   * global.gc() - the most the heap ever grew
   * above a clean starting point during the run, not just what's left over
   * once it's done (a scenario that spikes memory and then frees it again
   * would show ~0 by an after-the-fact delta, but a real peak here). This
   * one only works when the worker process was started with --expose-gc
   * (the orchestrator always does this; a bare/manual `node worker.ts`
   * won't have global.gc, so this comes back undefined rather than a
   * number measured against an unknown, un-forced baseline).
   *
   * (A median-of-samples "typical heap" figure was tried alongside this
   * and dropped: for I/O-bound scenarios it collapses to ~0 because most
   * of the polled samples land during idle network wait, not during the
   * brief allocation burst - see worker.ts's withGcStats() for the full
   * writeup. Peak alone doesn't have that blind spot.)
   */
  gcCount?: number;
  gcDurationMs?: number;
  peakHeapGrowthBytes?: number;
  /**
   * What the run was still holding when it finished, against the same
   * forced-GC baseline peakHeapGrowthBytes is measured from and after a
   * second forced collection - so the two read together: the peak is the
   * most the process ever needed, and this is how much of it never went
   * away. A pool, a statement cache, a buffer that grew and was kept.
   *
   * They answer different questions and can disagree by orders of
   * magnitude on the same scenario. A large peak with nothing retained is
   * churn, which costs collector time; a figure that climbs with the call
   * count is footprint, which does not go away. Reading a peak alone for
   * the second question has produced a wrong answer before - a per-call
   * gap was taken for a fixed cost when it was garbage all along.
   *
   * Needs --expose-gc for the same reason the peak does, and is undefined
   * without it rather than measured against an unforced baseline.
   */
  retainedHeapBytes?: number;
  /**
   * Bytes received from and sent to the server during the run, counted at
   * the socket (see worker.ts) so both are comparable across libraries.
   * Only reported for scenarios that set ScenarioMeta.reportWireBytes -
   * for everything else the payload is small and identical enough that the
   * number says nothing, while for a large blob, a large array or a COPY
   * it is the whole point: the binary protocol and the text protocol put
   * very different amounts of data on the wire for the same rows.
   *
   * A scenario that writes has nothing to show in the received figure -
   * which is why both directions are counted rather than only the one a
   * fetch happens to use.
   */
  wireRxBytes?: number;
  wireTxBytes?: number;
}

/** Which JS runtime actually executed this result's worker process - see
 * runner/orchestrator.ts's RESULTS_DIR (results are stored under a
 * runtime-named subdirectory) and report/render-markdown.ts (a separate
 * report is generated per runtime, never merged - mixing pg/postgres/
 * postgrejs-under-Node numbers with Bun.sql-under-Bun numbers in one
 * table would silently conflate a library difference with a runtime
 * difference). */
export type BenchRuntime = 'node' | 'bun';

export interface BenchResult {
  lib: LibId;
  libraryVersion: string;
  scenario: ScenarioName;
  run: number;
  stats: BenchResultStats;
  params: Record<string, unknown>;
  timestamp: string;
  runtime: {
    name: BenchRuntime;
    version: string;
    platform: string;
    arch: string;
  };
}
