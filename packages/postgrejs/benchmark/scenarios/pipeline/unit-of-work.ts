import type { ScenarioMeta } from '../../types.js';

/**
 * Statements in one unit of work. Deliberately not the 50 the *-concurrent
 * scenarios fire: those are a burst of the same query, this is the handful
 * of different reads and writes one request typically performs, where
 * five to thirty is the realistic range.
 */
export const UNIT_OF_WORK_STATEMENTS = 20;

/** Rows seeded into bench.unit_of_work, enough for the ids below. */
export const UNIT_OF_WORK_ROWS = 100;

/**
 * The statements every library runs, in order: ten writes, five reads,
 * five more writes.
 *
 * Every one is idempotent - `set a = $1`, never `a = a + $1` - so a
 * scenario that runs hundreds of iterations against the same table leaves
 * it in the state it started in, and no iteration is measured against data
 * a previous one grew.
 */
/**
 * The parameters of each statement, kept apart from the SQL text so that a
 * library whose fastest path builds statements differently still runs the
 * identical workload.
 *
 * postgres.js is the reason this is split out: its tagged template is not
 * sugar over `sql.unsafe()` but a different path, and measured on this
 * very workload it is 3.5x faster (4.4ms against 15.5ms for the same
 * twenty statements). Handing it the `$1` form would have measured a path
 * its users have no reason to take.
 */
export const UNIT_OF_WORK_SET_A = Array.from({ length: 10 }, (_, i) => ({
  a: i,
  id: i + 1,
}));
export const UNIT_OF_WORK_READS = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
}));
export const UNIT_OF_WORK_SET_B = Array.from({ length: 5 }, (_, i) => ({
  b: 'b' + i,
  id: i + 20,
}));

/** The same statements in `$1` form, for the libraries that take that. */
export function unitOfWorkStatements(
  schema: string,
): { sql: string; params: any[] }[] {
  const t = `${schema}.unit_of_work`;
  return [
    ...UNIT_OF_WORK_SET_A.map(x => ({
      sql: `update ${t} set a = $1 where id = $2`,
      params: [x.a, x.id],
    })),
    ...UNIT_OF_WORK_READS.map(x => ({
      sql: `select id, a, b from ${t} where id = $1`,
      params: [x.id],
    })),
    ...UNIT_OF_WORK_SET_B.map(x => ({
      sql: `update ${t} set b = $1 where id = $2`,
      params: [x.b, x.id],
    })),
  ];
}

export const UNIT_OF_WORK_SCENARIO: ScenarioMeta = {
  name: 'unit-of-work',
  title: 'Unit of Work',
  description: `Runs ${UNIT_OF_WORK_STATEMENTS} different statements - ten writes, five
reads, then five more writes - as one unit, the shape a single request
usually has. Unlike the Concurrent Execution scenarios, which fire the same
query many times, every statement here is different, so none of them can
share a parsed plan with another.

Each library uses the fastest path it has for this. pg and postgres.js fire
the statements through \`Promise.all()\` without awaiting between them, which
is genuinely their best: both pipeline, so the statements travel without
waiting for each other's replies. postgres.js builds them from its tagged
template rather than \`sql.unsafe()\` - on this workload that is 3.5x faster
for it (4.4ms against 15.5ms), so the \`$1\` form would have measured a path
its users have no reason to take. PostgreJS uses \`pipeline()\`, which goes
one step further and closes all twenty with a single \`Sync\` instead of one
each.

That last step is what the scenario is really measuring, and it is not a
configuration difference: a \`Sync\` per statement makes the server finish an
implicit transaction and answer ReadyForQuery every time, and neither other
driver can avoid it - pg sends one immediately after each Execute, and
postgres.js concatenates Execute and Sync into a single constant, so the
two cannot come apart. Compare against Concurrent Execution (Extended
Query) above to see the same libraries running the same number of calls
when the statements are identical rather than different.`,
  bench: {
    // Nine repeats for the same reason Sequential Execution uses them: a
    // unit of work costs single-digit milliseconds, small enough that one
    // cold run in a fresh child process can move a 3-repeat median more
    // than the effect being measured.
    time: 1500,
    iterations: 100,
    warmupTime: 300,
    warmupIterations: 100,
  },
};
