import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: uuid', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "uuid" field (text)', async () => {
    const input = [
      '87d48838-02b3-4e26-8fec-bcc8c00e3772',
      '2f3e45ba-3a13-4726-8a1b-3e3e3bb04836',
      '9d0c1257-7dbf-44a2-98ca-282083e0294c',
    ];
    await testParse(conn, DataTypeOIDs.uuid, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "uuid" field (binary)', async () => {
    const input = [
      '87d48838-02b3-4e26-8fec-bcc8c00e3772',
      '2f3e45ba-3a13-4726-8a1b-3e3e3bb04836',
      '9d0c1257-7dbf-44a2-98ca-282083e0294c',
    ];
    await testParse(conn, DataTypeOIDs.uuid, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "uuid" array field (text)', async () => {
    const input = [
      '87d48838-02b3-4e26-8fec-bcc8c00e3772',
      '2f3e45ba-3a13-4726-8a1b-3e3e3bb04836',
      '9d0c1257-7dbf-44a2-98ca-282083e0294c',
    ];
    await testParse(conn, DataTypeOIDs._uuid, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "uuid" array field (binary)', async () => {
    const input = [
      '87d48838-02b3-4e26-8fec-bcc8c00e3772',
      '2f3e45ba-3a13-4726-8a1b-3e3e3bb04836',
      '9d0c1257-7dbf-44a2-98ca-282083e0294c',
    ];
    await testParse(conn, DataTypeOIDs._uuid, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "uuid" param', async () => {
    const input = [
      '87d48838-02b3-4e26-8fec-bcc8c00e3772',
      '2f3e45ba-3a13-4726-8a1b-3e3e3bb04836',
      '9d0c1257-7dbf-44a2-98ca-282083e0294c',
    ];
    await testEncode(conn, DataTypeOIDs.uuid, input, input);
  });

  it('should encode "uuid" array param', async () => {
    const input = [
      '87d48838-02b3-4e26-8fec-bcc8c00e3772',
      '2f3e45ba-3a13-4726-8a1b-3e3e3bb04836',
      '9d0c1257-7dbf-44a2-98ca-282083e0294c',
    ];
    await testEncode(conn, DataTypeOIDs._uuid, input, input);
  });
});
