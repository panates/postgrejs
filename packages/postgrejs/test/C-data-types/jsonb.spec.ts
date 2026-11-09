import { expect } from 'expect';
import { BindParam, Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const toStringArray = arr => arr.map(o => (o ? JSON.stringify(o) : null));

describe('DataType: jsonb', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "jsonb" field (text)', async () => {
    const output = [{ a: 1 }, { a: 2 }];
    const input = toStringArray(output);
    await testParse(conn, DataTypeOIDs.jsonb, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "jsonb" field (binary)', async () => {
    const output = [{ a: 1 }, { a: 2 }];
    const input = toStringArray(output);
    await testParse(conn, DataTypeOIDs.jsonb, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "jsonb" array field (text)', async () => {
    const output = [
      [
        [{ a: 1 }, { a: 2 }, null],
        [{ a: 3 }, { a: 4 }, null],
      ],
      [
        [{ a: 5 }, { a: 6 }, { a: 7 }],
        [null, { a: 8 }, null],
      ],
    ];
    const input = toStringArray(output);
    await testParse(conn, DataTypeOIDs._json, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "jsonb" array field (binary)', async () => {
    const output = [
      [
        [{ a: 1 }, { a: 2 }, null],
        [{ a: 3 }, { a: 4 }, null],
      ],
      [
        [{ a: 5 }, { a: 6 }, { a: 7 }],
        [null, { a: 8 }, null],
      ],
    ];
    const input = toStringArray(output);
    await testParse(conn, DataTypeOIDs._json, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "jsonb" param', async () => {
    const input = [{ a: 1 }, { a: 2 }];
    await testEncode(conn, DataTypeOIDs.jsonb, input, input);
  });

  it('should encode "jsonb" array param', async () => {
    const input = [
      [
        [{ a: 1 }, { a: 2 }],
        [{ a: 3 }, { a: 4 }],
      ],
      [
        [{ a: 5 }, { a: 6 }, { a: 7 }],
        [null, { a: 8 }],
      ],
    ];
    const output = [
      [
        [{ a: 1 }, { a: 2 }, null],
        [{ a: 3 }, { a: 4 }, null],
      ],
      [
        [{ a: 5 }, { a: 6 }, { a: 7 }],
        [null, { a: 8 }, null],
      ],
    ];
    await testEncode(conn, DataTypeOIDs._json, input, output);
  });

  it('should encode a "jsonb" given as JSON text or a scalar', async () => {
    // encodeText used to prepend the binary format's version header here,
    // which put a NUL byte in a text parameter and the server refused it
    // with "invalid byte sequence for encoding UTF8: 0x00".
    for (const [input, expected] of [
      ['{"x":true}', { x: true }],
      [42, 42],
      [true, true],
    ] as [any, any][]) {
      const r = await conn.query('select $1::jsonb as v', {
        params: [new BindParam(DataTypeOIDs.jsonb, input)],
      });
      expect(r.rows?.[0][0]).toStrictEqual(expected);
    }
  });
});
