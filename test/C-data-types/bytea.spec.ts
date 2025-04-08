import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: bytea', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "bytea" field (text)', async () => {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [
      Buffer.from([65, 66, 67, 68, 69]),
      Buffer.from([70, 71, 72, 73, 74]),
    ];
    await testParse(conn, DataTypeOIDs.bytea, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "bytea" field (binary)', async () => {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [
      Buffer.from([65, 66, 67, 68, 69]),
      Buffer.from([70, 71, 72, 73, 74]),
    ];
    await testParse(conn, DataTypeOIDs.bytea, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "bytea" array field (text)', async () => {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [
      Buffer.from([65, 66, 67, 68, 69]),
      Buffer.from([70, 71, 72, 73, 74]),
    ];
    await testParse(conn, DataTypeOIDs._bytea, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "bytea" array field (binary)', async () => {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [
      Buffer.from([65, 66, 67, 68, 69]),
      Buffer.from([70, 71, 72, 73, 74]),
    ];
    await testParse(conn, DataTypeOIDs._bytea, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "bytea" param', async () => {
    const input = [
      Buffer.from([195, 158, 65, 68, 66, 69, 69, 70]),
      Buffer.from([195, 158, 65, 68, 66, 69, 69, 71]),
    ];
    await testEncode(conn, DataTypeOIDs.bytea, input, input);
  });

  it('should encode "bytea" array param', async () => {
    const input = [
      Buffer.from([195, 158, 65, 68, 66, 69, 69, 70]),
      Buffer.from([195, 158, 65, 68, 66, 69, 69, 71]),
    ];
    await testEncode(conn, DataTypeOIDs._bytea, input);
  });
});
