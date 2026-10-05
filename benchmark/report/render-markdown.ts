import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Connection } from 'postgrejs';
import { getBenchDbConfig } from '../config.js';
import { SCENARIO_NAMES, SCENARIOS } from '../scenarios/index.js';
import type { BenchResult, BenchRuntime, ScenarioName } from '../types.js';
import {
  groupByScenario,
  readResults,
  type ScenarioLibSummary,
  summarize,
} from './aggregate.js';
import { renderBarChart } from './bar-chart.js';
import { LIB_ORDER } from './lib-order.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BENCHMARK_DIR, '..');

const LIB_LABELS: Record<string, string> = {
  postgrejs: 'PostgreJS',
  pg: 'pg (node-postgres)',
  postgres: 'postgres (postgres.js)',
  bun: 'Bun.sql',
};

/** Smallest relative gap that can still count as a real difference, used
 * as a floor under the data-derived tie band in renderScenarioTable(). One
 * percent is below what a paired, same-process A/B can resolve on the
 * machines these numbers get produced on - measured repeatedly while
 * chasing this project's own regressions, where re-running an unchanged
 * pair moved the gap by more than this in both directions. */
const TIE_FLOOR = 0.01;

/** Ceiling on that same band. The band is the leader's own spread across
 * repeats, which a single bad repeat can blow out without limit - one
 * scheduling stall in one run of one library and every value in the table
 * gets called a tie, including pairs that are genuinely half a
 * multiple apart. Past a few percent the honest reading is "this
 * scenario's repeats were too noisy to compare", which a table of numbers
 * has no way to say, so the band stops growing and the larger differences
 * are shown as differences again. Five percent sits above what separate
 * child processes minutes apart can resolve and below the gaps this suite
 * is built to surface, which run to multiples rather than percentages. */
const TIE_CEILING = 0.05;

interface ResultGroup {
  title: string;
  description: string;
  scenarios: ScenarioName[];
}

// Scenarios grouped by what they actually exercise, so a reader can jump to
// "Simple Query" or "Connection Pooling" instead of scanning a flat list of
// 9 unrelated-looking headings. Order here is the order they render in.
const RESULT_GROUPS: ResultGroup[] = [
  {
    title: 'Connection',
    description:
      'The fixed cost of opening (and closing) a connection - the TCP ' +
      'handshake, PostgreSQL startup/auth handshake, and `ReadyForQuery`, ' +
      'paid once per connection lifetime rather than once per query.',
    scenarios: ['connect'],
  },
  {
    title: 'Simple Query',
    description:
      "PostgreSQL's Simple Query sub-protocol: the client sends the SQL " +
      'text as a single `Query` (`Q`) message and the server parses, ' +
      'plans, executes, and streams the results back in that same round ' +
      'trip - no separate parse/bind/describe/execute/sync steps, and no ' +
      'query parameters. In postgrejs this is `Connection.execute(sql)`. ' +
      "It's the cheapest way to run a query the client isn't going to " +
      "reuse, which is why it's also the baseline every other protocol " +
      "group below is compared against. It's distinct from the Extended " +
      'Query group below: Extended Query trades this single round trip ' +
      'for several (parse, bind, describe, execute, sync) in exchange for ' +
      'bind parameters and a statement the server can plan once and ' +
      're-execute. The scenarios here measure that Simple Query round ' +
      'trip three ways: a single query on an otherwise-idle connection, ' +
      'many queries fired concurrently over one connection, and one ' +
      'query that fetches many rows.',
    scenarios: [
      'simple-query-execute',
      'simple-query-execute-concurrent',
      'simple-query-fetch',
    ],
  },
  {
    title: 'Extended Query',
    description:
      "PostgreSQL's Extended Query sub-protocol: the client splits a " +
      'query into separate `Parse`, `Bind`, `Describe`, `Execute`, and ' +
      "`Sync` messages instead of Simple Query's single `Query` message " +
      '- more wire round trips per query, but it is what makes bind ' +
      'parameters, typed result columns, and a statement the server ' +
      'plans once and can re-execute possible at all (none of that ' +
      'exists in Simple Query). In postgrejs, `Connection.query(sql)` ' +
      'always goes through this path, and `Connection.prepare(sql)` ' +
      'additionally gives back a reusable `PreparedStatement` handle ' +
      'instead of re-sending `Parse` on every call. The scenarios here ' +
      "mirror the Simple Query group's own Sequential/Concurrent pair - " +
      'a single parameterized call one at a time, then many fired ' +
      'concurrently over one connection - plus decoding many mixed-type ' +
      'rows through `query()` (the row count itself a bind parameter, ' +
      'large enough that decode work dominates the measurement) on both ' +
      'the text and binary wire formats, and the cost this protocol is ' +
      'meant to amortize away: reusing one prepared statement across ' +
      'many executions, sequentially and then concurrently.',
    scenarios: [
      'extended-query-execute',
      'extended-query-execute-concurrent',
      'mixed-types-decode',
      'mixed-types-decode-binary',
      'large-blob-fetch',
      'large-array-fetch',
      'prepared-statement-reuse',
      'prepared-statement-reuse-concurrent',
    ],
  },
  {
    title: 'Unit of Work',
    description:
      'Several different statements run as one unit, the shape a single ' +
      'request usually has - a few writes, a few reads, none of them ' +
      'repeating. Every library sends them without waiting between ' +
      'replies, which all three can do; what separates them is whether ' +
      'each statement still costs its own `Sync`, and with it a round of ' +
      "the server's implicit-transaction bookkeeping. Distinct from the " +
      'Concurrent Execution scenarios above, where the same query is ' +
      'fired many times and a parsed plan can be shared.',
    scenarios: ['unit-of-work'],
  },
  {
    title: 'Bulk Load',
    description:
      '`COPY ... FROM STDIN`, the path PostgreSQL optimises for writing ' +
      'many rows at once - one statement carrying a stream of rows ' +
      'instead of an INSERT per row or a bind per row. The two scenarios ' +
      'are the same 200,000 rows sent two ways: as CSV every library ' +
      'formats itself, and as the binary COPY format only PostgreJS can ' +
      'produce. Read them together - the text table is what separates the ' +
      'drivers, and the difference between the tables is what the format ' +
      'buys. Both scenarios truncate the destination inside the timed ' +
      'call and start from the same materialised rows, so each library ' +
      'pays for its own formatting rather than being handed a payload ' +
      'someone else built.',
    scenarios: ['copy-from-text', 'copy-from-binary'],
  },
  {
    title: 'Cursor Streaming',
    description:
      "A server-side cursor (postgrejs's `Connection.query(sql, " +
      '{ cursor: true })`) fetches rows in bounded batches via repeated ' +
      'Extended Query `Execute` calls against a portal, instead of the ' +
      'server materializing and sending the whole result set at once. ' +
      "The relevant metric when a result set doesn't comfortably fit in " +
      'memory, not raw single-shot throughput.',
    scenarios: ['cursor-stream'],
  },
  {
    title: 'Connection Pooling',
    description:
      "The overhead each library's connection pool adds on top of the " +
      'raw per-query costs measured above: running many queries ' +
      "concurrently through a shared pool (postgrejs's `Pool.query()`), " +
      'and isolating the pure cost of acquiring and releasing a pooled ' +
      'connection from the cost of the query itself.',
    scenarios: ['pool-simple-query-execute', 'pool-extended-query-execute'],
  },
];

