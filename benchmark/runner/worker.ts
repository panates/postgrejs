import * as fs from 'node:fs';
import net from 'node:net';
import * as path from 'node:path';
import { PerformanceObserver } from 'node:perf_hooks';
import process from 'node:process';
import { Bench } from 'tinybench';
import { isLibId, loadAdapter } from '../adapters/registry.js';
import { getBenchDbConfig, getBulkRowCount } from '../config.js';
import {
  CURSOR_STREAM_BATCH_SIZE,
  EXTENDED_QUERY_EXECUTE_CONCURRENT_CONCURRENCY,
  isScenarioName,
  LARGE_ARRAY_ELEMENT_COUNT,
  LARGE_ARRAY_ROW_COUNT,
  LARGE_BLOB_ROW_COUNT,
  LARGE_BLOB_SIZE_BYTES,
  MIXED_TYPES_DECODE_ROW_TARGET,
  POOL_EXTENDED_QUERY_EXECUTE_CONCURRENCY,
  POOL_EXTENDED_QUERY_EXECUTE_POOL_SIZE,
  POOL_SIMPLE_QUERY_EXECUTE_CONCURRENCY,
  POOL_SIMPLE_QUERY_EXECUTE_POOL_SIZE,
  PREPARED_STATEMENT_ITERATIONS,
  PREPARED_STATEMENT_REUSE_CONCURRENT_CONCURRENCY,
  SCENARIOS,
  SIMPLE_QUERY_EXECUTE_CONCURRENT_CONCURRENCY,
  SIMPLE_QUERY_FETCH_ROW_TARGET,
} from '../scenarios/index.js';
import type { BenchResult, LibId, ScenarioName } from '../types.js';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

interface GcStats {
  gcCount?: number;
  gcDurationMs?: number;
  peakHeapGrowthBytes?: number;
  wireRxBytes?: number;
}

// Bytes the server sent us, counted where they enter the process rather
// than anywhere library-specific: Readable.push() is what the socket calls
// with each incoming chunk, so this sees all three libraries' traffic
// identically (and TLS sockets inherit it, though no scenario uses TLS).
// Patched once at module load - the connections these scenarios measure
// are opened later, by adapter.setup().
let rxBytes = 0;
const originalSocketPush = net.Socket.prototype.push;
net.Socket.prototype.push = function (chunk: any, ...rest: any[]): boolean {
  // push(null) signals EOF and carries no bytes.
  if (chunk) rxBytes += chunk.length;
  return originalSocketPush.call(this, chunk, ...rest);
};

// How often to sample heapUsed while the run is in flight. A before/after
// snapshot only sees what's left over once everything is done - it can't
// tell a scenario that peaks at 200MB mid-run and frees it all apart from
// one that never allocates more than 1MB, even though the first one is the
// one that risks an OOM under load. Polling instead catches the highest
// point the heap actually reached. 1ms is frequent enough to catch spikes
// within a bench.run() call that runs for at least tens of milliseconds
// (this project's fastest scenarios) without meaningfully perturbing it.
//
// (A "typical"/median-of-samples heap figure was tried alongside this and
// removed: for I/O-bound scenarios - most of a call's wall-clock time
// spent waiting on the network rather than allocating - the vast majority
// of 1ms samples land during that idle wait, where heapUsed sits back near
// baseline, so the median collapses to ~0 even when a real, large spike
// happens on every single call (confirmed live: large-blob-fetch showed
// 0KB "typical" for pg/postgres despite a 1-1.5MB peak on the same runs).
// Peak alone, imprecise as a single point-in-time reading can be, doesn't
// have that systematic blind spot.)
const HEAP_SAMPLE_INTERVAL_MS = 1;

/**
 * Wraps `run()` with GC/heap instrumentation - a PerformanceObserver counts
 * every GC pause (and its duration) that happens during the call; this
 * part works regardless of --expose-gc, since observing GC events doesn't
 * require the ability to force one. peakHeapGrowthBytes is different: it
 * forces a clean baseline via global.gc() immediately before the call, then
 * polls process.memoryUsage().heapUsed every HEAP_SAMPLE_INTERVAL_MS while
 * `run()` is executing and keeps the highest value seen - the most the heap
 * ever grew above that baseline at any point during the run, not just
 * whatever happens to still be alive afterwards. That part only works when
 * the process was started with --expose-gc (see orchestrator.ts); without
 * it global.gc is undefined and peakHeapGrowthBytes comes back undefined
 * rather than a number measured against an unknown, un-forced baseline.
 */
