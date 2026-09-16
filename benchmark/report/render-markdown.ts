import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Connection } from 'postgrejs';
import { getBenchDbConfig } from '../config.js';
import { SCENARIO_NAMES, SCENARIOS } from '../scenarios/index.js';
import type {
  BenchResult,
  BenchRuntime,
  LibId,
  ScenarioName,
} from '../types.js';
import {
  groupByScenario,
  readResults,
  type ScenarioLibSummary,
  summarize,
} from './aggregate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BENCHMARK_DIR, '..');

const LIB_LABELS: Record<string, string> = {
  postgrejs: 'PostgreJS',
  pg: 'pg (node-postgres)',
  postgres: 'postgres (postgres.js)',
  bun: 'Bun.sql',
};

// Short labels for the chart's x-axis only - the full "(node-postgres)"/
// "(postgres.js)" qualifiers from LIB_LABELS get clipped at this chart's
// width, and the table right above every chart already carries the full
// name plus installed version, so the qualifier isn't needed here again.
const CHART_LIB_LABELS: Record<string, string> = {
  postgrejs: 'PostgreJS',
  pg: 'pg',
  postgres: 'postgres',
  bun: 'Bun.sql',
};

// Fixed library order, used by both the charts and the tables: a library
// sits in the same position in every scenario, so a reader scanning down
// BENCHMARKS.md can compare it scenario-to-scenario without hunting for it
// in a ranking that reshuffles per scenario.
//
// The tables used to sort by mean instead, which quietly overstated what
// the measurement can resolve: ordering a 2.434 ms above a 2.458 ms reads
// as "this one won" when the two are a percent apart and a repeat of the
// same run can swap them. Several scenarios here are within that margin,
// and the differences that remain are visible in the numbers themselves -
// which are still printed in full - without the row order asserting a
// verdict on top of them. See renderScenarioTable()'s tie handling for the
// same reasoning applied to the bolding.
//
// `bun` only ever appears in the separate Bun report (see main()) - listed
// last here so it never displaces the other three's order if it's ever run
// alongside them.
const LIB_ORDER: LibId[] = ['postgrejs', 'pg', 'postgres', 'bun'];

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

