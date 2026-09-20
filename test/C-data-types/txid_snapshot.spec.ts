import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = ['10:20:', '10:20:12,15', '1:1:'];

describe('DataType: txid_snapshot', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "txid_snapshot" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.txid_snapshot, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "txid_snapshot" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.txid_snapshot, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "txid_snapshot" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._txid_snapshot, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "txid_snapshot" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._txid_snapshot, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "txid_snapshot" param', async () => {
    await testEncode(conn, DataTypeOIDs.txid_snapshot, input, input);
  });

  it('should encode "txid_snapshot" array param', async () => {
    await testEncode(conn, DataTypeOIDs._txid_snapshot, input, input);
  });
});
