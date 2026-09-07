import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { AnyParseFunction } from '../types.js';

export function parseRow(
  parsers: AnyParseFunction[],
  data: Buffer,
  columnCount: number,
  options: DataMappingOptions,
): any[] {
  const row = new Array(columnCount);
  let offset = 0;
  let len: number;
  let i: number;
  for (i = 0; i < columnCount; i++) {
    // The length of the column value, in bytes (this count does not
    // include itself). Can be zero. As a special case, -1 indicates a
    // NULL column value - no value bytes follow in that case.
    len = data.readInt32BE(offset);
    offset += 4;
    if (len < 0) {
      row[i] = null;
    } else {
      // None of the parsers use `this`, so a direct call avoids .call()'s
      // extra indirection (measured ~5.7x slower than invoking directly).
      row[i] = parsers[i](data, offset, len, options);
      offset += len;
    }
  }
  return row;
}

export function parseObjectRow(
  parsers: AnyParseFunction[],
  data: Buffer,
  columnCount: number,
  options: DataMappingOptions,
  fields: FieldInfo[],
): object {
  const row = {};
  let offset = 0;
  let len: number;
  let i: number;
  let value: any;
  for (i = 0; i < columnCount; i++) {
    // The length of the column value, in bytes (this count does not
    // include itself). Can be zero. As a special case, -1 indicates a
    // NULL column value - no value bytes follow in that case.
    len = data.readInt32BE(offset);
    offset += 4;
    if (len < 0) {
      value = null;
    } else {
      // None of the parsers use `this`, so a direct call avoids .call()'s
      // extra indirection (measured ~5.7x slower than invoking directly).
      value = parsers[i](data, offset, len, options);
      offset += len;
    }
    const name = fields[i].fieldName;
    if (name === '__proto__') {
      // `value`, not row[i] - nothing is ever assigned by numeric index
      // here (row is a plain object keyed by field name), so reading row[i]
      // handed defineProperty an undefined and silently dropped the
      // column's actual value.
      Object.defineProperty(row, name, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      row[name] = value;
    }
  }
  return row;
}