async function withGcStats(run: () => Promise<void>): Promise<GcStats> {
  const gc = (global as { gc?: () => void }).gc;
  let gcCount = 0;
  let gcDurationMs = 0;
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      gcCount++;
      gcDurationMs += entry.duration;
    }
  });
  observer.observe({ entryTypes: ['gc'] });

  const rxBefore = rxBytes;
  const heapBefore = gc ? (gc(), process.memoryUsage().heapUsed) : undefined;
  let peakHeapUsed = heapBefore ?? process.memoryUsage().heapUsed;
  const sampler = setInterval(() => {
    const current = process.memoryUsage().heapUsed;
    if (current > peakHeapUsed) peakHeapUsed = current;
  }, HEAP_SAMPLE_INTERVAL_MS);
  sampler.unref();

  await run();

  clearInterval(sampler);
  observer.disconnect();

  return {
    gcCount,
    gcDurationMs,
    peakHeapGrowthBytes:
      heapBefore != null ? Math.max(peakHeapUsed - heapBefore, 0) : undefined,
    wireRxBytes: rxBytes - rxBefore,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const libArg = args.lib;
  const scenarioArg = args.scenario;
  const run = args.run ? parseInt(args.run, 10) : 1;
  const resultsDir = args.resultsDir;

  if (!libArg || !isLibId(libArg)) {
    throw new Error(`Invalid or missing --lib "${libArg}"`);
  }
  if (!scenarioArg || !isScenarioName(scenarioArg)) {
    throw new Error(`Invalid or missing --scenario "${scenarioArg}"`);
  }
  if (!resultsDir) throw new Error('Missing --resultsDir');

  const lib: LibId = libArg;
  const scenarioName: ScenarioName = scenarioArg;
  const meta = SCENARIOS[scenarioName];
  const config = getBenchDbConfig();
  const rowTarget = getBulkRowCount();

  const adapter = await loadAdapter(lib);
  const bench = new Bench({
    time: meta.bench.time,
    iterations: meta.bench.iterations,
    warmupTime: meta.bench.warmupTime,
    warmupIterations: meta.bench.warmupIterations,
    throws: true,
  });

  // "connect" and the pool-* scenarios manage their own connection
  // lifecycle per call (each opens what it needs), everything else runs
  // against a single already-open handle from adapter.setup().
  const needsHandle =
    scenarioName !== 'connect' &&
    scenarioName !== 'pool-simple-query-execute' &&
    scenarioName !== 'pool-extended-query-execute';
  const handle: unknown = needsHandle ? await adapter.setup(config) : undefined;

  const params: Record<string, unknown> = {};
  switch (scenarioName) {
    case 'connect':
      adapter.scenarios.connect(config, bench);
      break;
    case 'simple-query-execute':
      adapter.scenarios.simpleQueryExecute(handle, bench);
      break;
    case 'simple-query-execute-concurrent':
      adapter.scenarios.simpleQueryExecuteConcurrent(
        handle,
        bench,
        SIMPLE_QUERY_EXECUTE_CONCURRENT_CONCURRENCY,
      );
      params.concurrency = SIMPLE_QUERY_EXECUTE_CONCURRENT_CONCURRENCY;
      break;
    case 'extended-query-execute':
      adapter.scenarios.extendedQueryExecute(handle, bench);
      break;
    case 'extended-query-execute-concurrent':
      adapter.scenarios.extendedQueryExecuteConcurrent(
        handle,
        bench,
        EXTENDED_QUERY_EXECUTE_CONCURRENT_CONCURRENCY,
      );
      params.concurrency = EXTENDED_QUERY_EXECUTE_CONCURRENT_CONCURRENCY;
      break;
    case 'mixed-types-decode':
      adapter.scenarios.mixedTypesDecode(
        handle,
        bench,
        MIXED_TYPES_DECODE_ROW_TARGET,
      );
      params.rowTarget = MIXED_TYPES_DECODE_ROW_TARGET;
      break;
    case 'mixed-types-decode-binary':
      // The orchestrator skips (lib, scenario) pairs listed in this
      // scenario's unsupportedLibs before ever spawning a worker for them,
      // so this should only run for libs that implement the method - this
      // check is defense-in-depth for a manual/direct worker invocation.
      if (!adapter.scenarios.mixedTypesDecodeBinary) {
        throw new Error(`${lib} does not implement mixed-types-decode-binary`);
      }
      adapter.scenarios.mixedTypesDecodeBinary(
        handle,
        bench,
        MIXED_TYPES_DECODE_ROW_TARGET,
      );
      params.rowTarget = MIXED_TYPES_DECODE_ROW_TARGET;
      break;
    case 'large-blob-fetch':
      adapter.scenarios.largeBlobFetch(
        handle,
        bench,
        LARGE_BLOB_SIZE_BYTES,
        LARGE_BLOB_ROW_COUNT,
      );
      params.sizeBytes = LARGE_BLOB_SIZE_BYTES;
      params.rowCount = LARGE_BLOB_ROW_COUNT;
      break;
    case 'large-array-fetch':
      adapter.scenarios.largeArrayFetch(
        handle,
        bench,
        LARGE_ARRAY_ELEMENT_COUNT,
        LARGE_ARRAY_ROW_COUNT,
      );
      params.elementCount = LARGE_ARRAY_ELEMENT_COUNT;
      params.rowCount = LARGE_ARRAY_ROW_COUNT;
      break;
    case 'simple-query-fetch':
      adapter.scenarios.simpleQueryFetch(
        handle,
        bench,
        SIMPLE_QUERY_FETCH_ROW_TARGET,
      );
      params.rowTarget = SIMPLE_QUERY_FETCH_ROW_TARGET;
      break;
    case 'cursor-stream':
      adapter.scenarios.cursorStream(
        handle,
        bench,
        rowTarget,
        CURSOR_STREAM_BATCH_SIZE,
      );
      params.rowTarget = rowTarget;
      params.batchSize = CURSOR_STREAM_BATCH_SIZE;
      break;
    case 'pool-simple-query-execute':
      adapter.scenarios.poolSimpleQueryExecute(
        config,
        bench,
        POOL_SIMPLE_QUERY_EXECUTE_CONCURRENCY,
        POOL_SIMPLE_QUERY_EXECUTE_POOL_SIZE,
      );
      params.concurrency = POOL_SIMPLE_QUERY_EXECUTE_CONCURRENCY;
      params.poolSize = POOL_SIMPLE_QUERY_EXECUTE_POOL_SIZE;
      break;
    case 'pool-extended-query-execute':
      adapter.scenarios.poolExtendedQueryExecute(
        config,
        bench,
        POOL_EXTENDED_QUERY_EXECUTE_CONCURRENCY,
        POOL_EXTENDED_QUERY_EXECUTE_POOL_SIZE,
      );
      params.concurrency = POOL_EXTENDED_QUERY_EXECUTE_CONCURRENCY;
      params.poolSize = POOL_EXTENDED_QUERY_EXECUTE_POOL_SIZE;
      break;
    case 'prepared-statement-reuse':
      adapter.scenarios.preparedStatementReuse(
        handle,
        bench,
        PREPARED_STATEMENT_ITERATIONS,
      );
      params.iterations = PREPARED_STATEMENT_ITERATIONS;
      break;
    case 'prepared-statement-reuse-concurrent':
      adapter.scenarios.preparedStatementReuseConcurrent(
        handle,
        bench,
        PREPARED_STATEMENT_REUSE_CONCURRENT_CONCURRENCY,
      );
      params.concurrency = PREPARED_STATEMENT_REUSE_CONCURRENT_CONCURRENCY;
      break;
  }

  const gcStats = await withGcStats(() => bench.run());

  if (needsHandle) await adapter.teardown(handle);

  const task = bench.tasks[0];
  const result = task?.result;
  if (!result || result.state !== 'completed') {
    const errorMessage =
      result && result.state === 'errored' ? result.error.message : undefined;
    throw new Error(
      `Benchmark task did not complete for ${lib}/${scenarioName} ` +
        `(state=${result?.state ?? 'unknown'})` +
        (errorMessage ? `: ${errorMessage}` : ''),
    );
  }

  const benchResult: BenchResult = {
    lib,
    libraryVersion: adapter.libraryVersion,
    scenario: scenarioName,
    run,
    stats: {
      mean: result.latency.mean,
      p75: result.latency.p75,
      p99: result.latency.p99,
      opsPerSec: result.throughput.mean,
      samples: result.latency.samplesCount,
      ...gcStats,
    },
    params,
    timestamp: new Date().toISOString(),
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };

  fs.mkdirSync(resultsDir, { recursive: true });
  const filePath = path.join(
    resultsDir,
    `${scenarioName}__${lib}__${run}.json`,
  );
  fs.writeFileSync(filePath, JSON.stringify(benchResult, null, 2));

  const peakHeapText =
    gcStats.peakHeapGrowthBytes != null
      ? `${(gcStats.peakHeapGrowthBytes / 1024).toFixed(1)}KB`
      : 'n/a';
  console.log(
    `[${lib}/${scenarioName} run ${run}] ` +
      `mean=${result.latency.mean.toFixed(3)}ms ` +
      `p75=${result.latency.p75.toFixed(3)}ms ` +
      `p99=${result.latency.p99.toFixed(3)}ms ` +
      `ops/sec=${result.throughput.mean.toFixed(1)} ` +
      `samples=${result.latency.samplesCount} ` +
      `gc=${gcStats.gcCount}/${gcStats.gcDurationMs?.toFixed(1)}ms ` +
      `peakHeap=${peakHeapText}`,
  );

  // Some adapters' pools/sockets can leave a stray timer/handle behind even
  // after being closed, which would otherwise keep this one-shot worker
  // process alive indefinitely. The benchmark and its result file are
  // already complete at this point, so exit explicitly rather than wait for
  // the event loop to drain.
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
