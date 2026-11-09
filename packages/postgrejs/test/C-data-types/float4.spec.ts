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

  it('should answer the same number in both wire formats', async () => {
    // A float4 widens into a double that spells its binary approximation
    // out in full: 1.1 read back as 1.100000023841858 over the binary
    // format while the text format - shortened by the server before it is
    // sent - said 1.1. The two tests above happen to use 1.25 and -2.5,
    // which are exact in float4 and so never showed it.
    const input = ['1.1', '0.1', '3.14159', '12345.678', '1e-7'];
    const output = [1.1, 0.1, 3.14159, 12345.678, 1e-7];
    for (const columnFormat of [DataFormat.text, DataFormat.binary]) {
      await testParse(conn, DataTypeOIDs.float4, input, output, {
        columnFormat,
      });
    }
  });

  it('should keep an integer past 2^24 exact', async () => {
    // Integers are their own shortest form only while float4 holds them
    // exactly; 1e20 widens to 100000002004087730000 and has to be
    // shortened like any other value.
    const input = ['16777216', '1e20'];
    const output = [16777216, 1e20];
    for (const columnFormat of [DataFormat.text, DataFormat.binary]) {
      await testParse(conn, DataTypeOIDs.float4, input, output, {
        columnFormat,
      });
    }
  });

  it('should parse "NaN"/"Infinity"/"-Infinity" (binary)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.float4,
      ['NaN', 'Infinity', '-Infinity'],
      [NaN, Infinity, -Infinity],
      { columnFormat: DataFormat.binary },
    );
  });

  it('should parse "NaN"/"Infinity"/"-Infinity" (text)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.float4,
      ['NaN', 'Infinity', '-Infinity'],
      [NaN, Infinity, -Infinity],
      { columnFormat: DataFormat.text },
    );
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
    // Values not exactly representable in 32 bits come back as the
    // shortest decimal that reads back as the stored float4 - the same
    // number the server prints - rather than the double that spells its
    // binary approximation out in full.
    const output = [
      [
        [-1.25, 5.25, null],
        [0.8, 150.4, null],
      ],
      [
        [-10.6, 500.4, 0],
        [null, 2.5, null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._float4, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "float4" param', async () => {
    await testEncode(conn, DataTypeOIDs.float4, [-1.2, 5.5], [-1.2, 5.5]);
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
    // Values not exactly representable in 32 bits come back as the
    // shortest decimal that reads back as the stored float4 - the same
    // number the server prints - rather than the double that spells its
    // binary approximation out in full.
    const output = [
      [
        [-1.25, 5.25, null],
        [0.9, 150.43, null],
      ],
      [
        [-10.6, 500.42, 0],
        [null, 2.53, null],
      ],
    ];
    await testEncode(conn, DataTypeOIDs._float4, input, output);
  });
});