async function getPostgresVersion(): Promise<string> {
  const config = getBenchDbConfig();
  const connection = new Connection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  });
  await connection.connect();
  try {
    const r = await connection.query('select version()', {
      objectRows: true,
    });
    return (
      (r.rows?.[0] as { version?: string } | undefined)?.version ?? 'unknown'
    );
  } finally {
    await connection.close();
  }
}

/**
 * GitHub's own heading-anchor rule: lowercase, drop everything that isn't
 * a word character/space/hyphen, spaces to hyphens - and when the same
 * slug repeats (this report has a "Sequential Execution" under both Simple
 * Query and Extended Query), later ones get "-1", "-2", ... appended. The
 * `seen` counter has to be fed every heading in document order for those
 * suffixes to line up with what GitHub itself will generate.
 */
function slugify(text: string, seen: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

/**
 * Builds the table of contents by reading back the headings of the
 * document that was just assembled, rather than from RESULT_GROUPS - so it
 * can't drift out of sync with what actually got rendered (a scenario with
 * no results is skipped above, and ungrouped scenarios are appended after
 * the groups). Fenced blocks are skipped so a "#" inside a mermaid chart
 * can never be mistaken for a heading.
 */
function renderIndex(markdown: string): string {
  const seen = new Map<string, number>();
  const entries: string[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3}) (.+)$/.exec(line);
    if (!m) continue;
    const text = m[2].trim();
    const indent = '  '.repeat(m[1].length - 2);
    entries.push(`${indent}- [${text}](#${slugify(text, seen)})`);
  }
  return ['## Contents', '', ...entries, ''].join('\n');
}

/**
 * The "Methodology" section, which is the same for every report.
 *
 * @returns The section, as markdown.
 */
