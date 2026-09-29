/**
 * The dimensions of a nested array, each level sized to its longest row.
 *
 * PostgreSQL arrays are rectangular: every row of a level has the same
 * length. A ragged JavaScript array is squared off against these numbers
 * by the writers, with the missing elements written as NULL.
 *
 * @param arr The array to measure.
 * @returns One length per level; `[0]` for an empty array.
 */
export function arrayCalculateDim(arr: any[]): number[] {
  if (!arr || arr.length === 0) return [0];
  const dim = [arr.length];
  const iterate = (a: any[], level: number): void => {
    let i: number;
    const l = a.length;
    for (i = 0; i < l; i++) {
      if (Array.isArray(a[i])) {
        dim[level] = Math.max(dim[level] || 0, a[i].length);
        iterate(a[i], level + 1);
      }
    }
  };
  iterate(arr, 1);
  return dim;
}
