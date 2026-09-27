import { expect } from 'expect';
import { summarize } from '../../benchmark/report/aggregate.js';
import type { BenchResult } from '../../benchmark/types.js';

/**
 * What `summarize()` carries from each run's stats into the table.
 *
 * A stat that is measured but never aggregated is invisible: the column
 * renders an em dash and nothing says why. The two newest ones - what a
 * run was still holding when it finished, and the bytes it sent - both
 * have to survive this step, and a stored result taken before they
 * existed has to stay renderable.
 */
describe('benchmark aggregation', () => {
  const result = (run: number, stats: Partial<BenchResult['stats']>) =>
    ({
      lib: 'postgrejs',
      libraryVersion: '3.11.1',
      scenario: 'extended-query-execute',
      run,
      stats: {
        mean: run,
        p75: run,
        p99: run,
        opsPerSec: 1000 / run,
        samples: 100,
        ...stats,
      },
      params: {},
      timestamp: new Date().toISOString(),
      runtime: {
        name: 'node',
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    }) as BenchResult;

  it('should take the median of each new stat across runs', () => {
    const [summary] = summarize([
      result(1, {
        retainedHeapBytes: 1024,
        wireRxBytes: 300,
        wireTxBytes: 100,
      }),
      result(2, {
        retainedHeapBytes: 4096,
        wireRxBytes: 600,
        wireTxBytes: 200,
      }),
      result(3, {
        retainedHeapBytes: 2048,
        wireRxBytes: 900,
        wireTxBytes: 300,
      }),
    ]);
    expect(summary.medianRetainedHeapBytes).toStrictEqual(2048);
    expect(summary.medianWireRxBytes).toStrictEqual(600);
    expect(summary.medianWireTxBytes).toStrictEqual(200);
  });

  it('should leave a stat undefined when no run measured it', () => {
    // A results directory written before these existed, or a runtime
    // that cannot measure them - the column shows an em dash rather
    // than a zero that would read as "it sent nothing".
    const [summary] = summarize([result(1, {}), result(2, {})]);
    expect(summary.medianRetainedHeapBytes).toBeUndefined();
    expect(summary.medianWireTxBytes).toBeUndefined();
  });

  it('should keep a stat that only some runs measured', () => {
    const [summary] = summarize([
      result(1, { wireTxBytes: 100 }),
      result(2, {}),
    ]);
    expect(summary.medianWireTxBytes).toStrictEqual(100);
  });
});
