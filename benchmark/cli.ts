import process from 'node:process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ALL_LIB_IDS } from './adapters/registry.js';
import { runMatrix } from './runner/orchestrator.js';
import { SCENARIO_NAMES } from './scenarios/index.js';
import type { LibId, ScenarioName } from './types.js';

function resolveList<T extends string>(value: string, all: readonly T[]): T[] {
  if (value === 'all') return [...all];
  if (value === 'none') return [];
  const items = value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const seen = new Set<T>();
  for (const item of items) {
    const matches = all.filter(v =>
      item.startsWith('*') && item.endsWith('*')
        ? v.includes(item.replaceAll('*', ''))
        : item.startsWith('*')
          ? v.endsWith(item.replaceAll('*', ''))
          : item.endsWith('*')
            ? v.startsWith(item.replaceAll('*', ''))
            : v === item,
    );
    matches.forEach((v: T) => seen.add(v));
  }
  return Array.from(seen);
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .scriptName('bench')
    .usage('$0 [options]')
    .option('lib', {
      type: 'string',
      alias: 'l',
      default: 'all',
      describe: `Comma-separated library ids, or "all" (${ALL_LIB_IDS.join(', ')})`,
    })
    .option('scenario', {
      alias: 's',
      type: 'string',
      default: 'all',
      describe:
        `Comma-separated scenario names, "all", or "none" to only run setup - ` +
        `a trailing "-" matches by prefix, e.g. "cursor-" (${SCENARIO_NAMES.join(', ')})`,
    })
    .option('repeats', {
      type: 'number',
      alias: 'r',
      default: 3,
      describe:
        'How many times to repeat the full matrix (the report uses the median across repeats)',
    })
    .check(a => {
      if (!Number.isInteger(a.repeats) || a.repeats < 1) {
        throw new Error(
          `--repeats must be a positive integer, got "${a.repeats}"`,
        );
      }
      return true;
    })
    .strict()
    .help()
    .parse();

  const libs: LibId[] = resolveList(argv.lib, ALL_LIB_IDS);
  const scenarios: ScenarioName[] = resolveList(argv.scenario, SCENARIO_NAMES);
  const repeats = argv.repeats;

  console.log(
    `Benchmark matrix: scenarios=[${scenarios.join(', ')}] ` +
      `libs=[${libs.join(', ')}] repeats=${repeats}`,
  );
  await runMatrix({ libs, scenarios, repeats });
  console.log(
    '\nDone. Run `npm run bench:report` to regenerate BENCHMARKS.md.',
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
