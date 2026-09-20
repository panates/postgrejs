import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// `bit` with no length means `bit(1)`, and a cast to it truncates - so
// the values parsed through `::bit` here are single bits by necessity,
// not because the codec is limited to them. Longer ones go through the
// encode tests below, where the parameter's type carries no length, and
// through varbit.spec.ts, which shares this type's codec.
const input = ['1', '0'];

describe('DataType: bit', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "bit" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.bit, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "bit" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.bit, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "bit" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._bit, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "bit" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._bit, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "bit" param', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.bit,
      ['1', '0', '1010', '111111111'],
      ['1', '0', '1010', '111111111'],
    );
  });

  it('should encode "bit" array param', async () => {
    await testEncode(conn, DataTypeOIDs._bit, input, input);
  });
});
