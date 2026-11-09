import { expect } from 'expect';
import { DataFormat } from '../../src/constants.js';
import type { DataTypeMap } from '../../src/data-type-map.js';
import type { Protocol } from '../../src/protocol/protocol.js';
import { getParsers } from '../../src/util/get-parsers.js';

function typeMapOf(entries: Record<number, any>): DataTypeMap {
  return { get: (oid: number) => entries[oid] } as unknown as DataTypeMap;
}

function field(
  dataTypeId: number,
  format: DataFormat,
): Protocol.RowDescription {
  return {
    fieldName: 'c',
    tableId: 0,
    columnId: 0,
    dataTypeId,
    format,
  };
}

describe('getParsers()', () => {
  it('should return the raw sub-buffer for an unregistered binary-format column', () => {
    const typeMap = typeMapOf({});
    const [parse] = getParsers(typeMap, [field(999, DataFormat.binary)]);
    const data = Buffer.from([1, 2, 3, 4, 5]);
    expect([...parse(data, 1, 3, {})]).toStrictEqual([2, 3, 4]);
  });

  it('should return the raw utf8 string for an unregistered text-format column', () => {
    const typeMap = typeMapOf({});
    const [parse] = getParsers(typeMap, [field(999, DataFormat.text)]);
    const data = Buffer.from('xxhelloxx', 'utf8');
    expect(parse(data, 2, 5, {})).toStrictEqual('hello');
  });

  it('should hand a binary decoder the shared row buffer, never a slice of it', () => {
    // decodeBinary is told where its value starts and how long it is, so
    // there is nothing to slice first - and that holds whether or not the
    // type declares a fixed binary size, and whether or not the wire
    // length agrees with it.
    const decodeCalls: { bufLength: number; offset: number; len: number }[] =
      [];
    const record = (buf: Buffer, offset: number, len: number) => {
      decodeCalls.push({ bufLength: buf.length, offset, len });
      return undefined;
    };
    const typeMap = typeMapOf({
      42: { fixedBinarySize: 4, decodeBinary: record },
      43: { decodeBinary: record },
    });
    const [fixed, variable] = getParsers(typeMap, [
      field(42, DataFormat.binary),
      field(43, DataFormat.binary),
    ]);
    const data = Buffer.alloc(10);
    fixed(data, 2, 4, {});
    fixed(data, 2, 3, {}); // wire length disagreeing with the declared size
    variable(data, 5, 3, {});
    expect(decodeCalls).toStrictEqual([
      { bufLength: 10, offset: 2, len: 4 },
      { bufLength: 10, offset: 2, len: 3 },
      { bufLength: 10, offset: 5, len: 3 },
    ]);
  });

  it('should decode via toString() when a scalar text type has no decodeTextBuffer fast path', () => {
    const typeMap = typeMapOf({
      42: {
        decodeText: (s: string) => s.toUpperCase(),
      },
    });
    const [parse] = getParsers(typeMap, [field(42, DataFormat.text)]);
    const data = Buffer.from('xxhelloxx', 'utf8');
    expect(parse(data, 2, 5, {})).toStrictEqual('HELLO');
  });
});
