import { spawn } from 'node:child_process';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getBenchDbConfig, getBulkRowCount } from '../config.js';
import { readResults, summarize } from '../report/aggregate.js';
import { renderConsoleSummary } from '../report/render-console.js';
import { SCENARIOS } from '../scenarios/index.js';
import { setupBenchSchema } from '../setup.js';
import type { LibId, ScenarioName } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BENCHMARK_DIR, '..');
export const RESULTS_DIR = path.join(BENCHMARK_DIR, 'results');

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
  for (const scenario of options.scenarios) {
    for (const lib of options.libs) {
      const reason = SCENARIOS[scenario].unsupportedLibs?.[lib];
      if (reason) {
        console.log(`\n=== ${scenario} / ${lib}: skipped (${reason}) ===`);
        continue;
      }
      pairs.push({ scenario, lib });
    }
  }

  const total = pairs.length * options.repeats;
  let done = 0;
  for (const { scenario, lib } of pairs) {
    for (let run = 1; run <= options.repeats; run++) {
      done++;
      console.log(
        `\n=== [${done}/${total}] ${scenario} / ${lib} / run ${run} of ${options.repeats} ===`,
      );
      await spawnWorker(lib, scenario, run);
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
