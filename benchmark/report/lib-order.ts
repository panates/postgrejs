import type { LibId } from '../types.js';

// Short labels for the chart's x-axis only - the full "(node-postgres)"/
// "(postgres.js)" qualifiers from LIB_LABELS get clipped at this chart's
// width, and the table right above every chart already carries the full
// name plus installed version, so the qualifier isn't needed here again.
export const CHART_LIB_LABELS: Record<string, string> = {
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
export const LIB_ORDER: LibId[] = ['postgrejs', 'pg', 'postgres', 'bun'];
