import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "time" field (text)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00'), new Date('1970-01-01T10:30:12')];
    await testParse(conn(), DataTypeOIDs.time, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "time" field (text, utcDates)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00Z'), new Date('1970-01-01T10:30:12Z')];
    await testParse(conn(), DataTypeOIDs.time, input, output, { columnFormat: DataFormat.text }, { utcDates: true });
  });

  it('should parse "time" field (text, fetchAsString)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = ['10:30:00', '10:30:12'];
    await testParse(
      conn(),
      DataTypeOIDs.time,
      input,
      output,
      { columnFormat: DataFormat.text },
      { fetchAsString: [DataTypeOIDs.time] },
    );
  });

  it('should parse "time" field (binary)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00'), new Date('1970-01-01T10:30:12')];
    await testParse(conn(), DataTypeOIDs.time, input, output, { columnFormat: DataFormat.binary });
  });

  it('should parse "time" field (binary, utcDates)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00Z'), new Date('1970-01-01T10:30:12Z')];
    await testParse(conn(), DataTypeOIDs.time, input, output, { columnFormat: DataFormat.binary }, { utcDates: true });
  });

  it('should parse "time" field (binary, fetchAsString)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = ['10:30:00', '10:30:12'];
    await testParse(
      conn(),
      DataTypeOIDs.time,
      input,
      output,
      { columnFormat: DataFormat.binary },
      { fetchAsString: [DataTypeOIDs.time] },
    );
  });

  it('should parse "time" array field (text)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00'), new Date('1970-01-01T10:30:12')];
    await testParse(conn(), DataTypeOIDs._time, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "time" array field (binary)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00'), new Date('1970-01-01T10:30:12')];
    await testParse(conn(), DataTypeOIDs._time, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "time" param', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00'), new Date('1970-01-01T10:30:12')];
    await testEncode(conn(), DataTypeOIDs.time, input, output);
  });

  it('should encode "time" param (utcDates)', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00Z'), new Date('1970-01-01T10:30:12Z')];
    await testEncode(conn(), DataTypeOIDs.time, input, output, { utcDates: true });
  });

  it('should encode array "time" param', async function () {
    const input = ['10:30', '10:30:12'];
    const output = [new Date('1970-01-01T10:30:00'), new Date('1970-01-01T10:30:12')];
    await testEncode(conn(), DataTypeOIDs._time, input, output);
  });
}
