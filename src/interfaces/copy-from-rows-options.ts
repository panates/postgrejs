import type { DataTypeMap } from '../data-type-map.js';
import type { OID } from '../types.js';
import type { DataMappingOptions } from './data-mapping-options.js';

export interface CopyFromRowsOptions extends DataMappingOptions {
  /** Type registry used to encode values; defaults to GlobalTypeMap. */
  typeMap?: DataTypeMap;
  /**
   * Destination columns, in the order the rows supply them. Omitted means
   * every column of the table, in table order - the same default `COPY
   * table FROM STDIN` has without a column list.
   */
  columns?: string[];
  /**
   * Type OIDs for those columns, skipping the round trip that would
   * otherwise ask the server for them.
   *
   * Only worth setting to avoid that probe on a hot path, and only when the
   * OIDs are known to match the table: binary COPY does no conversion, so a
   * wrong OID here is not a mismatch the server can reconcile - it either
   * rejects the stream or, for two types that happen to share a width,
   * stores the bytes as the wrong value.
   */
  columnTypes?: OID[];
  /**
   * Bytes to accumulate before sending a CopyData message. Defaults to
   * 128KB; anything from 64KB to 256KB measures much the same, while a
   * message per row is roughly ten times slower.
   */
  chunkSize?: number;
  /**
   * What to do with a value the destination column's type cannot encode -
   * `'abc'` for an integer column, `{}` for a numeric one.
   *
   * `'throw'` (default) aborts the copy, naming the row and column. The
   * other two exist for a load big enough that abandoning it over one bad
   * record costs more than the record is worth: `'null'` writes NULL in
   * that column and keeps the row, `'skip'` drops the row entirely. Both
   * report how many they touched, so a tolerant load still says what it
   * swallowed rather than looking clean.
   *
   * None of them apply to NaN or Infinity in a float or numeric column -
   * PostgreSQL stores those as values distinct from NULL, so they encode
   * normally and are never "invalid".
   */
  onInvalidValue?: 'throw' | 'null' | 'skip';
}

/** What `copyFromRows()` reports back. */
export interface CopyFromRowsResult {
  /** Rows actually sent to the server. */
  rowCount: number;
  /**
   * Rows dropped under `onInvalidValue: 'skip'`. Always 0 otherwise, and a
   * non-zero value here is the only sign a tolerant load lost anything.
   */
  skippedRows: number;
  /** Values replaced with NULL under `onInvalidValue: 'null'`. */
  nulledValues: number;
}
