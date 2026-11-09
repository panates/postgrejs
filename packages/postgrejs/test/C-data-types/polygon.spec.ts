import {
  Connection,
  DataFormat,
  DataTypeOIDs,
  Point,
  Polygon,
} from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// See line.spec.ts: classes on both sides.
const input = [
  new Polygon([new Point(1, 2), new Point(3, 4), new Point(5, 6)]),
  new Polygon([new Point(1, 2)]),
  new Polygon([new Point(-1.5, 2.25), new Point(3, 4)]),
];

describe('DataType: polygon', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "polygon" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.polygon, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "polygon" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.polygon, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "polygon" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._polygon, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "polygon" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._polygon, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "polygon" param', async () => {
    await testEncode(conn, DataTypeOIDs.polygon, input, input);
  });

  it('should encode "polygon" array param', async () => {
    await testEncode(conn, DataTypeOIDs._polygon, input, input);
  });

  it('should accept a plain array of points', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.polygon,
      [
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      ],
      [new Polygon([new Point(1, 2), new Point(3, 4)])],
    );
  });
});
