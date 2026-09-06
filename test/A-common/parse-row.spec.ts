import { expect } from 'expect';
import { parseObjectRow, parseRow } from '../../src/util/parse-row.js';

/** Builds a wire-format row: for each value, a 4-byte length (-1 for null) followed by its utf8 bytes. */
function rowBuffer(values: (string | null)[]): Buffer {
  const parts: Buffer[] = [];
  for (const v of values) {
    const len = Buffer.alloc(4);
    if (v === null) {
      len.writeInt32BE(-1);
      parts.push(len);
    } else {
      const data = Buffer.from(v, 'utf8');
      len.writeInt32BE(data.length);
      parts.push(len, data);
    }
  }
  return Buffer.concat(parts);
}

const echoParser = (data: Buffer, offset: number, len: number) =>
  data.toString('utf8', offset, offset + len);

describe('parseRow()', () => {
  it('should decode each column via its own parser', () => {
    const data = rowBuffer(['a', 'bb']);
    const row = parseRow([echoParser, echoParser], data, 2, {});
    expect(row).toStrictEqual(['a', 'bb']);
  });

  it('should decode a null column (length -1) as null without calling its parser', () => {
    let called = false;
    const failIfCalled = () => {
      called = true;
      return 'x';
    };
    const data = rowBuffer([null]);
    const row = parseRow([failIfCalled], data, 1, {});
    expect(row).toStrictEqual([null]);
    expect(called).toStrictEqual(false);
  });
});

describe('parseObjectRow()', () => {
  const fields = [{ fieldName: 'id' }, { fieldName: 'name' }] as any;

  it('should key each decoded value by its field name', () => {
    const data = rowBuffer(['1', 'ada']);
    const row = parseObjectRow([echoParser, echoParser], data, 2, {}, fields);
    expect(row).toStrictEqual({ id: '1', name: 'ada' });
  });

  it('should decode a null column as null without calling its parser', () => {
    let called = false;
    const failIfCalled = () => {
      called = true;
      return 'x';
    };
    const data = rowBuffer([null, 'ada']);
    const row = parseObjectRow([failIfCalled, echoParser], data, 2, {}, fields);
    expect(row).toStrictEqual({ id: null, name: 'ada' });
    expect(called).toStrictEqual(false);
  });

  it('should write a column named "__proto__" as its own real, enumerable property', () => {
    // row[name] = value silently drops the value for this one name instead
    // of setting a property, since `row.__proto__ = value` reassigns the
    // prototype (or is a no-op) rather than adding an own property.
    const protoFields = [
      { fieldName: '__proto__' },
      { fieldName: 'ok' },
    ] as any;
    const data = rowBuffer(['42', '7']);
    const row: any = parseObjectRow(
      [echoParser, echoParser],
      data,
      2,
      {},
      protoFields,
    );
    expect(
      Object.prototype.hasOwnProperty.call(row, '__proto__'),
    ).toStrictEqual(true);
    expect(
      Object.getOwnPropertyDescriptor(row, '__proto__')?.value,
    ).toStrictEqual('42');
    expect(row.ok).toStrictEqual('7');
  });

  it('should write a null value for a column named "__proto__"', () => {
    const protoFields = [{ fieldName: '__proto__' }] as any;
    const data = rowBuffer([null]);
    const row: any = parseObjectRow([echoParser], data, 1, {}, protoFields);
    expect(
      Object.getOwnPropertyDescriptor(row, '__proto__')?.value,
    ).toStrictEqual(null);
  });
});
