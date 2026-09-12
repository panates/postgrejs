import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { BufferReader } from '../protocol/buffer-reader.js';
import type { DecodeBinaryFunction, Nullable } from '../types.js';

export function decodeBinaryArray<T = any>(
  buf: Buffer,
  offset: number,
  decoder: DecodeBinaryFunction,
  options: DataMappingOptions = {},
  fixedBinarySize?: number,
): Nullable<T[]> {
  if (!buf.length) return null;
  const io = new BufferReader(buf);
  io.position = offset;
  const ndims = io.readInt32BE();
  io.readInt32BE(); // hasNulls
  const elementOID = io.readInt32BE(); // element oid
  if (ndims === 0) return [];
  const dims: number[] = [];
  const elementOptions = { ...options, elementOID };
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
        target[i] = decoder(buf, io.position, elementOptions);
        io.position += len;
      } else {
        target[i] = decoder(io.readBytes(len), 0, elementOptions);
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
