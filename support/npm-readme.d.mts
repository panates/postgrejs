/**
 * Turns the README written for GitHub into the one npm shows: drops every
 * `#gh-dark-mode-only` link and takes the `#gh-light-mode-only` marker off the
 * links that stay.
 *
 * @param markdown The README as written for GitHub.
 * @returns The README for npm.
 */
export function toNpmReadme(markdown: string): string;
