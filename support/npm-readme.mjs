#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Turns the README written for GitHub into the one npm shows.
 *
 * The README draws each logo twice, as a link ending in `#gh-light-mode-only`
 * and one ending in `#gh-dark-mode-only`, and GitHub hides whichever does not
 * match its theme. npm has no such rule and always renders on a light page,
 * so this drops every `#gh-dark-mode-only` link and takes the
 * `#gh-light-mode-only` marker off the links that stay.
 *
 * @param markdown The README as written for GitHub.
 * @returns The README for npm.
 */
/* A regular expression rather than an HTML parser: the links it removes are
   written by hand in one shape, `<a href="...#gh-dark-mode-only">...</a>`,
   with no nested anchor, and the build should not need a parser for that. */
export function toNpmReadme(markdown) {
  return markdown
    .replace(/<a\s[^>]*href="[^"]*#gh-dark-mode-only"[^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/#gh-light-mode-only"/g, '"');
}

/* Run as a script: rewrite the file named on the command line in place. The
   build's last step calls it on build/README.md, after the preset copied the
   README there - see the [postgrejs] block in .rmanrc.yml. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: npm-readme.mjs <README.md>');
    process.exit(1);
  }
  writeFileSync(file, toNpmReadme(readFileSync(file, 'utf8')));
}
