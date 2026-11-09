import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type {
  EncodeBinaryFunction,
  EncodeCalculateDimFunction,
  OID,
} from '../types.js';
import { arrayCalculateDim } from './array-calculatedim.js';

/**
 * Writes an array in the binary wire format.
 *
 * `lowerBound` is the index the first element answers to in SQL, and it
 * is 1 for every ordinary array - `array_lower('{1,2}'::int4[], 1)` is
 * 1, and a value written with 0 comes back subscripted from 0, so
 * `arr[1]` is its *second* element and `::text` renders the
 * explicit-bounds form `[0:2]={…}`. `oidvector` and `int2vector` are the
 * exception and really are 0-based - confirmed against the catalog,
 * `array_lower(pg_index.indkey, 1)` is 0 - so they pass 0 themselves.
 */
export function encodeBinaryArray(
  io: SmartBuffer,
  value: any[],
  itemOid: OID,
  options: DataMappingOptions,
  encode: EncodeBinaryFunction,
  encodeCalculateDimFn?: EncodeCalculateDimFunction,
  lowerBound: number = 1,
): void {
  encodeCalculateDimFn = encodeCalculateDimFn || arrayCalculateDim;
  itemOid = itemOid || DataTypeOIDs.varchar;
  const dim = encodeCalculateDimFn(value);
  const ndims = dim.length;
  const zeroOffset = io.position;
  io.writeInt32BE(ndims); // Number of dimensions
  io.writeInt32BE(0); // reserved for has-null flag
  io.writeInt32BE(itemOid);

  let d: number;
  for (d = 0; d < ndims; d++) {
    io.writeInt32BE(dim[d]); // Number of items in dimension
    io.writeInt32BE(lowerBound); // Index the first element answers to
  }

  let hasNull = false;
  let pos: number;
  const lastDim = ndims - 1;
  const writeDim = (arr: any[], level: number) => {
    const elemCount = dim[level];
    const isLeafLevel = level >= lastDim;
    let i: number;
    for (i = 0; i < elemCount; i++) {
      if (!isLeafLevel) {
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
      pos = io.position;
      encode(io, arr[i], options);
      // Update item data size
      io.buffer.writeInt32BE(io.size - pos, pos - 4);
    }
  };
  writeDim(value, 0);
  if (hasNull) io.buffer.writeInt32BE(1, zeroOffset + 4);
}
