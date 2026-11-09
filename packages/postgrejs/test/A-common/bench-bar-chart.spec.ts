import { expect } from 'expect';
import type { ScenarioLibSummary } from '../../benchmark/report/aggregate.js';
import { renderBarChart } from '../../benchmark/report/bar-chart.js';

/**
 * What a chart does with a figure that was never measured.
 *
 * Every caller used to hand it `?? 0`, so a library the counter cannot
 * see - Bun.sql, whose wire I/O does not go through `node:net` - was
 * drawn as a zero-length bar next to two long ones. The table beside it
 * said the honest thing with an em dash while the picture said "moved
 * almost nothing", which is both the flattering reading and the false
 * one.
 */
describe('benchmark bar chart', () => {
  const summary = (lib: string, mean: number): ScenarioLibSummary =>
    ({
      lib,
      libraryVersion: '0.0.0',
      scenario: 'large-array-fetch',
      runs: [],
      medianMean: mean,
      medianP75: mean,
      medianP99: mean,
      medianOpsPerSec: 1000 / mean,
      medianSamples: 100,
    }) as unknown as ScenarioLibSummary;

  const SUMMARIES = [
    summary('postgrejs', 1),
    summary('pg', 2),
    summary('bun', 3),
  ];

  const NETWORK: Record<string, number | null> = {
    postgrejs: 4608,
    pg: 7065,
    bun: null,
  };

  it('should leave out a library whose figure was not measured', () => {
    const chart = renderBarChart(SUMMARIES, {
      title: 'Network received (KB/op, lower is better)',
      unit: 'KB/op',
      valueOf: s => NETWORK[s.lib],
    });
    expect(chart).toContain('x-axis ["PostgreJS", "pg"]');
    expect(chart).toContain('bar [4608.0000, 7065.0000]');
    // Not as a label with no bar, and not as a bar of zero: the bar list
    // has two entries, not three. (The axis floor is still 0 - that is
    // the range, not a value.)
    expect(chart).not.toContain('Bun.sql');
    expect(chart).toMatch(/bar \[[^\]]*\]/);
    expect(chart.match(/bar \[([^\]]*)\]/)![1].split(',')).toHaveLength(2);
  });

  it('should render nothing at all when no library measured it', () => {
    // Under Bun no library has a GC figure, so that chart has nothing to
    // say - an axis of three names against three zeroes would say
    // something, and it would be wrong.
    expect(
      renderBarChart(SUMMARIES, {
        title: 'GC time (ms/op, lower is better)',
        unit: 'ms/op',
        valueOf: () => null,
      }),
    ).toStrictEqual('');
  });

  it('should keep a real zero, which is a measurement', () => {
    // Nothing retained after the run is a fact about the library, unlike
    // a figure nobody could take.
    const chart = renderBarChart(SUMMARIES, {
      title: 'Retained heap (KB, still held after the run)',
      unit: 'KB',
      valueOf: s => (s.lib === 'postgrejs' ? 0 : 1024),
    });
    expect(chart).toContain('x-axis ["PostgreJS", "pg", "Bun.sql"]');
    expect(chart).toContain('bar [0.0000, 1024.0000, 1024.0000]');
  });

  it('should keep the fixed library order, whoever is missing', () => {
    const chart = renderBarChart(SUMMARIES, {
      title: 'Mean latency (ms, lower is better)',
      unit: 'ms',
      valueOf: s => (s.lib === 'pg' ? null : s.medianMean),
    });
    expect(chart).toContain('x-axis ["PostgreJS", "Bun.sql"]');
    expect(chart).toContain('bar [1.0000, 3.0000]');
  });

  it('should scale the axis to what is left, not to what was dropped', () => {
    // The dropped library had the largest value; keeping it in the range
    // would leave every remaining bar short for no visible reason.
    const chart = renderBarChart(SUMMARIES, {
      title: 'Mean latency (ms, lower is better)',
      unit: 'ms',
      valueOf: s => (s.lib === 'bun' ? null : s.medianMean),
    });
    expect(chart).toContain('y-axis "ms" 0.0000 --> 3.0000');
  });
});
