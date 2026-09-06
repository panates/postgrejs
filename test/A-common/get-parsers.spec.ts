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

  it("should fall back to a bounded slice when a fixed-size binary column's wire length does not match its declared size", () => {
    const decodeCalls: { bufLength: number; offset: number }[] = [];
    const typeMap = typeMapOf({
      42: {
        fixedBinarySize: 4,
        decodeBinary: (buf: Buffer, offset: number) => {
          decodeCalls.push({ bufLength: buf.length, offset });
          return undefined;
        },
      },
    });
    const [parse] = getParsers(typeMap, [field(42, DataFormat.binary)]);
    const data = Buffer.alloc(10);
    // len (3) deliberately does not match fixedBinarySize (4).
    parse(data, 2, 3, {});
    // The fallback re-slices to a fresh, 0-offset buffer bounded to `len`,
    // rather than reading directly out of the shared row buffer at `offset`.
    expect(decodeCalls[0]).toStrictEqual({ bufLength: 3, offset: 0 });
  });

  it('should read directly from the shared row buffer when the wire length matches the declared fixed size', () => {
    const decodeCalls: { bufLength: number; offset: number }[] = [];
    const typeMap = typeMapOf({
      42: {
        fixedBinarySize: 4,
        decodeBinary: (buf: Buffer, offset: number) => {
          decodeCalls.push({ bufLength: buf.length, offset });
          return undefined;
        },
      },
    });
    const [parse] = getParsers(typeMap, [field(42, DataFormat.binary)]);
    const data = Buffer.alloc(10);
    parse(data, 2, 4, {});
    // No slicing: the same 10-byte shared buffer, read at its real offset.
    expect(decodeCalls[0]).toStrictEqual({ bufLength: 10, offset: 2 });
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
