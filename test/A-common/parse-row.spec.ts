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

  // Rows are built by a function compiled once per fields array. These pin
  // down that it produces exactly what assigning the columns one at a time
  // did, including for the shapes it has to decline and hand back.
  it('should give every row of one result the same shape, with its own values', () => {
    const rows = [
      parseObjectRow(
        [echoParser, echoParser],
        rowBuffer(['1', 'a']),
        2,
        {},
        fields,
      ),
      parseObjectRow(
        [echoParser, echoParser],
        rowBuffer(['2', 'b']),
        2,
        {},
        fields,
      ),
      parseObjectRow(
        [echoParser, echoParser],
        rowBuffer([null, 'c']),
        2,
        {},
        fields,
      ),
    ];
    expect(rows[0]).toStrictEqual({ id: '1', name: 'a' });
    expect(rows[1]).toStrictEqual({ id: '2', name: 'b' });
    expect(rows[2]).toStrictEqual({ id: null, name: 'c' });
  });

  it("should not carry one result's column names over to another", () => {
    const other = [{ fieldName: 'x' }, { fieldName: 'y' }] as any;
    expect(
      parseObjectRow(
        [echoParser, echoParser],
        rowBuffer(['1', 'a']),
        2,
        {},
        fields,
      ),
    ).toStrictEqual({ id: '1', name: 'a' });
    expect(
      parseObjectRow(
        [echoParser, echoParser],
        rowBuffer(['2', 'b']),
        2,
        {},
        other,
      ),
    ).toStrictEqual({ x: '2', y: 'b' });
    expect(
      parseObjectRow(
        [echoParser, echoParser],
        rowBuffer(['3', 'c']),
        2,
        {},
        fields,
      ),
    ).toStrictEqual({ id: '3', name: 'c' });
  });

  it('should handle column names that need escaping', () => {
    const oddFields = [
      { fieldName: 'a "quoted" name' },
      { fieldName: "back\\slash'" },
      { fieldName: 'boşluklu ad 🎉' },
      { fieldName: '' },
    ] as any;
    const parsers = [echoParser, echoParser, echoParser, echoParser];
    const row: any = parseObjectRow(
      parsers,
      rowBuffer(['1', '2', '3', '4']),
      4,
      {},
      oddFields,
    );
    expect(row['a "quoted" name']).toStrictEqual('1');
    expect(row["back\\slash'"]).toStrictEqual('2');
    expect(row['boşluklu ad 🎉']).toStrictEqual('3');
    expect(row['']).toStrictEqual('4');
  });

  it('should keep the last value when two columns share a name', () => {
    const dupFields = [{ fieldName: 'v' }, { fieldName: 'v' }] as any;
    const row: any = parseObjectRow(
      [echoParser, echoParser],
      rowBuffer(['first', 'second']),
      2,
      {},
      dupFields,
    );
    expect(row.v).toStrictEqual('second');
  });

  it('should not let a column name escape into the compiled source', () => {
    // Column names come from the server, and the compiled factory embeds
    // them in its own source, so a name that closes the string literal
    // early would be code injection. JSON.stringify() is what prevents it -
    // including for U+2028/U+2029, which it leaves unescaped but which are
    // legal inside a string literal from ES2019 on.
    (globalThis as any).__parseRowEscaped = false;
    const nasty = [
      `a${String.fromCharCode(0x2028)}b`,
      `a${String.fromCharCode(0x2029)}b`,
      "x'],__x:((globalThis.__parseRowEscaped=true)),['y",
      'x"],__x:((globalThis.__parseRowEscaped=true)),["y',
      '*/((globalThis.__parseRowEscaped=true))/*',
      'a\\',
      'a\nb',
      `a${String.fromCharCode(0)}b`,
      '`tick`',
    ];
    for (const name of nasty) {
      const oneField = [{ fieldName: name }] as any;
      let row: any;
      // Past the threshold, so the compiled path is the one being probed.
      for (let i = 0; i < 12; i++)
        row = parseObjectRow([echoParser], rowBuffer(['val']), 1, {}, oneField);
      expect(Object.keys(row)).toStrictEqual([name]);
      expect(row[name]).toStrictEqual('val');
    }
    expect((globalThis as any).__parseRowEscaped).toStrictEqual(false);
    delete (globalThis as any).__parseRowEscaped;
  });

  it('should keep decoding correctly once a result is long enough to compile a factory', () => {
    // Short results stay on the assignment path; the compiled one only
    // takes over part-way through a longer result, so both have to produce
    // the same rows - nulls included.
    const longFields = [{ fieldName: 'id' }, { fieldName: 'name' }] as any;
    const rows: any[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(
        parseObjectRow(
          [echoParser, echoParser],
          rowBuffer([String(i), i === 11 ? null : 'x']),
          2,
          {},
          longFields,
        ),
      );
    }
    expect(rows[0]).toStrictEqual({ id: '0', name: 'x' });
    expect(rows[10]).toStrictEqual({ id: '10', name: 'x' });
    expect(rows[11]).toStrictEqual({ id: '11', name: null });
  });

  it('should stay on the assignment path for a "__proto__" column however long the result is', () => {
    // A literal key of "__proto__" would set the prototype instead of
    // adding an own property, so this shape can never be compiled - and
    // once that has been established it must not be retried per row.
    const protoFields = [
      { fieldName: '__proto__' },
      { fieldName: 'ok' },
    ] as any;
    for (let i = 0; i < 12; i++) {
      const row: any = parseObjectRow(
        [echoParser, echoParser],
        rowBuffer([String(i), 'v']),
        2,
        {},
        protoFields,
      );
      expect(
        Object.getOwnPropertyDescriptor(row, '__proto__')?.value,
      ).toStrictEqual(String(i));
      expect(row.ok).toStrictEqual('v');
    }
  });

  it('should give each result its own factory when two long results interleave', () => {
    const a = [{ fieldName: 'a1' }, { fieldName: 'a2' }] as any;
    const b = [{ fieldName: 'b1' }, { fieldName: 'b2' }] as any;
    const decode = (f: any, v: string) =>
      parseObjectRow([echoParser, echoParser], rowBuffer([v, v + v]), 2, {}, f);
    for (let i = 0; i < 10; i++) decode(a, 'x');
    for (let i = 0; i < 10; i++) decode(b, 'y');
    // Both are compiled by now, and the most recent one is b - so this
    // one has to come back to a's factory rather than reuse b's.
    expect(decode(a, 'z')).toStrictEqual({ a1: 'z', a2: 'zz' });
    expect(decode(b, 'w')).toStrictEqual({ b1: 'w', b2: 'ww' });
  });

  it('should fall back to assignment when the field count does not match the column count', () => {
    // The compiled factory is cached against the fields array alone, so it
    // can only be trusted when that array describes exactly this row - a
    // mismatch takes the assignment path rather than risk reusing a
    // factory built for a different column count.
    const row: any = parseObjectRow([echoParser], rowBuffer(['1']), 1, {}, [
      { fieldName: 'id' },
      { fieldName: 'name' },
    ] as any);
    expect(row).toStrictEqual({ id: '1' });
  });
});
