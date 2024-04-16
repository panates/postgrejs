import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "bytea" field (text)', async function () {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [Buffer.from([65, 66, 67, 68, 69]), Buffer.from([70, 71, 72, 73, 74])];
    await testParse(conn(), DataTypeOIDs.bytea, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "bytea" field (binary)', async function () {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [Buffer.from([65, 66, 67, 68, 69]), Buffer.from([70, 71, 72, 73, 74])];
    await testParse(conn(), DataTypeOIDs.bytea, input, output, { columnFormat: DataFormat.binary });
  });

  it('should parse "bytea" array field (text)', async function () {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [Buffer.from([65, 66, 67, 68, 69]), Buffer.from([70, 71, 72, 73, 74])];
    await testParse(conn(), DataTypeOIDs._bytea, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "bytea" array field (binary)', async function () {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [Buffer.from([65, 66, 67, 68, 69]), Buffer.from([70, 71, 72, 73, 74])];
    await testParse(conn(), DataTypeOIDs._bytea, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "bytea" param', async function () {
    const input = [Buffer.from([195, 158, 65, 68, 66, 69, 69, 70]), Buffer.from([195, 158, 65, 68, 66, 69, 69, 71])];
    await testEncode(conn(), DataTypeOIDs.bytea, input, input);
  });

  it('should encode "bytea" array param', async function () {
    const input = [Buffer.from([195, 158, 65, 68, 66, 69, 69, 70]), Buffer.from([195, 158, 65, 68, 66, 69, 69, 71])];
    await testEncode(conn(), DataTypeOIDs._bytea, input);
  });
}
