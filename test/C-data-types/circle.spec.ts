import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: circle', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "circle" field (text)', async () => {
    const input = [
      '<(-1.2, 3.5), 4.6>',
      '((1.2, 3.5), 4.5)',
      '(6.2, -3.0), 7.2',
      '1.1, 3.9, 8.6',
    ];
    const output = [
      { x: -1.2, y: 3.5, r: 4.6 },
      { x: 1.2, y: 3.5, r: 4.5 },
      { x: 6.2, y: -3, r: 7.2 },
      { x: 1.1, y: 3.9, r: 8.6 },
    ];
    await testParse(conn, DataTypeOIDs.circle, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "circle" field (binary)', async () => {
    const input = [
      '<(-1.2, 3.5), 4.6>',
      '((1.2, 3.5), 4.5)',
      '(6.2, -3.0), 7.2',
      '1.1, 3.9, 8.6',
    ];
    const output = [
      { x: -1.2, y: 3.5, r: 4.6 },
      { x: 1.2, y: 3.5, r: 4.5 },
      { x: 6.2, y: -3, r: 7.2 },
      { x: 1.1, y: 3.9, r: 8.6 },
    ];
    await testParse(conn, DataTypeOIDs.circle, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "circle" array field (text)', async () => {
    const input = [
      '<(-1.2, 3.5), 4.6>',
      '((1.2, 3.5), 4.5)',
      '(6.2, -3.0), 7.2',
      '1.1, 3.9, 8.6',
    ];
    const output = [
      { x: -1.2, y: 3.5, r: 4.6 },
      { x: 1.2, y: 3.5, r: 4.5 },
      { x: 6.2, y: -3, r: 7.2 },
      { x: 1.1, y: 3.9, r: 8.6 },
    ];
    await testParse(conn, DataTypeOIDs._circle, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "circle" array field (binary)', async () => {
    const input = [
      '<(-1.2, 3.5), 4.6>',
      '((1.2, 3.5), 4.5)',
      '(6.2, -3.0), 7.2',
      '1.1, 3.9, 8.6',
    ];
    const output = [
      { x: -1.2, y: 3.5, r: 4.6 },
      { x: 1.2, y: 3.5, r: 4.5 },
      { x: 6.2, y: -3, r: 7.2 },
      { x: 1.1, y: 3.9, r: 8.6 },
    ];
    await testParse(conn, DataTypeOIDs._circle, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "circle" param', async () => {
    const input = [
      { x: -1.2, y: 3.5, r: 4.6 },
      { x: 1.2, y: 3.5, r: 4.5 },
      { x: 6.2, y: -3, r: 7.2 },
      { x: 1.1, y: 3.9, r: 8.6 },
    ];
    await testEncode(conn, DataTypeOIDs.circle, input, input);
  });

  it('should encode "circle" array param', async () => {
    const input = [
      { x: -1.2, y: 3.5, r: 4.6 },
      { x: 1.2, y: 3.5, r: 4.5 },
      { x: 6.2, y: -3, r: 7.2 },
      { x: 1.1, y: 3.9, r: 8.6 },
    ];
    await testEncode(conn, DataTypeOIDs._circle, input);
  });
});
