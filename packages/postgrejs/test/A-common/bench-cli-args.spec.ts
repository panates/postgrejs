import { expect } from 'expect';
import { DEFAULT_LIB_IDS } from '../../benchmark/adapters/registry.js';
import { parseCliArgs, resolveList } from '../../benchmark/cli-args.js';
import { SCENARIO_NAMES } from '../../benchmark/scenarios/index.js';

/**
 * How the benchmark CLI reads its arguments.
 *
 * `pnpm run bench -- --lib=x` hands the script a literal `--` first. yargs
 * read everything after it as positional, so the options were dropped and
 * the whole matrix ran, overwriting stored results. Nothing here runs a
 * benchmark: parsing is tested on its own.
 */
describe('benchmark CLI arguments', () => {
  it('applies options that come after a leading "--"', async () => {
    const parsed = await parseCliArgs([
      '--',
      '--lib=postgrejs',
      '--scenario=extended-query-execute',
      '--repeats=2',
    ]);
    expect(parsed).toEqual({
      kind: 'run',
      options: {
        libs: ['postgrejs'],
        scenarios: ['extended-query-execute'],
        repeats: 2,
      },
    });
  });

  it('reads the same options without "--"', async () => {
    const parsed = await parseCliArgs(['-l', 'postgrejs', '-s', 'none']);
    expect(parsed).toEqual({
      kind: 'run',
      options: { libs: ['postgrejs'], scenarios: [], repeats: 3 },
    });
  });

  it('defaults to the full default matrix', async () => {
    const parsed = await parseCliArgs([]);
    expect(parsed).toEqual({
      kind: 'run',
      options: {
        libs: [...DEFAULT_LIB_IDS],
        scenarios: [...SCENARIO_NAMES],
        repeats: 3,
      },
    });
  });

  it('returns the help text instead of options for --help', async () => {
    for (const args of [['--help'], ['--', '--help']]) {
      const parsed = await parseCliArgs(args);
      expect(parsed.kind).toBe('output');
      if (parsed.kind === 'output') {
        expect(parsed.output).toContain('--scenario');
      }
    }
  });

  it('rejects an unknown option', async () => {
    await expect(parseCliArgs(['--', '--libs=pg'])).rejects.toThrow(
      /Unknown argument/,
    );
  });

  it('rejects a "--" that is not the first argument', async () => {
    await expect(
      parseCliArgs(['--lib=pg', '--', '--scenario=none']),
    ).rejects.toThrow(/Unexpected argument\(s\): --scenario=none/);
  });

  it('rejects a non-positive --repeats', async () => {
    await expect(parseCliArgs(['--repeats=0'])).rejects.toThrow(
      /--repeats must be a positive integer/,
    );
  });

  describe('resolveList', () => {
    const ids = ['cursor-stream', 'pool-simple', 'simple-query'] as const;

    it('expands "all" to allExpansion and "none" to nothing', () => {
      expect(resolveList('all', ids, ['pool-simple'])).toEqual(['pool-simple']);
      expect(resolveList('none', ids)).toEqual([]);
    });

    it('matches prefix, suffix and infix wildcards once each', () => {
      expect(resolveList('cursor*', ids)).toEqual(['cursor-stream']);
      expect(resolveList('*simple', ids)).toEqual(['pool-simple']);
      expect(resolveList('*simple*, pool-simple', ids)).toEqual([
        'pool-simple',
        'simple-query',
      ]);
    });
  });
});
