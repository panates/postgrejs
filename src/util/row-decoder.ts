import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { AnyParseFunction } from '../types.js';
import { parseObjectRow, parseRow } from './parse-row.js';

/**
 * Extension point for turning one row's raw wire data into whatever shape a
 * caller wants. `data` is the row's own zero-copy buffer view and
 * `columnCount`/`parsers` are exactly what `parseRow`/`parseObjectRow` take -
 * a subclass is free to defer decoding individual columns (e.g. lazily, on
 * first access) instead of eagerly decoding the whole row up front.
 *
 * Contract: `data` is never written to or reused by PostgreJS once `decode()`
 * is called with it - it's safe to retain a reference to it (or a
 * `Buffer.subarray()` of it) for as long as you want, e.g. to defer decoding
 * a column until it's actually read. The only cost of doing so is memory:
 * `data` is itself a zero-copy view into the socket's own read buffer (up to
 * ~64KB), so holding onto even one row's `data` keeps that whole chunk (and
 * every other row's bytes in it) alive until released.
 */
export abstract class RowDecoder {
  abstract decode(
    parsers: AnyParseFunction[],
    data: Buffer,
    columnCount: number,
    options: DataMappingOptions,
    fields: FieldInfo[],
  ): any;
}

export class ArrayRowDecoder extends RowDecoder {
  decode(
    parsers: AnyParseFunction[],
    data: Buffer,
    columnCount: number,
    options: DataMappingOptions,
  ): any[] {
    return parseRow(parsers, data, columnCount, options);
  }
}

export class ObjectRowDecoder extends RowDecoder {
  decode(
    parsers: AnyParseFunction[],
    data: Buffer,
    columnCount: number,
    options: DataMappingOptions,
    fields: FieldInfo[],
  ): object {
    return parseObjectRow(parsers, data, columnCount, options, fields);
  }
}

export const DEFAULT_ARRAY_ROW_DECODER = new ArrayRowDecoder();
export const DEFAULT_OBJECT_ROW_DECODER = new ObjectRowDecoder();

interface RowDecoderOptions {
  rowDecoder?: 'array' | 'object' | RowDecoder;
  objectRows?: boolean;
}

/**
 * Collapses the `rowDecoder`/`objectRows` query options into one RowDecoder
 * instance - the single place this union gets resolved, so every call site
 * (queryOnce/executeReused/the simple-query path/Cursor) applies the same
 * precedence: an explicit `rowDecoder` wins over the deprecated `objectRows`
 * boolean.
 */
export function resolveRowDecoder(options: RowDecoderOptions): RowDecoder {
  const { rowDecoder } = options;
  if (rowDecoder instanceof RowDecoder) return rowDecoder;
  if (rowDecoder === 'object') return DEFAULT_OBJECT_ROW_DECODER;
  if (rowDecoder === 'array') return DEFAULT_ARRAY_ROW_DECODER;
  return options.objectRows
    ? DEFAULT_OBJECT_ROW_DECODER
    : DEFAULT_ARRAY_ROW_DECODER;
}

/**
 * The `rowType` string surfaced on `QueryResult`/`Cursor.rowType`. `'custom'`
 * when the caller supplied their own RowDecoder subclass - there's no way to
 * know what shape it returns - otherwise the same `'array' | 'object'` this
 * option has always reported.
 */
export function resolveRowType(
  options: RowDecoderOptions,
): 'array' | 'object' | 'custom' {
  const decoder = resolveRowDecoder(options);
  if (decoder instanceof ObjectRowDecoder) return 'object';
  if (decoder instanceof ArrayRowDecoder) return 'array';
  return 'custom';
}