/* Deliberately short. What a reader needs is how to read a table and
   where the comparison is not like-for-like; why the code does what it
   does belongs in the code, and the per-scenario specifics are already
   in each scenario's own description, which is rendered above its
   table. This used to run to 2600 words of exactly that duplication.

   Two things it no longer says, recorded here rather than there:
   Sequential Execution warms up for 800 iterations and takes 9 repeats
   rather than 3 because a single round trip is short enough that
   anything the machine does lands on it - verified at up to 2000 warmup
   iterations, where the ordering stopped moving. And `pg` 8.23's opt-in
   `pipeline: true` is not turned on for it, because no scenario here
   awaits each of a burst individually: Promise.all() already gives it
   the overlap that flag exists to provide. */
function renderMethodology(): string {
  return `## Methodology

These numbers come from \`benchmark/\` (\`npm run bench\`), comparing PostgreJS against \`pg\` (node-postgres) and \`postgres\` (postgres.js) against the same server, on the same machine, with the same workload. Each scenario is written once per library, using that library's own fastest calling convention - only the mechanism differs, never the work. [benchmark/README.md](./benchmark/README.md) says how to reproduce them.

Each \`(library, scenario)\` pair runs in a child process of its own, one at a time, three times over; the tables report the median of the three.

### Reading a table

Rows are in a fixed library order rather than fastest-first, so a library sits in the same place in every scenario. A **bolded** value is the best one *or tied with it* - the tie band is how far the leader's own repeats of that column moved, so nothing is called slower than the noise the leader itself shows.

What survives a re-run is the ordering, not the absolute numbers: the same scenario on the same machine, hours later, has been seen to move by 2x. Read a row against the rows beside it, and not against a table of another date.

### The columns

| Column | What it answers |
| --- | --- |
| \`GC (ms/op)\` | Time spent collecting, per call - how much garbage the library's own path makes. |
| \`Peak Heap (KB)\` | The most \`heapUsed + external\` ever stood above a forced-GC baseline during the run. Not what one call needs: it also holds whatever earlier calls left uncollected. \`external\` counts because the payload usually lives there - a \`Buffer\`, and a large string built from one, are both off-heap. |
| \`Retained (KB)\` | What is still held once the run ends. A working set, not a footprint: left idle, both this client's buffers and the others' pools fall back to nothing within seconds. |
| \`Net in/out (KB/op)\` | Bytes across the socket each way. Only on the four scenarios whose payload is the point - the two large fetches and the two Bulk Loads - since everywhere else it is small and identical across libraries. |

Memory figures are noisier than latency ones; read them as a direction rather than to their last digit. Under Bun, \`GC (ms/op)\` is blank: \`PerformanceObserver\` never reports a \`gc\` entry there. Peak Heap is unaffected.

### Where the comparison is not like-for-like

Deliberate, and worth knowing before reading a row:

- **Cursor streaming**: \`pg\` has no cursor API of its own, so its scenario emulates one with \`DECLARE\`/\`FETCH\`.
- **Bulk Load (binary COPY)** has one row: only this client can produce the format. Read it against Bulk Load (text COPY), where all three format the same CSV and the ranking is a ranking of drivers.
- **Row shape**: PostgreJS is set to \`objectRows: true\` everywhere so its rows match what the others return by default. The one normalisation in the suite.
- **Type decoding**: no custom parsers or overrides anywhere - each library decodes as it does out of the box, which is what a caller gets.
- **Pooling, pipelining and prepared statements**: each library uses its own mechanism and its own defaults. The numbers compare libraries as they ship, not one dial turned for all three.
- **One PostgreJS default is turned off**: \`asyncErrorHandling\`, which captures a caller-preserving async stack on every call so a failure points at the line that made it. \`pg\` and \`postgres.js\` have no equivalent, so leaving it on would charge one library for a feature the others do not offer. It stays on by default in the library; it is off only here, and it is worth about 0.5-1.0 KB a call on a small statement.
- **\`pg-native\`** is out of scope: it needs a system libpq and native compilation, which CI cannot assume. It could be added later behind its own flag.
- A scenario that needs more warmup or more repeats than the rest says so in its own description.
`;
}

function renderEnvironment(
  postgresVersion: string,
  libVersions: Record<string, string>,
  runtimeInfo: BenchResult['runtime'],
): string {
  const cpus = os.cpus();
  const totalMemGb = os.totalmem() / (1024 * 1024 * 1024);
  const runtimeLabel = runtimeInfo.name === 'bun' ? 'Bun' : 'Node.js';
  const lines = [
    `- Run date: ${new Date().toISOString()}`,
    `- Runtime: ${runtimeLabel} ${runtimeInfo.version}`,
    // platform/arch come from the worker process that actually produced
    // these results, not this report-generation process - the two only
    // ever differ if the report is regenerated on a different machine
    // than the one the benchmark ran on, but that's exactly the case
    // worth getting right rather than assuming "same machine".
    `- OS: ${os.type()} ${os.release()} (${runtimeInfo.platform}/${runtimeInfo.arch})`,
    `- CPU: ${cpus[0]?.model ?? 'unknown'} (${cpus.length} logical cores)`,
    `- RAM: ${totalMemGb.toFixed(1)} GB total`,
    `- PostgreSQL: ${postgresVersion}`,
    `- Library versions (installed, not this repo's semver range): ` +
      Object.entries(libVersions)
        .map(([lib, v]) => `${LIB_LABELS[lib] ?? lib} ${v}`)
        .join(', '),
  ];
  return `## Environment\n\n${lines.join('\n')}\n`;
}

