import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "date" field (text)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T00:00:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs.date, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "date" field (text, utcDates)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T00:00:00Z'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs.date, input, output, { columnFormat: DataFormat.text }, { utcDates: true });
  });

  it('should parse "date" field (text, fetchAsString)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', 'epoch', 'infinity', '-infinity'];
    const output = ['2020-10-22', '2020-10-22', '1970-01-01', 'infinity', '-infinity'];
    await testParse(
      conn(),
      DataTypeOIDs.date,
      input,
      output,
      { columnFormat: DataFormat.text },
      { fetchAsString: [DataTypeOIDs.date] },
    );
  });

  it('should parse "date" field (binary)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T00:00:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs.date, input, output, { columnFormat: DataFormat.binary });
  });

  it('should parse "date" field (binary, utcDates)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00Z', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T00:00:00Z'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs.date, input, output, { columnFormat: DataFormat.binary }, { utcDates: true });
  });

  it('should parse "date" field (binary, fetchAsString)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', 'epoch', 'infinity', '-infinity'];
    const output = ['2020-10-22', '2020-10-22', '1970-01-01', 'infinity', '-infinity'];
    await testParse(
      conn(),
      DataTypeOIDs.date,
      input,
      output,
      { columnFormat: DataFormat.binary },
      { fetchAsString: [DataTypeOIDs.date] },
    );
  });

  it('should parse "date" array field (text)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T00:00:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs._date, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "date" array field (binary)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T00:00:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs._date, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "date" param', async function () {
    const input = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T00:00:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs.date, input, output);
  });

  it('should encode "date" param (utcDates)', async function () {
    const input = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T23:45:00Z'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    const output = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T00:00:00Z'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs.date, input, output, { utcDates: true });
  });

  it('should encode array "date" param', async function () {
    const input = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T00:00:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs._date, input, output);
  });
}
