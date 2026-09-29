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
  /**
   * What `QueryResult.rowType`/`Cursor.rowType` reports for rows this
   * decoder produced - a promise to the caller about their shape, so it
   * is the decoder's to make. `'custom'` here is the honest answer for
   * a decoder nobody else knows anything about; the two built-ins name
   * their own shape, and a subclass of one that still produces that
   * shape inherits the right answer without doing anything.
   *
   * Set it when a subclass changes the shape - a decoder that hands
   * back a lazy view rather than a plain array is not an `'array'`, and
   * a caller that indexes it because the result said so would be
   * reading the wrong thing.
   */
  readonly rowType: 'array' | 'object' | 'custom' = 'custom';

  abstract decode(
    parsers: AnyParseFunction[],
    data: Buffer,
    columnCount: number,
    options: DataMappingOptions,
    fields: FieldInfo[],
  ): any;

  /**
   * The same, reading the row where it already is: `buffer` is the
   * socket's own read buffer and the row's values run for `len` bytes
   * from `offset`.
   *
   * Optional, and what a decoder implements when it has no use for a
   * `Buffer` of its own - which is every decoder that reads its values
   * and does not keep them. Implementing it means no view is built for
   * the row at all; a decoder that only implements `decode()` still gets
   * one, exactly as before.
   */
  decodeAt?(
    parsers: AnyParseFunction[],
    buffer: Buffer,
    offset: number,
    len: number,
    columnCount: number,
    options: DataMappingOptions,
    fields: FieldInfo[],
  ): any;
}

/** Reads each row into an array of values, in column order. */
/**
 * A row's bytes as a `Buffer` of their own.
 *
 * For the paths that set a row aside and read it later, and for a
 * caller's decoder that only implements `decode()`.
 *
 * @param msg The row as it arrived.
 * @returns A view of just its values.
 */
export function dataRowBytes(msg: {
  buffer: Buffer;
  offset: number;
  len: number;
}): Buffer {
  return msg.buffer.subarray(msg.offset, msg.offset + msg.len);
}

export class ArrayRowDecoder extends RowDecoder {
  override readonly rowType = 'array' as const;

  decode(
    parsers: AnyParseFunction[],
    data: Buffer,
    columnCount: number,
    options: DataMappingOptions,
  ): any[] {
    return parseRow(parsers, data, columnCount, options);
  }

  override decodeAt(
    parsers: AnyParseFunction[],
    buffer: Buffer,
    offset: number,
    _len: number,
    columnCount: number,
    options: DataMappingOptions,
  ): any[] {
    return parseRow(parsers, buffer, columnCount, options, offset);
  }
}

/** Reads each row into an object keyed by column name. */
export class ObjectRowDecoder extends RowDecoder {
  override readonly rowType = 'object' as const;

  decode(
    parsers: AnyParseFunction[],
    data: Buffer,
    columnCount: number,
    options: DataMappingOptions,
    fields: FieldInfo[],
  ): object {
    return parseObjectRow(parsers, data, columnCount, options, fields);
  }

  override decodeAt(
    parsers: AnyParseFunction[],
    buffer: Buffer,
    offset: number,
    _len: number,
    columnCount: number,
    options: DataMappingOptions,
    fields: FieldInfo[],
  ): object {
    return parseObjectRow(
      parsers,
      buffer,
      columnCount,
      options,
      fields,
      offset,
    );
  }
}

/** The array decoder every query shares - it holds no state. */
export const DEFAULT_ARRAY_ROW_DECODER = new ArrayRowDecoder();
/** The object decoder every query shares - it holds no state. */
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
 * The `rowType` string surfaced on `QueryResult`/`Cursor.rowType`.
 *
 * Asked of the decoder rather than worked out from its class: an
 * `instanceof` test answers `'array'` for anything derived from
 * `ArrayRowDecoder`, including a subclass that overrode `decode()` to
 * return something else entirely - which is the only reason to subclass
 * it. The built-ins declare their own shape, so the answers are
 * unchanged, and a subclass that changes the shape can now say so.
 */
export function resolveRowType(
  options: RowDecoderOptions,
): 'array' | 'object' | 'custom' {
  return resolveRowDecoder(options).rowType;
}
