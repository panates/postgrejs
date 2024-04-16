import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "box" field (text)', async function () {
    const input = ['((-1.6, 3.0), (4.6, 0.1))', '(4.2, 3.5), (4.6, 9.7)', '10.24, 40.1, 4.6, 8.2'];
    const output = [
      { x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 },
      { x1: 4.6, y1: 9.7, x2: 4.2, y2: 3.5 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testParse(conn(), DataTypeOIDs.box, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "box" field (binary)', async function () {
    const input = ['((-1.6, 3.0), (4.6, 0.1))', '(4.2, 3.5), (4.6, 9.7)', '10.24, 40.1, 4.6, 8.2'];
    const output = [
      { x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 },
      { x1: 4.6, y1: 9.7, x2: 4.2, y2: 3.5 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testParse(conn(), DataTypeOIDs.box, input, output, { columnFormat: DataFormat.binary });
  });

  it('should parse "box" array field (text)', async function () {
    const input = ['((-1.6, 3.0), (4.6, 0.1))', '(4.2, 3.5), (4.6, 9.7)', '10.24, 40.1, 4.6, 8.2'];
    const output = [
      { x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 },
      { x1: 4.6, y1: 9.7, x2: 4.2, y2: 3.5 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testParse(conn(), DataTypeOIDs._box, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "box" array field (binary)', async function () {
    const input = ['((-1.6, 3.0), (4.6, 0.1))', '(4.2, 3.5), (4.6, 9.7)', '10.24, 40.1, 4.6, 8.2'];
    const output = [
      { x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 },
      { x1: 4.6, y1: 9.7, x2: 4.2, y2: 3.5 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testParse(conn(), DataTypeOIDs._box, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "box" param', async function () {
    const input = [
      { x1: -1.6, y1: 3, x2: 4.6, y2: 0.1 },
      { x1: 4.2, y1: 3.5, x2: 4.6, y2: 9.7 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    const output = [
      { x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 },
      { x1: 4.6, y1: 9.7, x2: 4.2, y2: 3.5 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testEncode(conn(), DataTypeOIDs.box, input, output);
  });

  it('should encode "box" array param', async function () {
    const input = [
      { x1: -1.6, y1: 3, x2: 4.6, y2: 0.1 },
      { x1: 4.2, y1: 3.5, x2: 4.6, y2: 9.7 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    const output = [
      { x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 },
      { x1: 4.6, y1: 9.7, x2: 4.2, y2: 3.5 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testEncode(conn(), DataTypeOIDs._box, input, output);
  });
}
