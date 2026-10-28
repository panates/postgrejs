import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { parseBytea, parseByteaBuffer } from '../util/parse-bytea.js';

/**
 * Reads any ArrayBuffer view as a `Buffer` over exactly the bytes it covers.
 *
 * @param v The view to read.
 * @returns It unchanged when it is already a `Buffer`, or a window onto the
 * same memory - never a copy.
 */
/* `byteOffset`/`byteLength` are the whole point: a `subarray()` of a larger
   buffer describes a window, and `Buffer.from(view.buffer)` would send
   everything on both sides of it. */
function asBuffer(v: ArrayBufferView): Buffer {
  return Buffer.isBuffer(v)
    ? v
    : Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

/**
 * `bytea`. A value read back is a `Buffer`; a value sent may be any
 * ArrayBuffer view - a `Buffer`, a `Uint8Array` off `fetch` or `subarray`,
 * a `DataView` - and only the bytes that view covers are sent.
 *
 * The binary format is the bytes themselves; the text one is `\\x`-prefixed
 * hex, at two characters a byte.
 */
export const ByteaType: DataType = {
  name: 'bytea',
  oid: DataTypeOIDs.bytea,
  jsType: 'Buffer',

  // The hex form PostgreSQL has emitted by default since 9.0.
  encodeText(v: ArrayBufferView): string {
    return '\\x' + asBuffer(v).toString('hex');
  },

  /* Through `asBuffer` rather than straight to `writeBytes`, which reaches
     for `.copy()` - a `Buffer` method that a plain `Uint8Array` does not
     have, and the `buffer.copy is not a function` an explicit
     `BindParam(17, bytes)` used to fail with. */
  encodeBinary(buf: SmartBuffer, v: ArrayBufferView): void {
    buf.writeBytes(asBuffer(v));
  },

  decodeBinary(v: Buffer, offset: number = 0, len: number): Buffer {
    // A view, not a copy - the value handed back is the caller's own
    // window onto the wire bytes, which is what bytea has always returned.
    return v.subarray(offset, offset + len);
  },

  decodeText: parseBytea,
  decodeTextBuffer: parseByteaBuffer,

  isType(v: any): boolean {
    return ArrayBuffer.isView(v);
  },
};

/** The `_bytea` array of {@link ByteaType}. */
export const ArrayByteaType: DataType = {
  ...ByteaType,
  name: '_bytea',
  oid: DataTypeOIDs._bytea,
  elementsOID: DataTypeOIDs.bytea,
};
