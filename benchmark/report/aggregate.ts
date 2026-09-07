import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BenchResult, LibId, ScenarioName } from '../types.js';

export interface ScenarioLibSummary {
  lib: LibId;
  libraryVersion: string;
  scenario: ScenarioName;
  runs: BenchResult[];
  medianMean: number;
  medianP75: number;
  medianP99: number;
  medianOpsPerSec: number;
  medianSamples: number;
  /** undefined only if every run is missing this stat (see BenchResultStats). */
  medianGcCount?: number;
  medianGcDurationMs?: number;
  medianPeakHeapGrowthBytes?: number;
  medianWireRxBytes?: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Older result files (or a run without --expose-gc) may not have these
// stats at all - median of an empty/all-undefined set should stay
// undefined instead of NaN or a misleading 0.
function medianOrUndefined(values: (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => v != null);
  return defined.length ? median(defined) : undefined;
}

export function readResults(resultsDir: string): BenchResult[] {
  if (!fs.existsSync(resultsDir)) return [];
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));
  return files.map(
    f =>
      JSON.parse(
        fs.readFileSync(path.join(resultsDir, f), 'utf8'),
      ) as BenchResult,
  );
}

export function summarize(results: BenchResult[]): ScenarioLibSummary[] {
  const groups = new Map<string, BenchResult[]>();
  for (const r of results) {
    const key = `${r.scenario}__${r.lib}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const summaries: ScenarioLibSummary[] = [];
  for (const runs of groups.values()) {
    const first = runs[0];
    summaries.push({
      lib: first.lib,
      libraryVersion: first.libraryVersion,
      scenario: first.scenario,
      runs,
      medianMean: median(runs.map(r => r.stats.mean)),
      medianP75: median(runs.map(r => r.stats.p75)),
      medianP99: median(runs.map(r => r.stats.p99)),
      medianOpsPerSec: median(runs.map(r => r.stats.opsPerSec)),
      medianSamples: median(runs.map(r => r.stats.samples)),
      medianGcCount: medianOrUndefined(runs.map(r => r.stats.gcCount)),
      medianGcDurationMs: medianOrUndefined(
        runs.map(r => r.stats.gcDurationMs),
      ),
      medianPeakHeapGrowthBytes: medianOrUndefined(
        runs.map(r => r.stats.peakHeapGrowthBytes),
      ),
      medianWireRxBytes: medianOrUndefined(runs.map(r => r.stats.wireRxBytes)),
    });
  }
  return summaries;
}

export function groupByScenario(
  summaries: ScenarioLibSummary[],
): Map<ScenarioName, ScenarioLibSummary[]> {
  const byScenario = new Map<ScenarioName, ScenarioLibSummary[]>();
  for (const s of summaries) {
    const list = byScenario.get(s.scenario) ?? [];
    list.push(s);
    byScenario.set(s.scenario, list);
  }
  return byScenario;
}
