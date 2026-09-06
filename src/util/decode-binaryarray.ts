import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { BufferReader } from '../protocol/buffer-reader.js';
import type { DecodeBinaryFunction, Nullable } from '../types.js';

export function decodeBinaryArray<T = any>(
  buf: Buffer,
  offset: number,
  decoder: DecodeBinaryFunction,
  options: DataMappingOptions = {},
  // The element type's DataType.fixedBinarySize, when it has one (see
  // that field's own comment in interfaces/data-type.ts). When set, this
  // skips the per-element Buffer.subarray() entirely - decoder reads
  // straight out of the original wire buffer at each element's own
  // offset - instead of slicing a throwaway view first just to hand the
  // decoder a buffer it immediately reads from and discards. Left unset
  // for variable-width types (bytea, varchar, json, jsonb, numeric),
  // which still get a real bounded slice since their decodeBinary has no
  // other way to know where its own value ends.
  fixedBinarySize?: number,
): Nullable<T[]> {
  if (!buf.length) return null;
  const io = new BufferReader(buf);
  io.offset = offset;
  const ndims = io.readInt32BE();
  io.readInt32BE(); // hasNulls
  const elementOID = io.readInt32BE(); // element oid
  if (ndims === 0) return [];
  const dims: number[] = [];
  // Computed once, not once per element - every decoder call for this
  // array gets the exact same elementOID, so a large array (tens of
  // thousands of elements) doesn't need that many throwaway spread
  // objects (measured as a significant fraction of decode time for a
  // 50,000-element int4[]).
  const elementOptions = { ...options, elementOID };

  // `dims` gets exactly `ndims` entries filled in below and is never
  // mutated after that, so the innermost-dimension test is invariant for
  // the whole recursion - not just for one loop. Reading dims.length and
  // subtracting on every element of a 50,000-element array (see the
  // large-array-fetch benchmark) is pure per-element overhead that doesn't
  // depend on the element.
  const lastDim = ndims - 1;

  const readDim = (level: number) => {
    const elemCount = dims[level];
    const target = new Array(elemCount);
    const isLeafLevel = level >= lastDim;
    let i: number;
    let len: number;
    for (i = 0; i < elemCount; i++) {
      if (!isLeafLevel) {
        target[i] = readDim(level + 1);
        continue;
      }
      len = io.readInt32BE();
      if (len === -1) target[i] = null;
      else if (fixedBinarySize != null) {
        target[i] = decoder(buf, io.offset, elementOptions);
        io.offset += len;
      } else {
        target[i] = decoder(io.readBuffer(len), 0, elementOptions);
      }
    }
    return target;
  };

  for (let d = 0; d < ndims; d++) {
    dims[d] = io.readInt32BE();
    io.readInt32BE(); // LBound
  }
  return readDim(0);
}
