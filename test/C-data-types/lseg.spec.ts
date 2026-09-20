import { Connection, DataFormat, DataTypeOIDs, LineSegment } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: lseg', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "lseg" field (text)', async () => {
    const input = [
      '[(1.2, 3.5), (4.6, 5.2)]',
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      new LineSegment(1.2, 3.5, 4.6, 5.2),
      new LineSegment(-1.6, 3, 4.6, 0.1),
      new LineSegment(4.2, 3.5, 4.6, 9.7),
      new LineSegment(10.24, 40.1, 4.6, 8.2),
    ];
    await testParse(conn, DataTypeOIDs.lseg, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "lseg" field (binary)', async () => {
    const input = [
      '[(1.2, 3.5), (4.6, 5.2)]',
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      new LineSegment(1.2, 3.5, 4.6, 5.2),
      new LineSegment(-1.6, 3, 4.6, 0.1),
      new LineSegment(4.2, 3.5, 4.6, 9.7),
      new LineSegment(10.24, 40.1, 4.6, 8.2),
    ];
    await testParse(conn, DataTypeOIDs.lseg, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "lseg" array field (text)', async () => {
    const input = [
      '[(1.2, 3.5), (4.6, 5.2)]',
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      new LineSegment(1.2, 3.5, 4.6, 5.2),
      new LineSegment(-1.6, 3, 4.6, 0.1),
      new LineSegment(4.2, 3.5, 4.6, 9.7),
      new LineSegment(10.24, 40.1, 4.6, 8.2),
    ];
    await testParse(conn, DataTypeOIDs._lseg, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "lseg" array field (binary)', async () => {
    const input = [
      '[(1.2, 3.5), (4.6, 5.2)]',
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      new LineSegment(1.2, 3.5, 4.6, 5.2),
      new LineSegment(-1.6, 3, 4.6, 0.1),
      new LineSegment(4.2, 3.5, 4.6, 9.7),
      new LineSegment(10.24, 40.1, 4.6, 8.2),
    ];
    await testParse(conn, DataTypeOIDs._lseg, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "lseg" param', async () => {
    const input = [
      new LineSegment(1.2, 3.5, 4.6, 5.2),
      new LineSegment(-1.6, 3, 4.6, 0.1),
      new LineSegment(4.2, 3.5, 4.6, 9.7),
      new LineSegment(10.24, 40.1, 4.6, 8.2),
    ];
    await testEncode(conn, DataTypeOIDs.lseg, input, input);
  });

  it('should encode "lseg" array param', async () => {
    const input = [
      new LineSegment(1.2, 3.5, 4.6, 5.2),
      new LineSegment(-1.6, 3, 4.6, 0.1),
      new LineSegment(4.2, 3.5, 4.6, 9.7),
      new LineSegment(10.24, 40.1, 4.6, 8.2),
    ];
    await testEncode(conn, DataTypeOIDs._lseg, input);
  });
});
