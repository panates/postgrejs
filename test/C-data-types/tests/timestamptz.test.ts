import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "timestamptz" field (text)', async function () {
    const input = ['2020-10-22T23:45:00Z', '2020-10-22T23:45:00+01:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T23:45:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs.timestamptz, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "timestamptz" field (text, utcDates)', async function () {
    const input = ['2020-10-22T23:45:00Z', '2020-10-22T23:45:00+01:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T23:45:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(
      conn(),
      DataTypeOIDs.timestamptz,
      input,
      output,
      { columnFormat: DataFormat.text },
      { utcDates: true },
    );
  });

  it('should parse "timestamptz" field (text, fetchAsString)', async function () {
    const input = ['2020-10-22T23:45:12.123Z', '2020-10-22T23:45:00+01:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      '2020-10-22 23:45:12.123Z',
      '2020-10-22 22:45:00.000Z',
      '1970-01-01 00:00:00.000Z',
      'infinity',
      '-infinity',
    ];
    await testParse(
      conn(),
      DataTypeOIDs.timestamptz,
      input,
      output,
      { columnFormat: DataFormat.text },
      { fetchAsString: [DataTypeOIDs.timestamptz] },
    );
  });

  it('should parse "timestamptz" field (binary)', async function () {
    const input = ['2020-10-22T23:45:00Z', '2020-10-22T23:45:00+01:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T23:45:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs.timestamptz, input, output, { columnFormat: DataFormat.binary });
  });

  it('should parse "timestamptz" field (binary, fetchAsString)', async function () {
    const input = ['2020-10-22T23:45:12.123Z', '2020-10-22T23:45:00+01:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      '2020-10-22 23:45:12.123Z',
      '2020-10-22 22:45:00.000Z',
      '1970-01-01 00:00:00.000Z',
      'infinity',
      '-infinity',
    ];
    await testParse(
      conn(),
      DataTypeOIDs.timestamptz,
      input,
      output,
      { columnFormat: DataFormat.binary },
      { fetchAsString: [DataTypeOIDs.timestamptz] },
    );
  });

  it('should parse "timestamptz" field (binary, utcDates)', async function () {
    const input = ['2020-10-22T23:45:00Z', '2020-10-22T23:45:00+01:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T23:45:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(
      conn(),
      DataTypeOIDs.timestamptz,
      input,
      output,
      { columnFormat: DataFormat.binary },
      { utcDates: true },
    );
  });

  it('should parse "timestamptz" array field (text)', async function () {
    const input = ['2020-10-22T23:45:00Z', '2020-10-22T23:45:00+01:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T23:45:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs._timestamptz, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "timestamptz" array field (binary)', async function () {
    const input = ['2020-10-22T23:45:00Z', '2020-10-22T23:45:00+01:00', 'epoch', 'infinity', '-infinity'];
    const output = [
      new Date('2020-10-22T23:45:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testParse(conn(), DataTypeOIDs._timestamptz, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "timestamptz" param', async function () {
    const input = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs.timestamptz, input);
  });

  it('should encode "timestamptz" param (utcDates)', async function () {
    const input = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs.timestamptz, input, undefined, { utcDates: true });
  });

  it('should encode array "timestamp" param', async function () {
    const input = [
      new Date('2020-10-22T00:00:00Z'),
      new Date('2020-10-22T23:45:00+01:00'),
      new Date('1970-01-01T00:00:00Z'),
      Infinity,
      -Infinity,
    ];
    await testEncode(conn(), DataTypeOIDs._timestamptz, input);
  });
}