// Amber/orange, versus mermaid's default blue - used only for the ops/sec
// chart, whose "better" direction is the opposite of every other chart
// here (higher is better, not lower), so it needs a visually distinct
// color rather than reading as just another same-colored bar chart.
const HIGHER_IS_BETTER_COLOR = '#f2a900';

// Mean latency and ops/sec are always available; GC/heap are only
// rendered when at least one library in this scenario actually has that
// data (older result files, or a run without --expose-gc for the heap
// figure specifically, won't).
//
// Order is [mean latency, ops/sec, GC, peak heap] - grouping "cost"
// charts (lower is better) next to throughput (higher is better, and a
// different color - see HIGHER_IS_BETTER_COLOR) rather than, say, both
// "cost" charts first; matters for the inline-block layout below since
// it decides which two charts end up sharing a row on a wide viewport.
//
// Each chart is its own fixed-width `<div style="display:inline-block">`
// (see cellStyle below), not a `<table>` row/cell grouping - measured
// live on github.com that GitHub renders every Mermaid diagram inside
// its own iframe (https://viewscreen.githubusercontent.com/markdown/
// mermaid), sized by whatever CONTAINER holds it, not by the diagram's
// own `xyChart` init width/height. A `<table>`'s 2-per-row grouping is
// fixed regardless of viewport width, which either wastes space (a
// narrow viewport squeezing 2 charts down small enough that GitHub's
// fixed-size pan/zoom overlay swallows a real fraction of each) or, sized
// for a narrow viewport instead, leaves a wide one with unused margin.
// inline-block avoids the tradeoff entirely: the browser already wraps a
// run of same-sized inline-block boxes onto a new line once the next one
// no longer fits the remaining width, with no media query needed - 2 per
// row wherever there's roughly 900px to work with, 1 per row on anything
// narrower (a phone, a PR's diff-view sidebar), from the fixed width
// alone.

