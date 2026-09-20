import { Connection, DataFormat, DataTypeOIDs, Path, Point } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// See line.spec.ts: the parse tests are given the literal and check the
// class that comes back.
const input = [
  '((1,2),(3,4))',
  '[(1,2),(3,4)]',
  '((1,2))',
  '[(-1.5,2.25),(3,4),(5,6)]',
];
const output = [
  new Path([new Point(1, 2), new Point(3, 4)]),
  new Path([new Point(1, 2), new Point(3, 4)], false),
  new Path([new Point(1, 2)]),
  new Path([new Point(-1.5, 2.25), new Point(3, 4), new Point(5, 6)], false),
];

describe('DataType: path', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "path" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.path, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "path" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.path, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "path" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._path, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "path" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._path, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "path" param', async () => {
    await testEncode(conn, DataTypeOIDs.path, output, output);
  });

  it('should encode "path" array param', async () => {
    await testEncode(conn, DataTypeOIDs._path, output, output);
  });

  it('should keep open and closed apart through the server', async () => {
    // The flag is part of the value: the same points cast back to two
    // different literals.
    const r = await conn.query('select ($1)::text a, ($2)::text b', {
      params: [
        new Path([new Point(1, 2), new Point(3, 4)]),
        new Path([new Point(1, 2), new Point(3, 4)], false),
      ],
    });
    const [closed, open] = r.rows![0];
    if (closed !== '((1,2),(3,4))' || open !== '[(1,2),(3,4)]')
      throw new Error(`got ${closed} and ${open}`);
  });

  it('should accept a plain array of points, closed by default', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.path,
      [
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      ],
      [new Path([new Point(1, 2), new Point(3, 4)])],
    );
  });
});
