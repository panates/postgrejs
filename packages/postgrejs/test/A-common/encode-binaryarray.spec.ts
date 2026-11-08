import { expect } from 'expect';
import { DataTypeOIDs } from 'postgrejs';
import { Int2VectorType } from '../../src/data-types/int2-vector-type.js';
import { OidVectorType } from '../../src/data-types/oid-vector-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';
import { encodeBinaryArray } from '../../src/util/encode-binaryarray.js';

/** The dimension headers only: ndims, hasNull, elementOid, then a count
 *  and a lower bound per dimension. */
function header(buf: Buffer, ndims: number) {
  const dims: { count: number; lowerBound: number }[] = [];
  for (let d = 0; d < ndims; d++)
    dims.push({
      count: buf.readInt32BE(12 + d * 8),
      lowerBound: buf.readInt32BE(16 + d * 8),
    });
  return {
    ndims: buf.readInt32BE(0),
    hasNull: buf.readInt32BE(4),
    elementOid: buf.readInt32BE(8),
    dims,
  };
}

function encode(v: any[], lowerBound?: number): Buffer {
  const io = new SmartBuffer();
  encodeBinaryArray(
    io,
    v,
    DataTypeOIDs.int4,
    {},
    (buf, x) => buf.writeInt32BE(x),
    undefined,
    lowerBound,
  );
  return Buffer.from(io.buffer.subarray(0, io.size));
}

describe('encodeBinaryArray()', () => {
  // The lower bound is the index the first element answers to in SQL. It
  // was written as 0 for everything, which is why a value stored through
  // this client came back subscripted from 0 - `arr[1]` was its second
  // element - while reading it back through this client hid it, because
  // the decoder reads the bound and discards it.
  it('should write a lower bound of 1 by default', () => {
    const h = header(encode([10, 20, 30]), 1);
    expect(h).toStrictEqual({
      ndims: 1,
      hasNull: 0,
      elementOid: DataTypeOIDs.int4,
      dims: [{ count: 3, lowerBound: 1 }],
    });
  });

  it('should write one bound per dimension', () => {
    const h = header(
      encode([
        [1, 2],
        [3, 4],
      ]),
      2,
    );
    expect(h.ndims).toStrictEqual(2);
    expect(h.dims).toStrictEqual([
      { count: 2, lowerBound: 1 },
      { count: 2, lowerBound: 1 },
    ]);
  });

  it('should still raise the has-null flag', () => {
    expect(header(encode([1, null, 3]), 1).hasNull).toStrictEqual(1);
    expect(header(encode([1, 2, 3]), 1).hasNull).toStrictEqual(0);
  });

  it('should write the bound it is given', () => {
    expect(header(encode([1, 2], 0), 1).dims).toStrictEqual([
      { count: 2, lowerBound: 0 },
    ]);
  });

  it('should leave the vector types 0-based, which they really are', () => {
    // `array_lower(pg_index.indkey, 1)` is 0 on the server - these two
    // are the reason the constant could not simply be flipped to 1.
    for (const t of [Int2VectorType, OidVectorType]) {
      const io = new SmartBuffer();
      t.encodeBinary!(io, [1, 2, 3], {});
      const buf = Buffer.from(io.buffer.subarray(0, io.size));
      expect(header(buf, 1).dims).toStrictEqual([{ count: 3, lowerBound: 0 }]);
    }
  });
});
