import { Connection, DataFormat, DataTypeOIDs, Line } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// testParse builds the SQL literal with stringifyValueForSQL(), which
// sends any object to ::json - so the parse tests are given the literal
// and check the class that comes back, as every geometric spec does.
const input = ['{1,-1,0}', '{0,1,-5}', '{1,0,-3}', '{-1.5,2.25,0.5}'];
const output = [
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
    await testParse(conn, DataTypeOIDs.line, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "line" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.line, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "line" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._line, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "line" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._line, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "line" param', async () => {
    await testEncode(conn, DataTypeOIDs.line, output, output);
  });

  it('should encode "line" array param', async () => {
    await testEncode(conn, DataTypeOIDs._line, output, output);
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
