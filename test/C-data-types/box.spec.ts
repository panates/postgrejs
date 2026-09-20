import { Box, Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: box', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "box" field (text)', async () => {
    const input = [
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      new Box(4.6, 3, -1.6, 0.1),
      new Box(4.6, 9.7, 4.2, 3.5),
      new Box(10.24, 40.1, 4.6, 8.2),
    ];
    await testParse(conn, DataTypeOIDs.box, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "box" field (binary)', async () => {
    const input = [
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      new Box(4.6, 3, -1.6, 0.1),
      new Box(4.6, 9.7, 4.2, 3.5),
      new Box(10.24, 40.1, 4.6, 8.2),
    ];
    await testParse(conn, DataTypeOIDs.box, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "box" array field (text)', async () => {
    const input = [
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      new Box(4.6, 3, -1.6, 0.1),
      new Box(4.6, 9.7, 4.2, 3.5),
      new Box(10.24, 40.1, 4.6, 8.2),
    ];
    await testParse(conn, DataTypeOIDs._box, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "box" array field (binary)', async () => {
    const input = [
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      new Box(4.6, 3, -1.6, 0.1),
      new Box(4.6, 9.7, 4.2, 3.5),
      new Box(10.24, 40.1, 4.6, 8.2),
    ];
    await testParse(conn, DataTypeOIDs._box, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "box" param', async () => {
    const input = [
      new Box(-1.6, 3, 4.6, 0.1),
      new Box(4.2, 3.5, 4.6, 9.7),
      new Box(10.24, 40.1, 4.6, 8.2),
    ];
    const output = [
      new Box(4.6, 3, -1.6, 0.1),
      new Box(4.6, 9.7, 4.2, 3.5),
      new Box(10.24, 40.1, 4.6, 8.2),
    ];
    await testEncode(conn, DataTypeOIDs.box, input, output);
  });

  it('should encode "box" array param', async () => {
    const input = [
      new Box(-1.6, 3, 4.6, 0.1),
      new Box(4.2, 3.5, 4.6, 9.7),
      new Box(10.24, 40.1, 4.6, 8.2),
    ];
    const output = [
      new Box(4.6, 3, -1.6, 0.1),
      new Box(4.6, 9.7, 4.2, 3.5),
      new Box(10.24, 40.1, 4.6, 8.2),
    ];
    await testEncode(conn, DataTypeOIDs._box, input, output);
  });
});
