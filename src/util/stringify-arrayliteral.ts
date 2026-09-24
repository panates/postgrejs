import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { EncodeTextFunction } from '../types.js';
import { arrayCalculateDim } from './array-calculatedim.js';

/**
 * What a number's own text looks like: digits, one optional dot, an
 * optional exponent, an optional leading minus. Nothing in it is special
 * to the array literal grammar and it cannot be read as `NULL`, so an
 * element that matches goes out bare - `{1,2}` rather than `{"1","2"}`,
 * which is what the server itself prints and what every other client
 * writes.
 *
 * Deliberately narrower than "has no special characters": it is applied
 * only to what a JS number or bigint encoded to, and matching it is the
 * evidence that the encoder really did produce a number's text. `NaN`
 * and `Infinity` fail it and stay quoted (both forms parse the same, so
 * this costs nothing), and so does anything an unexpected encoder made
 * of a number - a date type handed a timestamp, say.
 */
const BARE_NUMBER = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

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
  const writeDim = (arr: any[], level: number): string => {
    const elemCount = dim[level];
    const isLeafLevel = level >= lastLevel;
    // Concatenated rather than collected and joined: V8 builds a rope
    // and flattens it once, where an array of one string per element is
    // a second allocation per element before the join sees any of them.
    let out = '{';
    for (let i = 0; i < elemCount; i++) {
      if (i) out += ',';
      let x = arr && arr[i];
      if (!isLeafLevel) {
        if (x != null && !Array.isArray(x)) x = [x];
        out += writeDim(x, level + 1);
        continue;
      }
      // if value is null
      if (x == null) {
        out += 'NULL';
        continue;
      }
      /* c8 ignore start - dim is (re)computed above from a DFS that visits
         every array node in `value` and deepens dim to match, so a value
         can never actually be an array once `level` reaches the leaf -
         if it were, dim would already have gone one level deeper there. */
      if (Array.isArray(x)) {
        out += stringifyArrayLiteral(x, options, encode);
        continue;
      }
      /* c8 ignore stop */
      // Asked before the encoder runs, so the test below is only ever
      // applied to a value that really was a number.
      const isNumber = typeof x === 'number' || typeof x === 'bigint';
      if (encode) x = encode(x, options || {});
      const s = '' + x;
      out += isNumber && BARE_NUMBER.test(s) ? s : escapeArrayItem(s);
    }
    return out + '}';
  };
  return writeDim(value, 0);
}

/**
 * Backslash and double quote are the only two characters the literal
 * grammar gives meaning to inside a quoted element, and neither is in
 * most values - so they are looked for before anything is rewritten. The
 * two `replace()` calls each walk the string and build another one even
 * when they change nothing, which for a column of ordinary text was
 * half the cost of writing the literal.
 */
function escapeArrayItem(str: string): string {
  return str.indexOf('\\') < 0 && str.indexOf('"') < 0
    ? '"' + str + '"'
    : '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
