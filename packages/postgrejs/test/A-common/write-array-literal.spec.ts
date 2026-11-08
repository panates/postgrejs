import { expect } from 'expect';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';
import {
  stringifyArrayLiteral,
  writeArrayLiteral,
} from '../../src/util/stringify-arrayliteral.js';

/**
 * The parameter path writes an array literal as bytes rather than
 * building the string and handing it to writeLString(). Nothing about
 * what reaches the server may change, so every case here is checked
 * against the string it replaces rather than against a spelling written
 * out by hand - the two have to be the same bytes, including the length
 * prefix.
 *
 * The cases are all at or above the element count where the byte path
 * takes over; the existing array tests are all below it and go the other
 * way, which is why this file exists at all.
 */
describe('writeArrayLiteral()', () => {
  /** What the string path would have put on the wire, for comparison. */
  function viaString(value: any[]): Buffer {
    const io = new SmartBuffer();
    io.start();
    io.writeLString(stringifyArrayLiteral(value, {}, undefined), 'utf8');
    return io.flush();
  }

  function viaBytes(value: any[]): Buffer {
    const io = new SmartBuffer();
    io.start();
    writeArrayLiteral(io, value, {}, undefined);
    return io.flush();
  }

  const ints = (n: number, make: (i: number) => any) =>
    Array.from({ length: n }, (_, i) => make(i));

  const CASES: [string, any[]][] = [
    ['a plain run of integers', ints(64, i => i)],
    ['negatives and zero', ints(64, i => (i % 2 ? -i : i))],
    ['the int32 bounds', [2147483647, -2147483648, 0, ...ints(20, i => i)]],
    [
      'one past the int32 bounds',
      [2147483648, -2147483649, ...ints(20, i => i)],
    ],
    [
      'values past what a double counts exactly',
      [Number.MAX_SAFE_INTEGER + 2, 2 ** 53, ...ints(20, i => i)],
    ],
    [
      'nulls and undefined among them',
      ints(64, i => (i % 5 ? i : i % 10 ? null : undefined)),
    ],
    ['floats mixed in', ints(64, i => (i % 3 ? i : i + 0.5))],
    [
      'an integer first and floats after it',
      [1, 2.5, -3.75, 1e-7, ...ints(20, i => i)],
    ],
    ['a float first, which keeps the string path', ints(64, i => i + 0.5)],
    [
      'exponent and negative-zero forms',
      [1e-7, 1.5e21, -0, 1e21, ...ints(20, i => i)],
    ],
    ['NaN and the infinities', [NaN, Infinity, -Infinity, ...ints(20, i => i)]],
    [
      'bigints among the numbers',
      [1n, -2n, 9223372036854775807n, ...ints(20, i => i)],
    ],
    [
      'strings that need quoting',
      [1, 'a"b', 'c\\d', 'e,f', '{g}', ' h ', ...ints(20, i => i)],
    ],
    ['the word NULL as a value', [1, 'NULL', ...ints(20, i => i)]],
    [
      'strings that read as numbers, which stay quoted',
      [1, '123', '-4.5', '1e3', ...ints(20, i => i)],
    ],
    [
      'a scalar where a nested row was expected',
      ints(20, r => (r === 5 ? 5 : ints(20, c => r * c))),
    ],
    [
      'a missing row in a nested array',
      ints(20, r => (r === 5 ? null : ints(20, c => r * c))),
    ],
    [
      'a bigint longer than the scratch, which is still a bare number',
      [1, BigInt('9'.repeat(30000)), 2, ...ints(20, i => i)],
    ],
    [
      'non-ascii text, which is utf-8 on the wire',
      [1, 'ölçüm', '日本語', '😀', ...ints(20, i => i)],
    ],
    ['a nested array', ints(20, r => ints(20, c => r * c))],
    [
      'a ragged nested array',
      ints(20, r => (r === 7 ? [1, 2] : ints(20, c => r * c))),
    ],
    [
      'plain objects among the numbers, which go out as JSON',
      [1, { a: 1 }, { b: [1, 2] }, ...ints(20, i => i)],
    ],
    [
      'a value that writes itself',
      [1, { toPostgres: () => 'custom:1' }, ...ints(20, i => i)],
    ],
    ['exactly the threshold', ints(16, i => i)],
    ['one short of it', ints(15, i => i)],
    ['an empty array', []],
  ];

  for (const [name, value] of CASES)
    it(`should write the same bytes as the string path for ${name}`, () => {
      expect(viaBytes(value)).toStrictEqual(viaString(value));
    });

  it('should write the same bytes across a chunk boundary', () => {
    // The scratch it fills is 64KB and is flushed when full, so an array
    // that spans several of them is the case where a boundary can fall
    // in the middle of an element, a separator or a brace.
    for (const n of [4000, 12000, 40000]) {
      const value = Array.from({ length: n }, (_, i) => 2147383646 - i);
      expect(viaBytes(value)).toStrictEqual(viaString(value));
    }
  });

  it('should write the same bytes wherever a brace falls against the boundary', () => {
    // The scratch is flushed when full, and a dimension's own `{` or `}`
    // can be the byte that does not fit. Sweeping the row width walks
    // every row boundary across the 64KB edge rather than hoping one
    // lands there.
    for (let width = 60; width < 90; width++) {
      const rows = Math.ceil(70000 / (width * 11));
      const value = Array.from({ length: rows }, (_row, r) =>
        Array.from({ length: width }, (_col, c) => 2147383646 - r * width - c),
      );
      expect(viaBytes(value)).toStrictEqual(viaString(value));
    }
  });

  it('should write the same bytes for an element longer than the chunk', () => {
    // A single text value larger than the whole scratch cannot be
    // buffered into it, and goes out on its own.
    const value = [1, 'x'.repeat(70000), 2, ...ints(20, i => i)];
    expect(viaBytes(value)).toStrictEqual(viaString(value));
  });

  it('should leave the buffer positioned after the value, like writeLString', () => {
    const value = ints(64, i => i);
    const io = new SmartBuffer();
    io.start();
    writeArrayLiteral(io, value, {}, undefined);
    io.writeInt32BE(0x01020304);
    const out = io.flush();
    const expected = Buffer.concat([
      viaString(value),
      Buffer.from([1, 2, 3, 4]),
    ]);
    expect(out).toStrictEqual(expected);
  });

  it('should declare the length it actually wrote', () => {
    const value = Array.from({ length: 5000 }, (_, i) => i);
    const out = viaBytes(value);
    expect(out.readInt32BE(0)).toStrictEqual(out.length - 4);
  });

  it('should take the string path when an element encoder is given', () => {
    // An encoder means a declared type, and its text is the type's to
    // produce - the digit lane would be writing the number instead.
    const encode = (v: any) => `<${v}>`;
    const value = ints(64, i => i);
    const io = new SmartBuffer();
    io.start();
    writeArrayLiteral(io, value, {}, encode);
    const io2 = new SmartBuffer();
    io2.start();
    io2.writeLString(stringifyArrayLiteral(value, {}, encode), 'utf8');
    expect(io.flush()).toStrictEqual(io2.flush());
  });
});
