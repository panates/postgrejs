import type { ScenarioMeta } from '../../types.js';

export const PREPARED_STATEMENT_REUSE_CONCURRENT_CONCURRENCY = 50;

export const PREPARED_STATEMENT_REUSE_CONCURRENT_SCENARIO: ScenarioMeta = {
  name: 'prepared-statement-reuse-concurrent',
  title: 'Prepared Statement Reuse (Concurrent)',
  description:
    'The concurrent counterpart to Sequential above: prepare once, then ' +
    `fire ${PREPARED_STATEMENT_REUSE_CONCURRENT_CONCURRENCY} executions ` +
    'of that same reused statement on the SAME already-open connection ' +
    'without awaiting each one individually, then await them all via ' +
    "Promise.all() - using each library's own prepared-statement " +
    'mechanism (postgres.js auto-prepares, pg uses a named statement, ' +
    'PostgreJS uses explicit prepare()/execute()/close()). Excludes ' +
    'int8: pg/postgres.js/PostgreJS return it as genuinely different JS ' +
    'types by default (string/BigInt/number-or-BigInt), so timing it ' +
    'would measure type-conversion choice, not reuse cost',
  // Raised for the same reason as the Sequential variant's (see its own
  // comment) - one iteration is short here, but the run-to-run spread on
  // this machine class is wide enough that 20 samples still moved the
  // reported mean by more than the differences being measured.
  bench: {
    time: 2000,
    iterations: 60,
    warmupTime: 300,
    warmupIterations: 10,
  },
};