function renderScenarioCharts(
  summaries: ScenarioLibSummary[],
  reportWireBytes?: boolean,
): string {
  const hasGc = summaries.some(s => s.medianGcDurationMs != null);
  const hasPeakHeap = summaries.some(s => s.medianPeakHeapGrowthBytes != null);
  const hasRetained = summaries.some(s => s.medianRetainedHeapBytes != null);
  const hasWire =
    !!reportWireBytes && summaries.some(s => s.medianWireRxBytes != null);
  const hasWireTx =
    !!reportWireBytes && summaries.some(s => s.medianWireTxBytes != null);
  const width = 600;
  const height = 300;

  const charts = [
    renderBarChart(summaries, {
      title: 'Mean latency (ms, lower is better)',
      unit: 'ms',
      width,
      height,
      valueOf: s => s.medianMean,
    }),
    renderBarChart(summaries, {
      title: 'Throughput (ops/sec, higher is better)',
      unit: 'ops/sec',
      width,
      height,
      valueOf: s => s.medianOpsPerSec,
      color: HIGHER_IS_BETTER_COLOR,
    }),
  ];
  if (hasGc) {
    charts.push(
      renderBarChart(summaries, {
        title: 'GC time (ms/op, lower is better)',
        unit: 'ms/op',
        width,
        height,
        valueOf: s =>
          s.medianGcDurationMs != null
            ? s.medianGcDurationMs / s.medianSamples
            : null,
      }),
    );
  }
  if (hasPeakHeap) {
    // Not a per-op figure like the other charts - it's the highest the
    // heap grew above its pre-run baseline at any point across the whole
    // run, so it isn't divided by sample count (that would shrink the
    // number for a library that simply completes more iterations, even
    // though the peak footprint it needs isn't really tied to how many of
    // them finished). Floored at 0 in worker.ts, so always non-negative -
    // and a library that could not be measured at all is left out of the
    // chart by renderBarChart() rather than drawn at zero.
    charts.push(
      renderBarChart(summaries, {
        title: 'Peak heap growth (KB, max memory reached)',
        unit: 'KB',
        width,
        height,
        valueOf: s =>
          s.medianPeakHeapGrowthBytes != null
            ? s.medianPeakHeapGrowthBytes / 1024
            : null,
      }),
    );
  }
  if (hasRetained) {
    // Not per-op either, and read against the peak above rather than on
    // its own: that one is the most the run ever needed, this is how much
    // of it was still held once it finished and everything collectable
    // had been collected.
    charts.push(
      renderBarChart(summaries, {
        title: 'Retained heap (KB, still held after the run)',
        unit: 'KB',
        width,
        height,
        valueOf: s =>
          s.medianRetainedHeapBytes != null
            ? s.medianRetainedHeapBytes / 1024
            : null,
      }),
    );
  }
  if (hasWire) {
    // Per operation, unlike the two above: every call pulls the same rows
    // down again, so total bytes scale with how many calls fit in the time
    // budget and only the per-call figure is comparable between libraries.
    charts.push(
      renderBarChart(summaries, {
        title: 'Network received (KB/op, lower is better)',
        unit: 'KB/op',
        width,
        height,
        valueOf: s =>
          s.medianWireRxBytes != null
            ? s.medianWireRxBytes / s.medianSamples / 1024
            : null,
      }),
    );
  }
  if (hasWireTx) {
    // The other direction, and the only one a scenario that writes has:
    // a COPY or a large parameter moves its bytes out, where the received
    // figure sees nothing at all.
    charts.push(
      renderBarChart(summaries, {
        title: 'Network sent (KB/op, lower is better)',
        unit: 'KB/op',
        width,
        height,
        valueOf: s =>
          s.medianWireTxBytes != null
            ? s.medianWireTxBytes / s.medianSamples / 1024
            : null,
      }),
    );
  }

  // `<div style="display:inline-block; width:430px">` per chart, NOT a
  // `<table>` - a table's row/cell grouping is a fixed 2-per-row commit
  // regardless of viewport, which is fine on a desktop-width GitHub blob
  // view but forces two ~215px-wide charts (each squeezed further by the
  // pan/zoom overlay) on a narrow/mobile one. inline-block needs no media
  // query for that: the browser already wraps a run of inline-block
  // boxes onto a new line on its own once the next one no longer fits the
  // remaining width, so a plain sequence of same-sized boxes gives 2 per
  // row wherever ~900px is available and falls back to 1 per row on a
  // narrower viewport, purely from each box's own fixed width.
  const cellStyle =
    'style="display:inline-block;width:430px;vertical-align:top;margin:4px;"';
  // Trailing newline matters: this is the last element renderScenarioTable()
  // joins with '\n', and that in turn is joined the same way against
  // whatever section (often another scenario's heading) follows it - one
  // more '\n' here is what turns that single line break into an actual
  // blank line, which a heading directly after a raw HTML block needs to
  // be recognized as a heading rather than swallowed into that block.
  // A chart with nothing measurable left in it renders as an empty string
  // (see renderBarChart) - wrapping that would leave a stray empty box.
  return (
    charts
      .filter(c => c)
      .map(c => `<div ${cellStyle}>\n\n${c}\n\n</div>`)
      .join('\n') + '\n'
  );
}

