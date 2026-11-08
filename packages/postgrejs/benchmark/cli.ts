import process from 'node:process';
import { hideBin } from 'yargs/helpers';
import { parseCliArgs } from './cli-args.js';
import { runMatrix } from './runner/orchestrator.js';

async function main(): Promise<void> {
  const parsed = await parseCliArgs(hideBin(process.argv));
  if (parsed.kind === 'output') {
    console.log(parsed.output);
    return;
  }
  const { libs, scenarios, repeats } = parsed.options;

  console.log(
    `Benchmark matrix: scenarios=[${scenarios.join(', ')}] ` +
      `libs=[${libs.join(', ')}] repeats=${repeats}`,
  );
  await runMatrix({ libs, scenarios, repeats });
  console.log(
    '\nDone. Run `pnpm run bench:report` to regenerate BENCHMARKS.md.',
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
