import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "lseg" field (text)', async function () {
    const input = [
      '[(1.2, 3.5), (4.6, 5.2)]',
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      { x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 },
      { x1: -1.6, y1: 3, x2: 4.6, y2: 0.1 },
      { x1: 4.2, y1: 3.5, x2: 4.6, y2: 9.7 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testParse(conn(), DataTypeOIDs.lseg, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "lseg" field (binary)', async function () {
    const input = [
      '[(1.2, 3.5), (4.6, 5.2)]',
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      { x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 },
      { x1: -1.6, y1: 3, x2: 4.6, y2: 0.1 },
      { x1: 4.2, y1: 3.5, x2: 4.6, y2: 9.7 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testParse(conn(), DataTypeOIDs.lseg, input, output, { columnFormat: DataFormat.binary });
  });

  it('should parse "lseg" array field (text)', async function () {
    const input = [
      '[(1.2, 3.5), (4.6, 5.2)]',
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      { x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 },
      { x1: -1.6, y1: 3, x2: 4.6, y2: 0.1 },
      { x1: 4.2, y1: 3.5, x2: 4.6, y2: 9.7 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testParse(conn(), DataTypeOIDs._lseg, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "lseg" array field (binary)', async function () {
    const input = [
      '[(1.2, 3.5), (4.6, 5.2)]',
      '((-1.6, 3.0), (4.6, 0.1))',
      '(4.2, 3.5), (4.6, 9.7)',
      '10.24, 40.1, 4.6, 8.2',
    ];
    const output = [
      { x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 },
      { x1: -1.6, y1: 3, x2: 4.6, y2: 0.1 },
      { x1: 4.2, y1: 3.5, x2: 4.6, y2: 9.7 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testParse(conn(), DataTypeOIDs._lseg, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "lseg" param', async function () {
    const input = [
      { x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 },
      { x1: -1.6, y1: 3, x2: 4.6, y2: 0.1 },
      { x1: 4.2, y1: 3.5, x2: 4.6, y2: 9.7 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testEncode(conn(), DataTypeOIDs.lseg, input, input);
  });

  it('should encode "lseg" array param', async function () {
    const input = [
      { x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 },
      { x1: -1.6, y1: 3, x2: 4.6, y2: 0.1 },
      { x1: 4.2, y1: 3.5, x2: 4.6, y2: 9.7 },
      { x1: 10.24, y1: 40.1, x2: 4.6, y2: 8.2 },
    ];
    await testEncode(conn(), DataTypeOIDs._lseg, input);
  });
}
