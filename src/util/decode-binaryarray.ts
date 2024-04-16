import { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { BufferReader } from '../protocol/buffer-reader.js';
import type { DecodeBinaryFunction, Nullable } from '../types.js';

export function decodeBinaryArray<T = any>(
  buf: Buffer,
  decoder: DecodeBinaryFunction,
  options: DataMappingOptions = {},
): Nullable<T[]> {
  if (!buf.length) return null;
  const io = new BufferReader(buf);
  const ndims = io.readInt32BE();
  io.readInt32BE(); // hasNulls
  const elementOID = io.readInt32BE(); // element oid
  if (ndims === 0) return [];
  const dims: number[] = [];

  const readDim = (level: number) => {
    const elemCount = dims[level];
    const target = new Array(elemCount);
    for (let i = 0; i < elemCount; i++) {
      if (level < dims.length - 1) {
        target[i] = readDim(level + 1);
        continue;
      }
      const len = io.readInt32BE();
      if (len === -1) target[i] = null;
      else {
        const b = io.readBuffer(len);
        target[i] = decoder(b, { ...options, elementOID });
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
