import { expect } from 'expect';
import { DataTypeOIDs } from '../../src/constants.js';
import { ByteaType } from '../../src/data-types/bytea-type.js';
import { CharType } from '../../src/data-types/char-type.js';
import { Int2VectorType } from '../../src/data-types/int2-vector-type.js';
import { JsonType } from '../../src/data-types/json-type.js';
import { JsonbType } from '../../src/data-types/jsonb-type.js';
import { NumericType } from '../../src/data-types/numeric-type.js';
import { OidVectorType } from '../../src/data-types/oid-vector-type.js';
import { VarcharType } from '../../src/data-types/varchar-type.js';
import type { DataType } from '../../src/interfaces/data-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';
import { decodeBinaryArray } from '../../src/util/decode-binaryarray.js';
import { encodeBinaryArray } from '../../src/util/encode-binaryarray.js';

/** Serialises `value` through the type's own encodeBinary. */
function wireBytes(type: DataType, value: any): Buffer {
  const buf = new SmartBuffer();
  type.encodeBinary!(buf, value, {});
  return Buffer.from(buf.flush());
}

/**
 * Bytes placed immediately after a value, chosen to be the sort of thing
 * that changes a result rather than being ignored: printable text (so an
 * over-reading string type shows it), valid JSON continuation, and high
 * bytes.
 */
const POISON = Buffer.from('}]"9999\xff\xfe\x01\x02', 'latin1');

/**
 * Decodes `value` twice - once from a buffer holding nothing else, once
 * from the middle of a larger one - and requires the same answer. A
 * decoder that reads to the end of the buffer it is handed instead of
 * stopping at `len` passes the first and fails the second.
 */
function expectBoundedDecode(
  type: DataType,
  value: any,
  compare: (v: any) => any = v => v,
): void {
  const bytes = wireBytes(type, value);
  const alone = type.decodeBinary!(bytes, 0, bytes.length, {});
  const embedded = type.decodeBinary!(
    Buffer.concat([POISON, bytes, POISON]),
    POISON.length,
    bytes.length,
    {},
  );
  expect(compare(embedded)).toStrictEqual(compare(alone));
}

describe('binary decode bounds', () => {
  // Each of these reads a value whose length is not implied by its own
  // bytes, so `len` is the only thing saying where it ends. Reading past it
  // is not a bounds error - it silently returns the next column's or
  // element's data.
  it('should stop at len for varchar', () => {
    expectBoundedDecode(VarcharType, 'hello');
    expect(
      VarcharType.decodeBinary!(Buffer.from('helloWORLD', 'utf8'), 0, 5, {}),
    ).toStrictEqual('hello');
  });

  it('should stop at len for char', () => {
    expectBoundedDecode(CharType, 'x');
  });

  it('should stop at len for bytea', () => {
    expectBoundedDecode(ByteaType, Buffer.from([1, 2, 3, 4]), (v: Buffer) => [
      ...v,
    ]);
  });

  it('should stop at len for json', () => {
    expectBoundedDecode(JsonType, { a: 1, b: 'two' });
  });

  it('should stop at len for jsonb', () => {
    expectBoundedDecode(JsonbType, { a: 1, b: 'two' });
  });

  it('should stop at len for numeric', () => {
    for (const v of [0, 1.5, -12345.6789, 1e12])
      expectBoundedDecode(NumericType, v);
  });

  it('should stop at len for int2vector', () => {
    expectBoundedDecode(Int2VectorType, [1, 2, 3]);
  });

  it('should stop at len for oidvector', () => {
    expectBoundedDecode(OidVectorType, [16, 23, 1043]);
  });

  it('should stop at each element boundary inside a binary array', () => {
    // Array elements have the same hazard one level down: every element
    // carries its own length on the wire, and a decoder that ignores it
    // reads into the element that follows. Deliberately uneven lengths, so
    // an over-read shows up as a wrong element rather than a wrong count.
    const values = ['a', 'bbbb', '', 'cc', 'ddddddd'];
    const io = new SmartBuffer();
    encodeBinaryArray(
      io,
      values,
      DataTypeOIDs.varchar,
      {},
      VarcharType.encodeBinary!,
    );
    const bytes = Buffer.from(io.flush());
    const decode = (buf: Buffer, offset: number) =>
      decodeBinaryArray<string>(buf, offset, VarcharType.decodeBinary, {});
    expect(decode(bytes, 0)).toStrictEqual(values);
    // And the same array read out of the middle of a larger buffer.
    expect(
      decode(Buffer.concat([POISON, bytes, POISON]), POISON.length),
    ).toStrictEqual(values);
  });
});
