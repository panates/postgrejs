import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Resolves the *installed* version of a dependency (not this repo's semver
 * range for it) by walking up from its resolved entry file to the nearest
 * package.json whose "name" matches. Avoids relying on a package's "exports"
 * map allowing "./package.json" (postgres.js's does not).
 */
export function readInstalledVersion(packageName: string): string {
  const entry = require.resolve(packageName);
  let dir = path.dirname(entry);
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === packageName && pkg.version) return pkg.version;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not resolve installed version of "${packageName}"`);
}

/** PostgreJS is this repo itself, so its "installed version" is its own package.json */
export function readOwnPackageVersion(): string {
  const pkgPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../package.json',
  );
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    version: string;
  };
  return pkg.version;
}
