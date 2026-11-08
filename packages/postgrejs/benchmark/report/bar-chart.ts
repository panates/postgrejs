import type { ScenarioLibSummary } from './aggregate.js';
import { CHART_LIB_LABELS, LIB_ORDER } from './lib-order.js';

export interface BarChartOptions {
  title: string;
  unit: string;
  /**
   * The value for one library, or `null` when this figure was not
   * measured for it - which is not the same as zero and must not be
   * drawn as one. See renderBarChart().
   */
  valueOf: (s: ScenarioLibSummary) => number | null;
  width?: number;
  height?: number;
  color?: string;
}

/**
 * GitHub renders ```mermaid fences natively, so a chart here is plain
 * committed text - no image files to generate/regenerate/gitignore.
 * Shared by the latency/throughput/GC/heap/network charts - only the
 * title/unit/value-per-library, canvas width, and (for ops/sec) bar color
 * differ.
 *
 * A library whose value is `null` is left out of the chart entirely,
 * label and all, rather than plotted at zero. Under Bun that is the
 * difference between "Bun.sql's own wire I/O is not visible to the
 * counter" and "Bun.sql moved no bytes": the table says the first with
 * an em dash, and a zero-length bar beside two long ones said the
 * second - the flattering reading, and the false one. When nothing is
 * left to draw, the chart is not drawn at all.
 */
export function renderBarChart(
  summaries: ScenarioLibSummary[],
  opts: BarChartOptions,
): string {
  const byLib = new Map(summaries.map(s => [s.lib, s]));
  const ordered = LIB_ORDER.map(lib => byLib.get(lib)).filter(
    (s): s is ScenarioLibSummary => !!s,
  );
  const measured: { label: string; value: number }[] = [];
  let s: ScenarioLibSummary;
  let value: number | null;
  let i: number;
  const l = ordered.length;
  for (i = 0; i < l; i++) {
    s = ordered[i];
    value = opts.valueOf(s);
    if (value == null) continue;
    measured.push({ label: CHART_LIB_LABELS[s.lib] ?? s.lib, value });
  }
  if (!measured.length) return '';

  const values = measured.map(m => m.value);
  // Without an explicit range, xychart-beta auto-scales the value axis to
  // fit the data tightly (roughly [min, max] of the bars, not anchored at
  // 0) - for a scenario where every library lands within a few percent of
  // each other (e.g. Sequential Execution), that tight window makes
  // trivial differences look like one bar is a sliver next to another.
  // Anchoring at 0 (extended to whichever side of 0 the data actually
  // falls on) keeps bar length honestly proportional to the actual
  // values. Heap Δ in particular is often *negative* (a run that nets out
  // shrinking the heap) - Math.min/max each include a literal 0 candidate
  // so an all-positive series still anchors its floor at 0 and an
  // all-negative one anchors its ceiling at 0, rather than assuming
  // every chart's data is non-negative like the latency/GC ones usually
  // are. A flat all-zero series (e.g. no GC observed at all) would make
  // both ends 0 too - xychart-beta needs a non-degenerate range, so that
  // case floors the ceiling at a small positive number instead.
  //
  // The max headroom is 50%, not the ~10% you'd use for a plain chart:
  // with chartOrientation set to horizontal below, this value axis runs
  // left-to-right, so a bar reaching the real max value now stops at
  // ~67% of the chart's width - deliberately leaving empty space on the
  // right for GitHub's fixed-position pan/zoom overlay (see
  // renderScenarioCharts) to sit over instead of over an actual bar.
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);
  const yAxisMin = (minValue < 0 ? minValue * 1.1 : 0).toFixed(4);
  const yAxisMax = (
    maxValue > 0 ? maxValue * 1.5 : minValue < 0 ? 0 : 1
  ).toFixed(4);
  // Mermaid's xychart-beta defaults to a large canvas; the 'xyChart' init
  // config (must be the first line inside the fence) resizes it. This
  // width/height is the diagram's own internal coordinate system, not its
  // rendered pixel size on github.com - GitHub renders every Mermaid
  // diagram inside its own iframe, sized by whatever HTML container holds
  // it (see renderScenarioCharts), so this number mainly sets the
  // diagram's internal aspect ratio/proportions, not how big it ends up
  // on screen. (xychart-beta's bar/gap ratio itself isn't configurable -
  // checked mermaid's own resolved xyChart config schema live, no such
  // option exists - so bar width can't be tuned separately from chart
  // width.) Bar color is a THEME variable, not a top-level xyChart config
  // key, hence the separate object.
  //
  // chartOrientation: 'horizontal' - GitHub's pan/zoom overlay is
  // positioned by GitHub itself and can't be hidden, resized, or
  // repositioned from here (confirmed against GitHub's own community
  // discussions - no config, CSS, or directive controls it). What we CAN
  // control is where the diagram's own content falls relative to that
  // fixed position: with bars running left-to-right instead of bottom-
  // to-top, and yAxisMax's 50% headroom above pushing every bar's real
  // value well short of the chart's right edge (see yAxisMax's own
  // comment), the overlay - which sits over roughly the same region
  // either way - now lands on that empty margin instead of on a bar.
  const initParts = [
    `'xyChart': {'width': ${opts.width ?? 500}, 'height': ${opts.height ?? 260}, 'chartOrientation': 'horizontal'}`,
  ];
  if (opts.color) {
    initParts.push(
      `'themeVariables': {'xyChart': {'plotColorPalette': '${opts.color}'}}`,
    );
  }
  return [
    '```mermaid',
    `%%{init: {${initParts.join(', ')}}}%%`,
    'xychart-beta',
    `    title "${opts.title}"`,
    `    x-axis [${measured.map(m => JSON.stringify(m.label)).join(', ')}]`,
    `    y-axis "${opts.unit}" ${yAxisMin} --> ${yAxisMax}`,
    `    bar [${values.map(v => v.toFixed(4)).join(', ')}]`,
    '```',
  ].join('\n');
}
