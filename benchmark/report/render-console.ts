import { groupByScenario, type ScenarioLibSummary } from './aggregate.js';

export function renderConsoleSummary(summaries: ScenarioLibSummary[]): string {
  const lines: string[] = [];
  const byScenario = groupByScenario(summaries);
  for (const [scenario, libs] of byScenario) {
    lines.push(`\n${scenario}`);
    const sorted = [...libs].sort((a, b) => a.medianMean - b.medianMean);
    const slowest = sorted[sorted.length - 1];
    for (const s of sorted) {
      const mult =
        slowest && slowest.medianMean > 0
          ? (slowest.medianMean / s.medianMean).toFixed(2)
          : '-';
      const gcText =
        s.medianGcCount != null
          ? ` gc=${s.medianGcCount}/${s.medianGcDurationMs?.toFixed(1)}ms`
          : '';
      const peakHeapText =
        s.medianPeakHeapGrowthBytes != null
          ? ` peakHeap=${(s.medianPeakHeapGrowthBytes / 1024).toFixed(1)}KB`
          : '';
      lines.push(
        `  ${s.lib.padEnd(10)} mean=${s.medianMean.toFixed(3)}ms ` +
          `p75=${s.medianP75.toFixed(3)}ms p99=${s.medianP99.toFixed(3)}ms ` +
          `ops/sec=${s.medianOpsPerSec.toFixed(1)} (${mult}x vs slowest)` +
          `${gcText}${peakHeapText}`,
      );
    }
  }
  return lines.join('\n');
}
