import { spawn } from 'node:child_process';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getBenchDbConfig, getBulkRowCount } from '../config.js';
import { readResults, summarize } from '../report/aggregate.js';
import { renderConsoleSummary } from '../report/render-console.js';
import { SCENARIOS } from '../scenarios/index.js';
import { setupBenchSchema } from '../setup.js';
import type { BenchRuntime, LibId, ScenarioName } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BENCHMARK_DIR, '..');
// Whichever executable is running *this* orchestrator process is also what
// every worker it spawns runs under (spawnWorker always re-invokes
// process.execPath) - so results land in a runtime-named subdirectory
// rather than a flat one, keeping a `bun run` invocation's numbers (e.g.
// --lib=bun, Bun's native SQL client) from ever landing in the same file
// as a plain `node` invocation's (see report/render-markdown.ts, which
// generates one report per runtime from these, never merged).
const RUNTIME: BenchRuntime = process.versions.bun ? 'bun' : 'node';
export const RESULTS_DIR = path.join(BENCHMARK_DIR, 'results', RUNTIME);

export interface OrchestratorOptions {
  libs: LibId[];
  scenarios: ScenarioName[];
  repeats: number;
}

function spawnWorker(
  lib: LibId,
  scenario: ScenarioName,
  run: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Each (lib, scenario) pair runs in its own child process, spawned
    // sequentially, to avoid CPU/connection contention skewing numbers and
    // to get clean, uncontaminated V8 JIT warm-up per run. The extra
    // `--import env.mjs` (before the register hook) is what lets the
    // `postgrejs` package-name alias resolve in this bare `node` invocation
    // — see benchmark/env.mjs. `--expose-gc` gives worker.ts a callable
    // global.gc() so it can force a clean GC before/after bench.run() to
    // measure genuinely-retained heap growth, instead of whatever V8
    // happens to have swept by chance.
    const child = spawn(
      process.execPath,
      [
        '--expose-gc',
        '--import',
        path.join(BENCHMARK_DIR, 'env.mjs'),
        '--import',
        '@swc-node/register/esm-register',
        path.join(BENCHMARK_DIR, 'runner', 'worker.ts'),
        `--lib=${lib}`,
        `--scenario=${scenario}`,
        `--run=${run}`,
        `--resultsDir=${RESULTS_DIR}`,
      ],
      { cwd: REPO_ROOT, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Worker ${lib}/${scenario} run ${run} exited with ` +
              `code=${code} signal=${signal}`,
          ),
        );
    });
  });
}

export async function runMatrix(options: OrchestratorOptions): Promise<void> {
  const config = getBenchDbConfig();
  const rowCount = getBulkRowCount();
  console.log(
    `Setting up bench schema "${config.schema}" (${rowCount} bulk rows)...`,
  );
  await setupBenchSchema(config, rowCount);

  // Scenarios can declare libs they don't (fully) support (e.g. no binary
  // protocol at all, or an incomplete implementation that would produce a
  // misleading number rather than a meaningful one) - those (lib,
  // scenario) pairs are skipped entirely rather than spawned and left to
  // fail, and the report shows the disclosed reason instead of a number.
  const pairs: { scenario: ScenarioName; lib: LibId }[] = [];
  const libsByScenario = new Map<ScenarioName, LibId[]>();
  for (const scenario of options.scenarios) {
    const libs: LibId[] = [];
    for (const lib of options.libs) {
      const reason = SCENARIOS[scenario].unsupportedLibs?.[lib];
      if (reason) {
        console.log(`\n=== ${scenario} / ${lib}: skipped (${reason}) ===`);
        continue;
      }
      libs.push(lib);
      pairs.push({ scenario, lib });
    }
    if (libs.length) libsByScenario.set(scenario, libs);
  }

  // Repeats are the outer loop, and the libraries within one scenario are
  // rotated one position on each repeat - rather than running all of a
  // library's repeats back to back.
  //
  // Back-to-back repeats put every sample a library has into the same few
  // seconds, so a burst of machine load (another process, a thermal step,
  // autovacuum waking up) lands entirely on whoever happens to be running
  // then - and taking the median across repeats cannot filter that out,
  // because all three repeats share the burst. Observed live on
  // mixed-types-decode: one scenario block slid from 4.75ms down to 2.79ms
  // across its 8 seconds, tracking wall-clock position rather than
  // library, and a rerun of the identical command minutes later reversed
  // the ranking outright.
  //
  // Interleaving spreads each library's repeats across the whole window so
  // a burst hits everyone. Rotating rather than simply reversing is what
  // moves the *middle* libraries too: mirroring only ever swaps the two
  // outermost slots, leaving anyone in the middle of a four-library matrix
  // permanently out of both the coldest (first) and warmest (last)
  // position, while a rotation walks every library through a different
  // slot on every repeat.
  const total = pairs.length * options.repeats;
  let done = 0;
  for (let run = 1; run <= options.repeats; run++) {
    for (const [scenario, libs] of libsByScenario) {
      const offset = (run - 1) % libs.length;
      const order = offset
        ? [...libs.slice(offset), ...libs.slice(0, offset)]
        : libs;
      for (const lib of order) {
        done++;
        console.log(
          `\n=== [${done}/${total}] ${scenario} / ${lib} / run ${run} of ${options.repeats} ===`,
        );
        await spawnWorker(lib, scenario, run);
      }
    }
  }

  // results/ accumulates one file per (scenario, lib, run) forever - a
  // rerun overwrites its own matching files but never removes anyone
  // else's, so an unfiltered read here would resurface every scenario/lib
  // ever benchmarked instead of just the ones -s/-l selected this time.
  const ran = new Set(pairs.map(p => `${p.scenario}__${p.lib}`));
  const results = readResults(RESULTS_DIR).filter(r =>
    ran.has(`${r.scenario}__${r.lib}`),
  );
  renderConsoleSummary(summarize(results));
}
