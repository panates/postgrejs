import { FieldInfo } from '../interfaces/field-info.js';

export function convertRowToObject(fields: FieldInfo[], row: any[]): any {
  const out: Record<string, unknown> = {};
  const l = row.length;
  let i;
  for (i = 0; i < l; i++) {
    out[fields[i].fieldName] = row[i];
  }
  return out;
}
