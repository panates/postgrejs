import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { EncodeBinaryFunction, OID } from '../types.js';
import { EncodeCalculateDimFunction } from '../types.js';
import { arrayCalculateDim } from './array-calculatedim.js';

export function encodeBinaryArray(
  io: SmartBuffer,
  value: any[],
  itemOid: OID,
  options: DataMappingOptions,
  encode: EncodeBinaryFunction,
  encodeCalculateDimFn?: EncodeCalculateDimFunction,
): void {
  encodeCalculateDimFn = encodeCalculateDimFn || arrayCalculateDim;
  itemOid = itemOid || DataTypeOIDs.varchar;
  const dim = encodeCalculateDimFn(value);
  const ndims = dim.length;
  const zeroOffset = io.offset;
  io.writeInt32BE(ndims) // Number of dimensions
    .writeInt32BE(0) // reserved for has-null flag
    .writeInt32BE(itemOid);

  for (let d = 0; d < ndims; d++) {
    io.writeInt32BE(dim[d]); // Number of items in dimension
    io.writeInt32BE(0); // LBound always 0.
  }

  let hasNull = false;
  let pos: number;
  const writeDim = (arr: any[], level: number) => {
    const elemCount = dim[level];
    for (let i = 0; i < elemCount; i++) {
      if (level < dim.length - 1) {
        writeDim(arr && arr[i], level + 1);
        continue;
      }
      // if value is null
      if (!arr || arr[i] == null) {
        hasNull = true;
        io.writeInt32BE(-1);
        continue;
      }
      io.writeInt32BE(0); // reserved for data len
      pos = io.offset;
      encode(io, arr[i], options);
      // Update item data size
      io.buffer.writeInt32BE(io.length - pos, pos - 4);
    }
  };
  writeDim(value, 0);
  if (hasNull) io.buffer.writeInt32BE(1, zeroOffset + 4);
}
