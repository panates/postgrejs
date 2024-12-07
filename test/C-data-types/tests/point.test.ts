import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "point" field (text)', async () => {
    const input = ['(-1.2, 3.5)', '2.1, 6.3'];
    const output = [
      { x: -1.2, y: 3.5 },
      { x: 2.1, y: 6.3 },
    ];
    await testParse(conn(), DataTypeOIDs.point, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "point" field (binary)', async () => {
    const input = ['(-1.2, 3.5)', '2.1, 6.3'];
    const output = [
      { x: -1.2, y: 3.5 },
      { x: 2.1, y: 6.3 },
    ];
    await testParse(conn(), DataTypeOIDs.point, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "point" array field (text)', async () => {
    const input = ['(-1.2, 3.5)', '2.1, 6.3'];
    const output = [
      { x: -1.2, y: 3.5 },
      { x: 2.1, y: 6.3 },
    ];
    await testParse(conn(), DataTypeOIDs._point, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "point" array field (binary)', async () => {
    const input = ['(-1.2, 3.5)', '2.1, 6.3'];
    const output = [
      { x: -1.2, y: 3.5 },
      { x: 2.1, y: 6.3 },
    ];
    await testParse(conn(), DataTypeOIDs._point, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "point" param', async () => {
    const input = [
      { x: -1.2, y: 3.5 },
      { x: 2.1, y: 6.3 },
    ];
    await testEncode(conn(), DataTypeOIDs.point, input, input);
  });

  it('should encode "point" array param', async () => {
    const input = [
      { x: -1.2, y: 3.5 },
      { x: 2.1, y: 6.3 },
    ];
    await testEncode(conn(), DataTypeOIDs._point, input);
  });
}
