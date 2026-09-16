import type { DataTypeMap } from '../data-type-map.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { OID } from '../types.js';
import { encodeBinaryArray } from './encode-binaryarray.js';

/**
 * `PGCOPY\n\377\r\n\0` followed by two int32 words: a flags field and the
 * length of a header extension area. Bit 16 of the flags marks a stream
 * that carries an OID per row - an obsolete variant PostgreSQL still reads
 * but nothing should write - so both words are zero here.
 */
export const COPY_BINARY_HEADER = Buffer.from([
  0x50, 0x47, 0x43, 0x4f, 0x50, 0x59, 0x0a, 0xff, 0x0d, 0x0a, 0x00, 0, 0, 0, 0,
  0, 0, 0, 0,
]);

/** A field count of -1 where a row would start, ending the stream. */
export const COPY_BINARY_TRAILER = Buffer.from([0xff, 0xff]);

/**
 * Appends one row to `io` in PostgreSQL's binary COPY format: an int16
 * field count, then per field an int32 byte length followed by that many
 * bytes, with -1 standing in for NULL.
 *
 * Each value is written by its own type's `encodeBinary`, which is the same
 * function a binary query parameter goes through (see Frontend's Bind) -
 * both are the type's `send` representation, so there is one encoder per
 * type rather than a COPY-specific set.
 *
 * Binary COPY performs no conversion on the server: the bytes have to be
 * exactly what the destination column's type expects. `dataTypeIds` must
 * therefore be the column's own OIDs, which is why the caller obtains them
 * from the server rather than inferring them from the JavaScript values.
 *
 * @param rowIndex Only used to say which row failed, since a value that
 *   cannot be encoded otherwise surfaces from the server as an opaque
 *   "incorrect binary data format" naming neither row nor column.
 * @returns Whether the row was written - false only under `'skip'`, where
 *   the partial row has already been unwound.
 */
export function encodeCopyBinaryRow(
  io: SmartBuffer,
  values: any[],
  dataTypeIds: OID[],
  columnNames: string[],
  typeMap: DataTypeMap,
  options: DataMappingOptions,
  rowIndex: number,
  onInvalidValue: 'throw' | 'null' | 'skip' = 'throw',
  /** Incremented per value replaced under `'null'`; counted here rather
   * than inferred by the caller, which cannot see inside a written row. */
  stats?: { nulled: number },
): boolean {
  const rowStart = io.size;
  const l = dataTypeIds.length;
  io.writeInt16BE(l);
  let i: number;
  let v: any;
  for (i = 0; i < l; i++) {
    v = values[i];
    if (v === null || v === undefined) {
      io.writeInt32BE(-1);
      continue;
    }
    const dt = typeMap.get(dataTypeIds[i]);
    /* c8 ignore next 5 - unreachable: assertCopyBinaryEncodable() rejects
       every column whose type has no encodeBinary before any row is
       encoded, so this is a guard against a type map mutated mid-copy. */
    if (!dt?.encodeBinary) {
      throw new Error(
        `Column "${columnNames[i]}" has no binary encoder (type OID ${dataTypeIds[i]})`,
      );
    }
    if (dt.encodeAsNull?.(v, options)) {
      io.writeInt32BE(-1);
      continue;
    }
    io.writeInt32BE(0); // placeholder, backfilled below
    const dataOffset = io.position;
    try {
      if (dt.elementsOID) {
        encodeBinaryArray(
          io,
          Array.isArray(v) ? v : [v],
          dt.elementsOID,
          options,
          dt.encodeBinary,
          dt.encodeCalculateDim,
        );
      } else {
        dt.encodeBinary(io, v, options);
      }
    } catch (e: any) {
      if (onInvalidValue === 'skip') {
        // Unwind the partial row so the stream never carries half of it.
        io.setSize(rowStart);
        io.position = rowStart;
        return false;
      }
      if (onInvalidValue === 'null') {
        io.setSize(dataOffset);
        io.position = dataOffset - 4;
        io.writeInt32BE(-1);
        if (stats) stats.nulled++;
        continue;
      }
      throw new Error(
        `Cannot encode row ${rowIndex}, column "${columnNames[i]}" (${dt.name}): ${e.message}`,
        { cause: e },
      );
    }
    io.buffer.writeInt32BE(io.size - dataOffset, dataOffset - 4);
  }
  return true;
}

/**
 * Fails before a single byte goes out when any column's type cannot be
 * written in binary. Worth doing up front: once the server has answered
 * CopyInResponse it is waiting for a complete stream, so discovering an
 * unencodable column at row 900,000 means aborting a copy that was already
 * most of the way done.
 */
export function assertCopyBinaryEncodable(
  dataTypeIds: OID[],
  columnNames: string[],
  typeMap: DataTypeMap,
): void {
  const missing: string[] = [];
  const l = dataTypeIds.length;
  let i: number;
  for (i = 0; i < l; i++) {
    const dt = typeMap.get(dataTypeIds[i]);
    if (!dt?.encodeBinary)
      missing.push(`"${columnNames[i]}" (OID ${dataTypeIds[i]})`);
  }
  if (missing.length) {
    throw new Error(
      `Binary COPY cannot encode ${missing.join(', ')} - no binary encoder is ` +
        `registered for that type. Use copyFrom() with a text format instead.`,
    );
  }
}
