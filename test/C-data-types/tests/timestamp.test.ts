import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "timestamp" field (text)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', '2020-10-22T23:45:00+03:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs.timestamp, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "timestamp" field (text, utcDates)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', '2020-10-22T23:45:00+03:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T23:45:00Z'),
      new Date('2020-10-22T23:45:00Z'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(
      conn(),
      DataTypeOIDs.timestamp,
      input,
      output,
      { columnFormat: DataFormat.text },
      { utcDates: true },
    );
  });

  it('should parse "timestamp" field (text, fetchAsString)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', '2020-10-22T23:45:00+03:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      '2020-10-22 00:00:00',
      '2020-10-22 23:45:00',
      '2020-10-22 23:45:00',
      '1970-01-01 00:00:00',
      'infinity',
      '-infinity',
    ];
    await testParse(
      conn(),
      DataTypeOIDs.timestamp,
      input,
      output,
      { columnFormat: DataFormat.text },
      { fetchAsString: [DataTypeOIDs.timestamp] },
    );
  });

  it('should parse "timestamp" field (binary)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', '2020-10-22T23:45:00+03:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs.timestamp, input, output, { columnFormat: DataFormat.binary });
  });

  it('should parse "timestamp" field (binary, utcDates)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', '2020-10-22T23:45:00+03:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T23:45:00Z'),
      new Date('2020-10-22T23:45:00Z'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(
      conn(),
      DataTypeOIDs.timestamp,
      input,
      output,
      { columnFormat: DataFormat.binary },
      { utcDates: true },
    );
  });

  it('should parse "timestamp" field (binary, fetchAsString)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', '2020-10-22T23:45:00+03:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      '2020-10-22 00:00:00',
      '2020-10-22 23:45:00',
      '2020-10-22 23:45:00',
      '1970-01-01 00:00:00',
      'infinity',
      '-infinity',
    ];
    await testParse(
      conn(),
      DataTypeOIDs.timestamp,
      input,
      output,
      { columnFormat: DataFormat.binary },
      { fetchAsString: [DataTypeOIDs.timestamp] },
    );
  });

  it('should parse "timestamp" array field (text)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', '2020-10-22T23:45:00+03:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs._timestamp, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "timestamp" array field (binary)', async function () {
    const input = ['2020-10-22', '2020-10-22T23:45:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs._timestamp, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "timestamp" param', async function () {
    const input = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs.timestamp, input, output);
  });

  it('should encode "timestamp" param (utcDates)', async function () {
    const input = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T23:45:00Z'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    const output = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T23:45:00Z'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs.timestamp, input, output, { utcDates: true });
  });

  it('should encode array "timestamp" param', async function () {
    const input = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    const output = [
      new Date('2020-10-22T00:00:00'),
      new Date('2020-10-22T23:45:00'),
      new Date('1970-01-01T00:00:00'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs._timestamp, input, output);
  });
}
