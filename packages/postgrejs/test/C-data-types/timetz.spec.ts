import { expect } from 'expect';
import { BindParam, Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// Every value carries its own offset, so none of this depends on the
// session's time zone - which another spec leaks into the process
// (`date.spec.ts` sets PGTZ) and which this one therefore does not read.
const input = [
  '12:34:56+03',
  '12:34:56-05:30',
  '00:00:00+00',
  '23:59:59.999999+14',
  '24:00:00+00',
  '12:34:56+03:00:30',
];

describe('DataType: timetz', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "timetz" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.timetz, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "timetz" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.timetz, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "timetz" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._timetz, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "timetz" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._timetz, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "timetz" param', async () => {
    await testEncode(conn, DataTypeOIDs.timetz, input, input);
  });

  it('should encode "timetz" array param', async () => {
    await testEncode(conn, DataTypeOIDs._timetz, input, input);
  });

  it('should accept the spellings the server accepts', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.timetz,
      ['1:2:3+3', '12:34:56+0330', '12:34+03', '12:34:56Z'],
      ['01:02:03+03', '12:34:56+03:30', '12:34:00+03', '12:34:56+00'],
    );
  });

  it('should send a Date as the time it reads in its own zone', async () => {
    const d = new Date(Date.UTC(1970, 0, 1, 12, 34, 56, 789));
    await testEncode(conn, DataTypeOIDs.timetz, [d], ['12:34:56.789+00'], {
      utcDates: true,
    });
  });

  it('should refuse a string with no offset rather than guess one', async () => {
    // The server resolves a bare time against its session zone, and the
    // text path still lets it - only the binary encoder, which has to
    // write the offset itself, has to say no.
    await expect(
      conn.query('select $1 as f', {
        params: [new BindParam(DataTypeOIDs.timetz, '12:34:56')],
      }),
    ).rejects.toThrow('has no time zone offset');
  });
});
