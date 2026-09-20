import { Connection, DataFormat, DataTypeOIDs, Line } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// Given as classes on both sides: testParse builds the literal with
// stringifyValueForSQL(), which writes a Line as `'{1,-1,0}'::line`.
const input = [
  new Line(1, -1, 0),
  new Line(0, 1, -5),
  new Line(1, 0, -3),
  new Line(-1.5, 2.25, 0.5),
];

describe('DataType: line', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "line" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.line, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "line" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.line, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "line" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._line, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "line" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._line, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "line" param', async () => {
    await testEncode(conn, DataTypeOIDs.line, input, input);
  });

  it('should encode "line" array param', async () => {
    await testEncode(conn, DataTypeOIDs._line, input, input);
  });

  it('should accept a plain {a, b, c}', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.line,
      [{ a: 0, b: 1, c: -5 }],
      [new Line(0, 1, -5)],
    );
  });
});
