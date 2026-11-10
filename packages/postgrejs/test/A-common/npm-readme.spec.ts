import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'expect';
import { toNpmReadme } from '../../../../support/npm-readme.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

describe('npm README', () => {
  it('should drop the dark-theme links and unmark the light ones', () => {
    const github =
      '<a href="https://x.test/a#gh-light-mode-only"><img src="a-light.svg" alt="A"></a>' +
      '<a href="https://x.test/a#gh-dark-mode-only"><img src="a-dark.svg" alt="A"></a><br>\n' +
      '<a href="https://x.test/b"><img src="b.svg" alt="B"></a>';
    expect(toNpmReadme(github)).toStrictEqual(
      '<a href="https://x.test/a"><img src="a-light.svg" alt="A"></a><br>\n' +
        '<a href="https://x.test/b"><img src="b.svg" alt="B"></a>',
    );
  });

  it('should leave one light link per integration card in the real README', () => {
    const npm = toNpmReadme(readFileSync(path.join(root, 'README.md'), 'utf8'));
    const logos = [
      ...npm.matchAll(
        /<a href="https:\/\/www\.postgrejs\.com\/docs\/integrations\/([a-z]+)"><img src="([^"]+)"/g,
      ),
    ];
    expect(logos.map(m => m[1])).toStrictEqual([
      'sqb',
      'joist',
      'kysely',
      'drizzle',
      'typeorm',
      'prisma',
    ]);
    for (const [, , src] of logos) expect(src).not.toMatch(/-dark\./);
    expect(npm).not.toMatch(/href="[^"]*#gh-(dark|light)-mode-only"/);
  });
});
