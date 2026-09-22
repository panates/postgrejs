/**
 * The first value inside `v` that is neither an array nor null - what an
 * array's element type is read from. A scalar answers itself, and an
 * array with nothing but nulls (or nothing at all) answers `undefined`.
 *
 * Reading `v[0]` instead is wrong twice over: `[[1, 2], [3, 4]]` asks
 * what type `[1, 2]` is, and `[null, 2, 3]` asks what type `null` is.
 * Neither has an answer, and both are ordinary values to send.
 */
export function arrayLeaf(v: any): any {
  if (!Array.isArray(v)) return v;
  const l = v.length;
  let i: number;
  let x: any;
  for (i = 0; i < l; i++) {
    x = arrayLeaf(v[i]);
    if (x != null) return x;
  }
  return undefined;
}
