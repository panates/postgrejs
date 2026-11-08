import yargs from 'yargs';
import { ALL_LIB_IDS, DEFAULT_LIB_IDS } from './adapters/registry.js';
import { SCENARIO_NAMES } from './scenarios/index.js';
import type { LibId, ScenarioName } from './types.js';

/** What the benchmark CLI resolved its arguments to. */
export interface CliOptions {
  /** Libraries to run, already expanded from `all` or wildcards. */
  libs: LibId[];
  /** Scenarios to run, already expanded; empty for `--scenario=none`. */
  scenarios: ScenarioName[];
  /** How many times to repeat the full matrix. */
  repeats: number;
}

/**
 * What {@link parseCliArgs} returns: either options to run with, or text to
 * print instead of running anything (`--help`, `--version`).
 */
export type CliParseResult =
  { kind: 'run'; options: CliOptions } | { kind: 'output'; output: string };

/**
 * Parses the benchmark CLI's arguments without running anything.
 *
 * A leading `--` is dropped first, so `pnpm run bench -- --lib=pg` means the
 * same as `pnpm run bench --lib=pg`.
 *
 * @param args The arguments after the script name, as `hideBin(process.argv)`
 * returns them.
 * @returns The resolved options, or the help/version text when one of those
 * flags was given and nothing should run.
 * @throws Error when an option is unknown or invalid, with yargs's message
 * and the usage text.
 */
/* pnpm 12 forwards the `--` of `pnpm run bench -- --x` to the script, so
   argv ends `['--', '--x']`. yargs treats everything after `--` as
   positional, which made it ignore --lib/--scenario/--repeats/--help and
   run the whole matrix. Only a leading one is dropped: that is the shape
   pnpm produces. .strict() does not reject what follows a `--` anywhere
   else - it lands in `_` and would again run the full matrix - so the
   check below rejects any leftover positional.

   The parse callback is what keeps --help from falling through to the run:
   with a callback yargs neither prints nor exits, it hands the text back. */
export async function parseCliArgs(args: string[]): Promise<CliParseResult> {
  const input = args[0] === '--' ? args.slice(1) : args;
  return new Promise<CliParseResult>((resolve, reject) => {
    yargs()
      .scriptName('bench')
      .usage('$0 [options]')
      .option('lib', {
        type: 'string',
        alias: 'l',
        default: 'all',
        describe:
          `Comma-separated library ids, or "all" (default: ${DEFAULT_LIB_IDS.join(', ')}). ` +
          `Opt-in only, needs an explicit --lib: ${ALL_LIB_IDS.filter(id => !(DEFAULT_LIB_IDS as string[]).includes(id)).join(', ')}`,
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
        if (a._.length) {
          throw new Error(
            `Unexpected argument(s): ${a._.join(' ')} - options after a ` +
              `"--" that is not the first argument are not read`,
          );
        }
        if (!Number.isInteger(a.repeats) || a.repeats < 1) {
          throw new Error(
            `--repeats must be a positive integer, got "${a.repeats}"`,
          );
        }
        return true;
      })
      .strict()
      .help()
      .parse(input, {}, (err, argv, output) => {
        if (err) {
          reject(
            new Error(output ? `${err.message}\n\n${output}` : err.message),
          );
          return;
        }
        if (output) {
          resolve({ kind: 'output', output });
          return;
        }
        resolve({
          kind: 'run',
          options: {
            libs: resolveList(argv.lib, ALL_LIB_IDS, DEFAULT_LIB_IDS),
            scenarios: resolveList(argv.scenario, SCENARIO_NAMES),
            repeats: argv.repeats,
          },
        });
      });
  });
}

/**
 * Expands a comma-separated `--lib`/`--scenario` value into ids.
 *
 * @param value The raw option value: `all`, `none`, or a comma-separated
 * list whose items may start and/or end with `*` as a wildcard.
 * @param matchAgainst What an individual (non-"all"/"none") item is
 * validated/matched against.
 * @param allExpansion What "all" expands to - defaults to `matchAgainst`,
 * but `--lib`'s "all" deliberately expands to a narrower default set (see
 * DEFAULT_LIB_IDS) while still accepting an opt-in-only id explicitly.
 * @returns The matching ids, each once, in the order they first matched.
 */
export function resolveList<T extends string>(
  value: string,
  matchAgainst: readonly T[],
  allExpansion: readonly T[] = matchAgainst,
): T[] {
  if (value === 'all') return [...allExpansion];
  if (value === 'none') return [];
  const items = value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const seen = new Set<T>();
  for (const item of items) {
    const matches = matchAgainst.filter(v =>
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
