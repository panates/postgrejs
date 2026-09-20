import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { BufferReader } from '../protocol/buffer-reader.js';
import type { DecodeBinaryFunction, Nullable } from '../types.js';

export function decodeBinaryArray<T = any>(
  buf: Buffer,
  offset: number,
  decoder: DecodeBinaryFunction,
  options: DataMappingOptions = {},
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
      else {
        // Every element carries its own length on the wire, so the decoder
        // can be pointed straight at it - no bounded slice per element,
        // whether or not the element type has a fixed binary size.
        target[i] = decoder(buf, io.position, len, elementOptions);
        io.position += len;
      }
    }
    return target;
  };

  for (let d = 0; d < ndims; d++) {
    dims[d] = io.readInt32BE();
    // The lower bound is read and dropped, deliberately. A server-side
    // array really can have a non-default one, and a JavaScript array is
    // always 0-based, so carrying it would mean deciding what a decoded
    // array is supposed to represent - a wider change than the encoder's.
    // Note that this is also what hid the encoder writing 0: a value
    // written and read back through this client looked right, and only
    // SQL against the stored value saw the difference.
    io.readInt32BE();
  }
  return readDim(0);
}
