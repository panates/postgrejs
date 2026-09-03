import type { FieldInfo } from '../interfaces/field-info.js';

export function convertRowToObject(fields: FieldInfo[], row: any[]): any {
  const out: Record<string, unknown> = {};
  const l = row.length;
  let i;
  for (i = 0; i < l; i++) {
    // A column literally named "__proto__" (e.g. via a dynamic column
    // alias) must not reassign out's prototype - defineProperty always
    // creates a genuine own property, unlike bracket assignment.
    Object.defineProperty(out, fields[i].fieldName, {
      value: row[i],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return out;
}