function renderScenarioTable(
  scenarioName: ScenarioName,
  summaries: ScenarioLibSummary[],
  headingLevel: '##' | '###' = '###',
): string {
  const meta = SCENARIOS[scenarioName];
  // Fixed order (see LIB_ORDER), not fastest-first - the row position is
  // deliberately not a verdict. `slowest` still comes from the values, so
  // the vs.-slowest column means the same thing it always did.
  //
  // Anything not in LIB_ORDER is dropped rather than rendered: the results
  // directory is a plain pile of JSON files that nothing prunes, so a lib
  // id that no longer exists in the code - a removed adapter, an
  // abandoned experiment - otherwise keeps showing up as a phantom row in
  // a published document long after its reason for existing is gone. It
  // would also sort to the top here, since indexOf() gives it -1.
  const sorted = summaries
    .filter(s => LIB_ORDER.includes(s.lib))
    .sort((a, b) => LIB_ORDER.indexOf(a.lib) - LIB_ORDER.indexOf(b.lib));
  const slowest = sorted.reduce(
    (worst, s) => (worst && worst.medianMean >= s.medianMean ? worst : s),
    sorted[0],
  );
  const params = sorted[0]?.runs[0]?.params ?? {};
  const paramsText = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  const rowData = sorted.map(s => {
    const mult =
      slowest && slowest.medianMean > 0 ? slowest.medianMean / s.medianMean : 1;
    // Per-op, not per-run totals, so libraries that complete more samples
    // in the same time budget aren't penalized for simply running more
    // iterations - divides each median total by that same run's median
    // sample count.
    const gcMsPerOp =
      s.medianGcDurationMs != null
        ? s.medianGcDurationMs / s.medianSamples
        : null;
    // Not per-op like gcMsPerOp above - this is the highest heap sample
    // seen during the whole run, so dividing by sample count wouldn't mean
    // anything (see renderScenarioCharts).
    const peakHeapKb =
      s.medianPeakHeapGrowthBytes != null
        ? s.medianPeakHeapGrowthBytes / 1024
        : null;
    // Per-op, like gcMsPerOp: each call re-fetches the same rows, so the
    // total only reflects how many calls fit in the time budget.
    const wireKbPerOp =
      meta.reportWireBytes && s.medianWireRxBytes != null
        ? s.medianWireRxBytes / s.medianSamples / 1024
        : null;
    const wireTxKbPerOp =
      meta.reportWireBytes && s.medianWireTxBytes != null
        ? s.medianWireTxBytes / s.medianSamples / 1024
        : null;
    // Read against the peak above rather than on its own: what the run
    // needed at its worst, and how much of that it never gave back.
    const retainedKb =
      s.medianRetainedHeapBytes != null
        ? s.medianRetainedHeapBytes / 1024
        : null;
    return {
      label: LIB_LABELS[s.lib] ?? s.lib,
      version: s.libraryVersion,
      // Kept on the row so the tie band can be derived from the leader's
      // own repeats rather than a hard-coded threshold.
      runs: s.runs,
      mean: s.medianMean,
      p75: s.medianP75,
      p99: s.medianP99,
      opsPerSec: s.medianOpsPerSec,
      mult,
      gcMsPerOp,
      peakHeapKb,
      retainedKb,
      wireKbPerOp,
      wireTxKbPerOp,
    };
  });

  // Bold the best value per column (lower is better for latency/GC/heap,
  // higher is better for ops/sec and the vs.-slowest multiplier) - only
  // meaningful when this scenario actually has more than one library to
  // compare, otherwise every value would trivially be "the best".
  //
  // "Best" is a band, not a single winner: everything statistically tied
  // with the leader is bolded too. Bolding a lone minimum claims a
  // precision this measurement does not have - several scenarios separate
  // the top libraries by about a percent, and repeating the same run can
  // reorder them. The band is taken from the data rather than picked: it
  // is how far the leader's own repeats of this very column spread, so a
  // rival is only called slower when it is further away than the leader
  // wobbles by itself between runs. TIE_FLOOR keeps a scenario whose three
  // repeats happened to land on nearly the same number from producing a
  // ~0 band and reinstating the lone-winner behaviour; TIE_CEILING stops
  // one stalled repeat from widening the band until everything in the
  // table counts as tied.
  const definedOrNull = (values: (number | null)[]): number | null => {
    const defined = values.filter((v): v is number => v != null);
    return defined.length ? Math.min(...defined) : null;
  };
  const shouldBold = rowData.length > 1;
  const bestMean = Math.min(...rowData.map(r => r.mean));
  const bestP75 = Math.min(...rowData.map(r => r.p75));
  const bestP99 = Math.min(...rowData.map(r => r.p99));
  const bestOpsPerSec = Math.max(...rowData.map(r => r.opsPerSec));
  const bestMult = Math.max(...rowData.map(r => r.mult));
  const bestGcMsPerOp = definedOrNull(rowData.map(r => r.gcMsPerOp));
  const bestPeakHeapKb = definedOrNull(rowData.map(r => r.peakHeapKb));
  const bestRetainedKb = definedOrNull(rowData.map(r => r.retainedKb));
  const bestWireKbPerOp = definedOrNull(rowData.map(r => r.wireKbPerOp));
  const bestWireTxKbPerOp = definedOrNull(rowData.map(r => r.wireTxKbPerOp));

  /** Spread of the leader's own repeats for one column, as an absolute
   * value - the run-to-run wobble a difference has to beat to be real. */
  const leaderSpread = (
    best: number,
    valueOf: (r: (typeof rowData)[number]) => number | null,
    runValueOf: (run: BenchResult) => number | null,
  ): number => {
    const leader = rowData.find(r => valueOf(r) === best);
    const values = (leader?.runs ?? [])
      .map(runValueOf)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const spread = values.length
      ? Math.max(...values) - Math.min(...values)
      : 0;
    return Math.min(
      Math.max(spread, Math.abs(best) * TIE_FLOOR),
      Math.abs(best) * TIE_CEILING,
    );
  };

  const meanBand = leaderSpread(
    bestMean,
    r => r.mean,
    run => run.stats.mean,
  );
  const p75Band = leaderSpread(
    bestP75,
    r => r.p75,
    run => run.stats.p75,
  );
  const p99Band = leaderSpread(
    bestP99,
    r => r.p99,
    run => run.stats.p99,
  );
  const opsBand = leaderSpread(
    bestOpsPerSec,
    r => r.opsPerSec,
    run => run.stats.opsPerSec,
  );
  const gcBand = leaderSpread(
    bestGcMsPerOp ?? NaN,
    r => r.gcMsPerOp,
    run =>
      run.stats.gcDurationMs != null && run.stats.samples
        ? run.stats.gcDurationMs / run.stats.samples
        : null,
  );
  const heapBand = leaderSpread(
    bestPeakHeapKb ?? NaN,
    r => r.peakHeapKb,
    run =>
      run.stats.peakHeapGrowthBytes != null
        ? run.stats.peakHeapGrowthBytes / 1024
        : null,
  );
  const retainedBand = leaderSpread(
    bestRetainedKb ?? NaN,
    r => r.retainedKb,
    run =>
      run.stats.retainedHeapBytes != null
        ? run.stats.retainedHeapBytes / 1024
        : null,
  );
  const wireBand = leaderSpread(
    bestWireKbPerOp ?? NaN,
    r => r.wireKbPerOp,
    run =>
      run.stats.wireRxBytes != null && run.stats.samples
        ? run.stats.wireRxBytes / run.stats.samples / 1024
        : null,
  );
  const wireTxBand = leaderSpread(
    bestWireTxKbPerOp ?? NaN,
    r => r.wireTxKbPerOp,
    run =>
      run.stats.wireTxBytes != null && run.stats.samples
        ? run.stats.wireTxBytes / run.stats.samples / 1024
        : null,
  );
  // vs.-slowest is a restatement of mean, so it ties exactly when mean
  // does rather than getting a band of its own.
  const multBand = bestMult - slowest.medianMean / (bestMean + meanBand);

  const boldIfBest = (
    formatted: string,
    value: number,
    best: number,
    band = 0,
  ) =>
    shouldBold && Math.abs(value - best) <= band + Number.EPSILON
      ? `***${formatted}***`
      : formatted;

  const rows = rowData.map(r => {
    const meanStr = boldIfBest(r.mean.toFixed(3), r.mean, bestMean, meanBand);
    const p75Str = boldIfBest(r.p75.toFixed(3), r.p75, bestP75, p75Band);
    const p99Str = boldIfBest(r.p99.toFixed(3), r.p99, bestP99, p99Band);
    const opsStr = boldIfBest(
      r.opsPerSec.toFixed(1),
      r.opsPerSec,
      bestOpsPerSec,
      opsBand,
    );
    const multStr = boldIfBest(
      `${r.mult.toFixed(2)}x`,
      r.mult,
      bestMult,
      multBand,
    );
    const gcStr =
      r.gcMsPerOp != null
        ? boldIfBest(
            r.gcMsPerOp.toFixed(4),
            r.gcMsPerOp,
            bestGcMsPerOp ?? NaN,
            gcBand,
          )
        : '—';
    const peakHeapStr =
      r.peakHeapKb != null
        ? boldIfBest(
            r.peakHeapKb.toFixed(2),
            r.peakHeapKb,
            bestPeakHeapKb ?? NaN,
            heapBand,
          )
        : '—';
    const retainedStr =
      r.retainedKb != null
        ? boldIfBest(
            r.retainedKb.toFixed(2),
            r.retainedKb,
            bestRetainedKb ?? NaN,
            retainedBand,
          )
        : '—';
    const wireCell = (
      value: number | null,
      best: number | null,
      band: number,
    ) =>
      meta.reportWireBytes
        ? ' ' +
          (value != null
            ? boldIfBest(value.toFixed(2), value, best ?? NaN, band)
            : '—') +
          ' |'
        : '';
    const wireStr =
      wireCell(r.wireKbPerOp, bestWireKbPerOp, wireBand) +
      wireCell(r.wireTxKbPerOp, bestWireTxKbPerOp, wireTxBand);
    return (
      `| ${r.label} (${r.version}) | ${meanStr} | ${p75Str} | ${p99Str} | ` +
      `${opsStr} | ${multStr} | ${gcStr} | ${peakHeapStr} | ${retainedStr} |${wireStr}`
    );
  });
  // Libs this scenario disclosed as unsupported (see ScenarioMeta.
  // unsupportedLibs) never ran at all - show the reason instead of a row
  // of dashes, rather than silently omitting the library.
  const unsupportedRows = Object.entries(meta.unsupportedLibs ?? {}).map(
    ([lib, reason]) => {
      const label = LIB_LABELS[lib] ?? lib;
      return (
        `| ${label} | ${reason} | — | — | — | — | — | — | — |` +
        (meta.reportWireBytes ? ' — | — |' : '')
      );
    },
  );

  return [
    `${headingLevel} ${meta.title}`,
    '',
    meta.description + (paramsText ? ` (${paramsText})` : ''),
    '',
    '| Library | Mean (ms) | p75 (ms) | p99 (ms) | ops/sec | vs. slowest | GC (ms/op) | Peak Heap (KB) | Retained (KB) |' +
      (meta.reportWireBytes ? ' Net in (KB/op) | Net out (KB/op) |' : ''),
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|' +
      (meta.reportWireBytes ? '---:|---:|' : ''),
    ...rows,
    ...unsupportedRows,
    '',
    renderScenarioCharts(summaries, meta.reportWireBytes),
  ].join('\n');
}