function renderMethodology(): string {
  return `## Methodology

These numbers are produced by \`benchmark/\` (run via \`npm run bench\`), comparing PostgreJS against \`pg\` (node-postgres) and \`postgres\` (postgres.js) on the same server, the same machine, and the same workload. See [benchmark/README.md](./benchmark/README.md) for how to reproduce them.

Each scenario is implemented once per library, using that library's own idiomatic/fastest calling convention — not a shared lowest-common-denominator \`query(sql, params)\` call — while all three read the exact same SQL text, row counts, and concurrency/pool-size knobs from \`benchmark/scenarios/*.ts\`. Only the mechanism varies per library, not the workload.

Each \`(library, scenario)\` pair runs in its own child process, spawned sequentially (never in parallel), to avoid CPU/connection contention skewing numbers and to get clean, uncontaminated V8 JIT warm-up per run. The default matrix runs each pair \`--repeats=3\` times; the tables below report the **median across repeats**, with intra-run p75/p99 latency and ops/sec from tinybench's own sample statistics.\n\nRows are listed in a **fixed library order, not fastest-first**, and the bolding marks a band rather than a single winner. Sorting by mean would read as a verdict the measurement cannot support: several scenarios here separate the leading libraries by around one percent, and re-running the same pair can reorder them. A value is bolded when it is within the leader's own run-to-run spread for that column - how far the leader's repeats of that very number moved between runs - so a library is only shown as behind when the gap is larger than the noise the leader itself exhibits. The numbers are all printed in full, so a reader who wants a ranking can still read one off; what is deliberately absent is the table asserting one on their behalf. Where a genuine, repeatable difference exists it is usually not subtle - see Large Blob Fetch or Pooled Simple Query, which separate the libraries by 2x and more.

Each table also reports **GC (ms/op)** and **Peak Heap (KB)** - allocation pressure, not just wall-clock speed. GC (ms/op) is the total time spent in garbage collection during the run (observed via \`node:perf_hooks\`, every GC pause regardless of cause), divided by the number of timed samples - a proxy for how much garbage a library's own decode/encode path churns through per call, independent of how much of it survives. Peak Heap (KB) is different, and isn't a per-call figure: each worker process is started with \`--expose-gc\`, forces a clean GC immediately before the run to get a baseline \`heapUsed\`, then polls \`heapUsed\` throughout the run and keeps the highest single sample - the most the heap ever grew above that baseline at any point while running the whole scenario, not just what's left over once it's done (a call that allocates a large temporary buffer and frees it before finishing would show a real spike here while still showing near-zero long-term growth). Both include tinybench's own warmup iterations (it doesn't expose a hook at the boundary between warmup and the timed run), and memory measurements are inherently noisier than latency ones - GC timing isn't deterministic and V8's heap growth isn't perfectly linear, so treat these as directional, not to the same precision as the latency columns. (A median-of-samples "typical heap" figure was tried and dropped: for I/O-bound scenarios almost all of the polled samples land during idle network wait rather than the brief allocation burst, so the median collapsed to ~0 even on runs with a real, multi-hundred-KB peak - it doesn't have a reliable per-call interpretation the way Peak Heap does.)

**GC (ms/op) is unavailable under Bun** and shows as \`-\` in that report: \`PerformanceObserver({entryTypes: ['gc']})\` never fires a single \`'gc'\` entry there (confirmed directly - forcing heavy allocation plus an explicit \`global.gc()\`, which itself runs without error, still produces zero observed entries under \`bun\`, versus dozens under the identical script run with \`node\`), so it's reported as missing rather than a misleading 0. Peak Heap (KB) is unaffected - it comes from \`process.memoryUsage().heapUsed\`, which works the same on both runtimes.

Two scenarios - Large Blob Fetch and Large Array Fetch - additionally report **Network (KB/op)**: the bytes the server actually sent, per call, counted at the socket (\`Readable.push()\`, so all three libraries are measured identically rather than through any library's own accounting). It is reported only there because that is where it separates the libraries: PostgreJS reads those columns in the binary protocol while pg and postgres.js read them as text, and the same rows cost very different amounts on the wire in the two formats. A \`bytea\` costs exactly twice as much as text (\`\\x\`-prefixed hex, two characters per byte), while an \`int4[]\` depends entirely on the values - binary spends a fixed 8 bytes per element (4-byte length prefix + 4-byte value) where text spends one byte per digit, so full-width int4s favour binary and values near zero favour text. Everywhere else the payload is small and near-identical across libraries, so the number would be noise rather than information.

### Disclosed asymmetries

Some scenarios necessarily exercise each library differently. These are deliberate, not oversights:

1. **Pool concurrency** — each library's own top-level entry point is called N times at a fixed concurrency with pool max size held equal (\`pg.Pool\`'s explicit connect/release, postgres.js's implicit auto-pipelined pool, PostgreJS's \`Pool.execute()\`). postgres.js's automatic pipelining is measured as a real feature, not normalized away — and postgrejs is given the same ability, but it has to ask: pipelining is opt-in per call there (\`pipeline: true\`), not the default, so this scenario passes it. The reason it is opt-in is a real trade rather than caution: PostgreSQL runs a connection's statements one at a time, so sharing a connection speeds up bursts of short queries but lets one slow query delay whatever is queued behind it. pg has no equivalent and runs one query per connection throughout, which is most of why it trails here.
2. **Cursor streaming** — \`pg\` has no built-in cursor API; its scenario emulates one with raw \`DECLARE CURSOR\` / \`FETCH n\` / \`CLOSE\` SQL via \`client.query()\` (no \`pg-cursor\` dependency). This is an emulation, not \`pg\`'s native path.
3. **Prepared-statement reuse** — postgres.js auto-prepares/caches transparently, \`pg\` uses a named statement, PostgreJS uses explicit \`prepare()\`/\`execute()\`/\`close()\`. Same SQL text and iteration count across all three; the three different mechanisms are shown side by side rather than forced into one shape.
4. **Type decoding** — no custom type parsers/overrides for any library; each uses its own default config (e.g. \`pg\` returns \`int8\` as a string by default, postgres.js as \`BigInt\`). This is the fairest and most representative choice; differing default row shapes are an interpretation footnote, not something to fix.
5. **Row shape** — PostgreJS's \`objectRows\` option is explicitly set \`true\` in every scenario so its output shape (object rows) matches \`pg\`'s and postgres.js's defaults; otherwise postgrejs would gain an artificial edge from skipping key-mapping work the other two always do. This is the one deliberate normalization, called out as such.
6. **Transport** — all three connect via TCP to the same Postgres instance (no Unix-socket path is exercised).
7. **\`pg-native\` is out of scope for v1** — it requires a system libpq + native compilation, not guaranteed on CI/contributor machines. It can be added later behind an opt-in \`--lib=pg-native\` flag without ever being in the default matrix.
8. **\`pg\`'s wire pipelining** — \`pg\` 8.23+ added an opt-in \`pipeline: true\` client option (send multiple queries without waiting for each one's response before writing the next), off by default. Every \`*-concurrent\` scenario here fires N queries via \`Promise.all()\` without awaiting each individually - exactly the pattern this flag is for - so it's enabled for \`pg\`'s client here; leaving it off would benchmark its serialized fallback path instead of its real concurrent capability, understating it the same way testing PostgreJS/postgres.js without their own pipelining would. It's a no-op for every sequential (always-awaited-one-at-a-time) scenario.
9. **Sequential Execution and Concurrent Execution (Simple Query) run 9 repeats, not the usual 3** — a single round trip here costs well under half a millisecond, small enough that one cold first-run in a fresh child process (a page fault, a scheduling hiccup) can swing a 3-repeat median by ten percent or more in either direction, as happened while chasing this exact scenario down: three repeats alone flipped which library came out ahead from one invocation to the next. Nine repeats absorbs that without pretending the noise isn't there.
10. **Sequential Execution's warmup is 800 iterations, not the usual 50** — the actual root cause behind the point above: at 50 warmup iterations, PostgreJS's own call graph (more, smaller functions across more files than pg's more monolithic one) wasn't consistently reaching V8's fully-optimized tier before the timed window started, so some repeats measured a partially-JIT-warmed run and others didn't - the same code, genuinely different measured speed, not noise in the usual sense. Fully warming it first (verified with up to 2000 warmup iterations, where PostgreJS won every single repeat) removes that variable; 800 was the smallest budget that still did, applied to both libraries equally.
11. **Bulk Load (binary COPY) has one row** — pg and postgres.js cannot produce PostgreSQL's binary \`COPY\` format. Both can carry a payload the caller already encoded, so this is not a missing transport, but producing the format needs a binary encoder per type and neither driver has one. That is why the comparable scenario is Bulk Load (text COPY), where all three format the same CSV and the ranking is a ranking of drivers; the binary table shows what the format is worth on the same rows rather than claiming a race was run. A third-party package, \`pg-copy-streams-binary\`, brings encoders to pg and would make a two-row binary table possible - it is left out for the same reason \`pg-native\` is, being outside the driver rather than part of it. Column values also matter more here than anywhere else in this suite, and the scenario's own description carries that measurement: widest-form values put the two scenarios 10.3x apart, single-digit numbers 2.7x, on identical row counts.
12. **Unit of Work uses an API the others do not have** — PostgreJS runs the twenty statements through \`pipeline()\`, which closes them all with one \`Sync\`; pg and postgres.js fire them through \`Promise.all()\`. That is not a handicap imposed on them but their genuine best: both pipeline, so nothing waits on a previous reply, and neither can avoid a \`Sync\` per statement - pg sends one immediately after each Execute and postgres.js concatenates Execute and Sync into a single constant. postgres.js is given its tagged template rather than \`sql.unsafe()\`, which matters more than it looks: measured on this workload the tag is 3.5x faster for it (4.4ms against 15.5ms), so the \`$1\` form would have measured a path its own users have no reason to take.
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

/** GitHub renders ```mermaid fences natively, so a chart here is plain
 * committed text - no image files to generate/regenerate/gitignore.
 * Shared by the latency/throughput/GC/heap charts below - only the
 * title/unit/value-per-library, canvas width, and (for ops/sec) bar color
 * differ. */
function renderBarChart(
  summaries: ScenarioLibSummary[],
  opts: {
    title: string;
    unit: string;
    valueOf: (s: ScenarioLibSummary) => number;
    width?: number;
    height?: number;
    color?: string;
  },
): string {
  const byLib = new Map(summaries.map(s => [s.lib, s]));
  const ordered = LIB_ORDER.map(lib => byLib.get(lib)).filter(
    (s): s is ScenarioLibSummary => !!s,
  );
  const xAxis = ordered.map(s => CHART_LIB_LABELS[s.lib] ?? s.lib);
  const values = ordered.map(opts.valueOf);
  const bars = values.map(v => v.toFixed(4));
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
    `    x-axis [${xAxis.map(x => JSON.stringify(x)).join(', ')}]`,
    `    y-axis "${opts.unit}" ${yAxisMin} --> ${yAxisMax}`,
    `    bar [${bars.join(', ')}]`,
    '```',
  ].join('\n');
}

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
  const hasWire =
    !!reportWireBytes && summaries.some(s => s.medianWireRxBytes != null);
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
        valueOf: s => (s.medianGcDurationMs ?? 0) / s.medianSamples,
      }),
    );
  }
  if (hasPeakHeap) {
    // Not a per-op figure like the other charts - it's the highest the
    // heap grew above its pre-run baseline at any point across the whole
    // run, so it isn't divided by sample count (that would shrink the
    // number for a library that simply completes more iterations, even
    // though the peak footprint it needs isn't really tied to how many of
    // them finished). Floored at 0 in worker.ts, so always non-negative.
    charts.push(
      renderBarChart(summaries, {
        title: 'Peak heap growth (KB, max memory reached)',
        unit: 'KB',
        width,
        height,
        valueOf: s => (s.medianPeakHeapGrowthBytes ?? 0) / 1024,
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
        valueOf: s => (s.medianWireRxBytes ?? 0) / s.medianSamples / 1024,
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
  return (
    charts.map(c => `<div ${cellStyle}>\n\n${c}\n\n</div>`).join('\n') + '\n'
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
      wireKbPerOp,
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
  const bestWireKbPerOp = definedOrNull(rowData.map(r => r.wireKbPerOp));

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
  const wireBand = leaderSpread(
    bestWireKbPerOp ?? NaN,
    r => r.wireKbPerOp,
    run =>
      run.stats.wireRxBytes != null && run.stats.samples
        ? run.stats.wireRxBytes / run.stats.samples / 1024
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
    const wireStr =
      r.wireKbPerOp != null
        ? ' ' +
          boldIfBest(
            r.wireKbPerOp.toFixed(2),
            r.wireKbPerOp,
            bestWireKbPerOp ?? NaN,
            wireBand,
          ) +
          ' |'
        : '';
    return (
      `| ${r.label} (${r.version}) | ${meanStr} | ${p75Str} | ${p99Str} | ` +
      `${opsStr} | ${multStr} | ${gcStr} | ${peakHeapStr} |${wireStr}`
    );
  });
  // Libs this scenario disclosed as unsupported (see ScenarioMeta.
  // unsupportedLibs) never ran at all - show the reason instead of a row
  // of dashes, rather than silently omitting the library.
  const unsupportedRows = Object.entries(meta.unsupportedLibs ?? {}).map(
    ([lib, reason]) => {
      const label = LIB_LABELS[lib] ?? lib;
      return (
        `| ${label} | ${reason} | — | — | — | — | — | — |` +
        (meta.reportWireBytes ? ' — |' : '')
      );
    },
  );

  return [
    `${headingLevel} ${meta.title}`,
    '',
    meta.description + (paramsText ? ` (${paramsText})` : ''),
    '',
    '| Library | Mean (ms) | p75 (ms) | p99 (ms) | ops/sec | vs. slowest | GC (ms/op) | Peak Heap (KB) |' +
      (meta.reportWireBytes ? ' Network (KB/op) |' : ''),
    '|---|---:|---:|---:|---:|---:|---:|---:|' +
      (meta.reportWireBytes ? '---:|' : ''),
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
