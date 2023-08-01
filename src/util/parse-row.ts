import { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { AnyParseFunction } from '../types.js';

export function parseRow(parsers: AnyParseFunction[], row: any[], options: DataMappingOptions): void {
  const l = row.length;
  let i: number;
  for (i = 0; i < l; i++) {
    row[i] = row[i] == null ? null : parsers[i].call(undefined, row[i], options);
  }
}