/** One installed-version string per lib actually present in `results`,
 * taken from what each result itself recorded at run time (rather than
 * re-reading node_modules now, which could disagree if a dependency was
 * bumped since the benchmark ran) - works uniformly for npm packages
 * (pg, postgres, postgrejs) and for Bun's runtime-bundled SQL client
 * (which has no installed npm version to read at all). */
function libVersionsFromResults(
  results: BenchResult[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of results) out[r.lib] ??= r.libraryVersion;
  return out;
}

/**
 * Renders one runtime's results into its own markdown file - `node` and
 * `bun` are never merged into a single report/table (see BenchRuntime's
 * doc comment): a Bun.sql-under-Bun number sits next to a pg/postgres/
 * postgrejs-under-Node number in the exact same table otherwise, silently
 * conflating a library difference with a runtime difference.
 *
 * @returns false if there were no results for this runtime (nothing
 * written), true otherwise.
 */
async function generateReport(
  runtime: BenchRuntime,
  resultsDir: string,
  outputPath: string,
  title: string,
  postgresVersion: string,
): Promise<boolean> {
  const results = readResults(resultsDir);
  if (results.length === 0) return false;

  const summaries = summarize(results);
  const byScenario = groupByScenario(summaries);
  const libVersions = libVersionsFromResults(results);

  const titleBlock = [
    `# ${title}`,
    '',
    '_Generated by `npm run bench:report`. Do not hand-edit — re-run the command instead._',
    '',
  ].join('\n');

  const sections: string[] = [
    titleBlock.trimEnd(),
    '',
    renderMethodology(),
    renderEnvironment(postgresVersion, libVersions, results[0].runtime),
  ];

  const grouped = new Set<ScenarioName>();
  for (const group of RESULT_GROUPS) {
    const tables: string[] = [];
    for (const scenarioName of group.scenarios) {
      grouped.add(scenarioName);
      const scenarioSummaries = byScenario.get(scenarioName);
      if (!scenarioSummaries || scenarioSummaries.length === 0) continue;
      tables.push(renderScenarioTable(scenarioName, scenarioSummaries));
    }
    if (tables.length === 0) continue;
    sections.push(`## ${group.title}`, '', group.description, '', ...tables);
  }

  // Any scenario not covered by RESULT_GROUPS still gets rendered, so a
  // newly added scenario never silently disappears from the report just
  // because nobody updated the grouping above yet.
  for (const scenarioName of SCENARIO_NAMES) {
    if (grouped.has(scenarioName)) continue;
    const scenarioSummaries = byScenario.get(scenarioName);
    if (!scenarioSummaries || scenarioSummaries.length === 0) continue;
    sections.push(renderScenarioTable(scenarioName, scenarioSummaries, '##'));
  }

  sections.push(
    '## Raw data',
    '',
    'Backing raw data for the numbers above lives in ' +
      `\`benchmark/results/${runtime}/*.json\` ` +
      `(gitignored; regenerate with \`npm run ${runtime === 'bun' ? 'bench:bun' : 'bench'}\`).`,
    '',
  );

  // The index is generated from the finished body, then spliced in right
  // after the title block - see renderIndex().
  const body = sections.join('\n');
  // body.slice() already starts with the newline that separated the title
  // block from the first section, so the index needs no trailing one.
  const output =
    titleBlock + '\n' + renderIndex(body) + body.slice(titleBlock.length);

  fs.writeFileSync(outputPath, output);
  console.log(`Wrote ${path.relative(REPO_ROOT, outputPath)}`);
  return true;
}

async function main(): Promise<void> {
  const postgresVersion = await getPostgresVersion();

  const wroteNode = await generateReport(
    'node',
    path.join(BENCHMARK_DIR, 'results', 'node'),
    path.join(REPO_ROOT, 'doc', 'BENCHMARKS.md'),
    'PostgreJS Benchmarks',
    postgresVersion,
  );
  const wroteBun = await generateReport(
    'bun',
    path.join(BENCHMARK_DIR, 'results', 'bun'),
    path.join(REPO_ROOT, 'doc', 'BENCHMARKS-bun.md'),
    'PostgreJS Benchmarks (Bun)',
    postgresVersion,
  );

  if (!wroteNode && !wroteBun) {
    console.error(
      'No results found in benchmark/results/{node,bun}/. Run `npm run bench` ' +
        'or `npm run bench:bun` first.',
    );
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
