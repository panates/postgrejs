import { groupByScenario, type ScenarioLibSummary } from './aggregate.js';

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

type Cell = string | number | null;
type Row = Record<string, Cell>;

/**
 * Renders `rows` as a box-drawn table, numbers right-aligned and text
 * left-aligned - console.table() has no alignment option of its own (it
 * left-aligns everything, `lib` included), so this reimplements just enough
 * of its look to right-align the numeric columns the summary is mostly
 * made of.
 */
function printTable(rows: Row[], leftAlign: Set<string> = new Set()): void {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const cellText = (v: Cell): string => (v == null ? '-' : String(v));
  // Right-aligns every column except `lib` and whatever else the caller
  // names in `leftAlign` (e.g. "vs slowest (x)" reads more like a label -
  // 1.00x, 1.02x, 1.04x - than a value to compare down a column).
  const isNumeric = new Map<string, boolean>(
    columns.map(c => [c, !leftAlign.has(c)]),
  );
  const widths = new Map<string, number>(
    columns.map(c => [
      c,
      Math.max(c.length, ...rows.map(r => cellText(r[c]).length)),
    ]),
  );
  const pad = (text: string, width: number, alignRight: boolean): string =>
    alignRight ? text.padStart(width) : text.padEnd(width);
  const rule = (l: string, m: string, r: string): string =>
    l + columns.map(c => '─'.repeat(widths.get(c)! + 2)).join(m) + r;
  const renderRow = (cells: string[], aligned: boolean[]): string =>
    '│ ' +
    columns
      .map((c, i) => pad(cells[i], widths.get(c)!, aligned[i]))
      .join(' │ ') +
    ' │';

  console.log(rule('┌', '┬', '┐'));
  console.log(
    renderRow(
      columns,
      columns.map(c => isNumeric.get(c)!),
    ),
  );
  console.log(rule('├', '┼', '┤'));
  for (const r of rows) {
    console.log(
      renderRow(
        columns.map(c => cellText(r[c])),
        columns.map(c => isNumeric.get(c)!),
      ),
    );
  }
  console.log(rule('└', '┴', '┘'));
}

/**
 * Prints one table per scenario instead of hand-aligned `key=value` text -
 * see printTable() for why this isn't console.table() itself.
 */
export function renderConsoleSummary(summaries: ScenarioLibSummary[]): void {
  const byScenario = groupByScenario(summaries);
  for (const [scenario, libs] of byScenario) {
    console.log(`\n${scenario}`);
    const sorted = [...libs].sort((a, b) => a.medianMean - b.medianMean);
    const slowest = sorted[sorted.length - 1];
    const rows: Row[] = sorted.map(s => ({
      lib: s.lib,
      'mean (ms)': round(s.medianMean, 3),
      'p75 (ms)': round(s.medianP75, 3),
      'p99 (ms)': round(s.medianP99, 3),
      'ops/sec': round(s.medianOpsPerSec, 1),
      'vs slowest':
        slowest && slowest.medianMean > 0
          ? round(slowest.medianMean / s.medianMean, 2) + 'x'
          : null,
      'gc count': s.medianGcCount ?? null,
      'gc (ms)':
        s.medianGcDurationMs != null ? round(s.medianGcDurationMs, 1) : null,
      'peak heap (KB)':
        s.medianPeakHeapGrowthBytes != null
          ? round(s.medianPeakHeapGrowthBytes / 1024, 1)
          : null,
    }));
    printTable(rows, new Set(['lib', 'vs slowest']));
  }
}
