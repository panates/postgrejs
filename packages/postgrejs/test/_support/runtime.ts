/* Prints which runtime mocha is actually on, so a CI log answers that question by itself.
   `bunx mocha` without `--bun` runs mocha under Node - `bunx` honours the
   `#!/usr/bin/env node` shebang - and for that reason the Bun job had never run on Bun.
   With EXPECT_BUN set, a run that did not start on Bun fails here instead of passing on
   Node. */
import process from 'node:process';

const bun = process.versions.bun;
console.log(
  bun ? `Runtime: Bun ${bun}` : `Runtime: Node ${process.versions.node}`,
);
if (process.env.EXPECT_BUN && !bun) {
  throw new Error(
    'EXPECT_BUN is set but the tests are running on Node ' +
      process.versions.node +
      ' (did `bunx` run without `--bun`?)',
  );
}
