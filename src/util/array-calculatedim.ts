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
