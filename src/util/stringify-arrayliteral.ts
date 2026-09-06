import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { EncodeTextFunction } from '../types.js';
import { arrayCalculateDim } from './array-calculatedim.js';

export function stringifyArrayLiteral(
  value: any[],
  options?: DataMappingOptions,
  encode?: EncodeTextFunction,
): string {
  const dim = arrayCalculateDim(value);
  // `dim` is built once above and never mutated, so its last index is
  // invariant across the whole recursion - not just this loop. Reading
  // dim.length (a property load) and subtracting on every element of every
  // level was the only per-element work here that didn't depend on the
  // element.
  const lastLevel = dim.length - 1;
  const writeDim = (arr: any[], level: number) => {
    const elemCount = dim[level];
    const out: string[] = [];
    const isLeafLevel = level >= lastLevel;
    for (let i = 0; i < elemCount; i++) {
      let x = arr && arr[i];
      if (!isLeafLevel) {
        if (x != null && !Array.isArray(x)) x = [x];
        out.push(writeDim(x, level + 1));
        continue;
      }
      // if value is null
      if (x == null) {
        out.push('NULL');
        continue;
      }
      /* c8 ignore start - dim is (re)computed above from a DFS that visits
         every array node in `value` and deepens dim to match, so a value
         can never actually be an array once `level` reaches the leaf -
         if it were, dim would already have gone one level deeper there. */
      if (Array.isArray(x)) {
        out.push(stringifyArrayLiteral(x, options, encode));
        continue;
      }
      /* c8 ignore stop */
      if (encode) x = encode(x, options || {});
      out.push(escapeArrayItem('' + x));
    }
    return '{' + out.join(',') + '}';
  };
  return writeDim(value, 0);
}

function escapeArrayItem(str: string): string {
  return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
