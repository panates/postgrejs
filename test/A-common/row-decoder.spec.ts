import { expect } from 'expect';
import type { AnyParseFunction } from '../../src/types.js';
import {
  ArrayRowDecoder,
  DEFAULT_ARRAY_ROW_DECODER,
  DEFAULT_OBJECT_ROW_DECODER,
  ObjectRowDecoder,
  resolveRowDecoder,
  resolveRowType,
  RowDecoder,
} from '../../src/util/row-decoder.js';

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

const echoParser: AnyParseFunction = (data, offset, len) =>
  data.toString('utf8', offset, offset + len);

const fields = [{ fieldName: 'id' }, { fieldName: 'name' }] as any;

describe('ArrayRowDecoder', () => {
  it('should decode a row into an array, same as parseRow()', () => {
    const data = rowBuffer(['1', 'ada']);
    const row = new ArrayRowDecoder().decode(
      [echoParser, echoParser],
      data,
      2,
      {},
      fields,
    );
    expect(row).toStrictEqual(['1', 'ada']);
  });
});

describe('ObjectRowDecoder', () => {
  it('should decode a row into a field-keyed object, same as parseObjectRow()', () => {
    const data = rowBuffer(['1', 'ada']);
    const row = new ObjectRowDecoder().decode(
      [echoParser, echoParser],
      data,
      2,
      {},
      fields,
    );
    expect(row).toStrictEqual({ id: '1', name: 'ada' });
  });
});

describe('resolveRowDecoder()', () => {
  it('should default to the array decoder when neither option is set', () => {
    expect(resolveRowDecoder({})).toBe(DEFAULT_ARRAY_ROW_DECODER);
  });

  it('should map objectRows: true to the object decoder', () => {
    expect(resolveRowDecoder({ objectRows: true })).toBe(
      DEFAULT_OBJECT_ROW_DECODER,
    );
  });

  it("should resolve rowDecoder: 'array' / 'object' to the matching singleton", () => {
    expect(resolveRowDecoder({ rowDecoder: 'array' })).toBe(
      DEFAULT_ARRAY_ROW_DECODER,
    );
    expect(resolveRowDecoder({ rowDecoder: 'object' })).toBe(
      DEFAULT_OBJECT_ROW_DECODER,
    );
  });

  it('should return a custom RowDecoder instance unchanged', () => {
    class CustomDecoder extends RowDecoder {
      decode() {
        return 'custom';
      }
    }
    const custom = new CustomDecoder();
    expect(resolveRowDecoder({ rowDecoder: custom })).toBe(custom);
  });

  it('should let an explicit rowDecoder win over objectRows', () => {
    expect(resolveRowDecoder({ objectRows: true, rowDecoder: 'array' })).toBe(
      DEFAULT_ARRAY_ROW_DECODER,
    );
  });
});

describe('resolveRowType()', () => {
  it("should report 'array' / 'object' for the built-in decoders", () => {
    expect(resolveRowType({})).toStrictEqual('array');
    expect(resolveRowType({ objectRows: true })).toStrictEqual('object');
    expect(resolveRowType({ rowDecoder: 'object' })).toStrictEqual('object');
  });

  it("should report 'custom' for a user-supplied RowDecoder", () => {
    class CustomDecoder extends RowDecoder {
      decode() {
        return undefined;
      }
    }
    expect(resolveRowType({ rowDecoder: new CustomDecoder() })).toStrictEqual(
      'custom',
    );
  });

  it('should let a subclass of a built-in keep its shape', () => {
    // Subclassing to hook decode() without changing what comes out -
    // the rows really are arrays, and saying 'custom' would throw that
    // away. This is also what an `instanceof` test used to answer, so
    // nothing here moved.
    class Counting extends ArrayRowDecoder {
      calls = 0;
      override decode(
        parsers: AnyParseFunction[],
        data: Buffer,
        columnCount: number,
        options: any,
      ): any[] {
        this.calls++;
        return super.decode(parsers, data, columnCount, options);
      }
    }
    expect(resolveRowType({ rowDecoder: new Counting() })).toStrictEqual(
      'array',
    );
  });

  it('should let a subclass that changes the shape say so', () => {
    // The case an `instanceof` test got wrong: a decoder that hands
    // back a lazy view rather than a plain array is not an 'array', and
    // a caller indexing it because the result said so would be reading
    // the wrong thing.
    class Lazy extends ArrayRowDecoder {
      override readonly rowType = 'custom' as const;
      override decode(): any {
        return { get: () => undefined };
      }
    }
    expect(resolveRowType({ rowDecoder: new Lazy() })).toStrictEqual('custom');
  });

  it('should report what the decoder says, whoever built it', () => {
    // A fresh instance of a built-in is still that built-in - the
    // answer comes from the object, not from which instance it is.
    expect(
      resolveRowType({ rowDecoder: new ObjectRowDecoder() }),
    ).toStrictEqual('object');
    expect(new ArrayRowDecoder().rowType).toStrictEqual('array');
  });
});
