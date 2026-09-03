import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: float4', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "float4" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.float4, ['1.2', '-2.5'], [1.2, -2.5], {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "float4" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.float4, ['1.25', '-2.5'], [1.25, -2.5], {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "float4" array field (text)', async () => {
    const input = [
      [
        [-1.2, 2.5, null],
        [1.2, 2.5, null],
      ],
      [
        [-10.6, 4.5, 0],
        [null, 6.5, null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._float4, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "float4" array field (binary)', async () => {
    const input = [
      [
        [-1.25, 5.25, null],
        [0.8, 150.4, null],
      ],
      [
        [-10.6, 500.4, 0],
        [null, 2.5, null],
      ],
    ];
    // float4 is IEEE754 single-precision; values not exactly representable
    // in 32 bits come back widened to the nearest float4 value.
    const output = [
      [
        [Math.fround(-1.25), Math.fround(5.25), null],
        [Math.fround(0.8), Math.fround(150.4), null],
      ],
      [
        [Math.fround(-10.6), Math.fround(500.4), 0],
        [null, Math.fround(2.5), null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._float4, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "float4" param', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.float4,
      [-1.2, 5.5],
      [Math.fround(-1.2), Math.fround(5.5)],
    );
  });

  it('should encode "float4" array param', async () => {
    const input = [
      [
        [-1.25, 5.25],
        [0.9, 150.43],
      ],
      [
        [-10.6, 500.42, 0],
        [null, 2.53],
      ],
    ];
    // float4 is IEEE754 single-precision; values not exactly representable
    // in 32 bits come back widened to the nearest float4 value.
    const output = [
      [
        [Math.fround(-1.25), Math.fround(5.25), null],
        [Math.fround(0.9), Math.fround(150.43), null],
      ],
      [
        [Math.fround(-10.6), Math.fround(500.42), 0],
        [null, Math.fround(2.53), null],
      ],
    ];
    await testEncode(conn, DataTypeOIDs._float4, input, output);
  });
});
