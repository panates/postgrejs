import { expect } from 'expect';
import {
  BindParam,
  Connection,
  DataFormat,
  DataTypeOIDs,
  Interval,
} from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// Chosen to cover every branch the wire format and the printed form have:
// a plain duration, all three quantities at once, zero, negatives on the
// day and the time, sub-second precision, months alone, months that roll
// into years, mixed signs, and an hour count past 24.
const INPUT = [
  '1 day 2 hours',
  '1 year 2 mons 3 days 04:05:06.789',
  '0',
  '-1 day -2 hours',
  '00:00:00.123456',
  '13 mons',
  '1 day -2 hours',
  '100000 hours',
  '-00:00:00.000001',
];
const OUTPUT = [
  new Interval({ days: 1, hours: 2 }),
  new Interval({
    years: 1,
    months: 2,
    days: 3,
    hours: 4,
    minutes: 5,
    seconds: 6,
    milliseconds: 789,
  }),
  new Interval(),
  new Interval({ days: -1, hours: -2 }),
  new Interval({ milliseconds: 123.456 }),
  new Interval({ years: 1, months: 1 }),
  new Interval({ days: 1, hours: -2 }),
  new Interval({ hours: 100000 }),
  new Interval({ milliseconds: -0.001 }),
];

describe('DataType: interval', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "interval" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.interval, INPUT, OUTPUT, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "interval" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.interval, INPUT, OUTPUT, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "interval" array field (text)', async () => {
    const input = [
      ['1 day 2 hours', null],
      ['-1 day', '00:00:00.5'],
    ];
    const output = [
      [new Interval({ days: 1, hours: 2 }), null],
      [new Interval({ days: -1 }), new Interval({ milliseconds: 500 })],
    ];
    await testParse(conn, DataTypeOIDs._interval, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "interval" array field (binary)', async () => {
    const input = [
      ['1 day 2 hours', null],
      ['-1 day', '00:00:00.5'],
    ];
    const output = [
      [new Interval({ days: 1, hours: 2 }), null],
      [new Interval({ days: -1 }), new Interval({ milliseconds: 500 })],
    ];
    await testParse(conn, DataTypeOIDs._interval, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "interval" param', async () => {
    await testEncode(conn, DataTypeOIDs.interval, OUTPUT, OUTPUT);
  });

  it('should encode "interval" array param', async () => {
    const input = [
      [new Interval({ days: 1, hours: 2 }), null],
      [new Interval({ days: -1 }), new Interval({ milliseconds: 500 })],
    ];
    await testEncode(conn, DataTypeOIDs._interval, input, input);
  });

  it('should infer the type of an Interval parameter', async () => {
    // Nothing else is an Interval instance, so inference is unambiguous -
    // unlike the one-character string that used to be read as "char".
    const r = await conn.query('select $1 as v', {
      params: [new Interval({ months: 2, minutes: 30 })],
      objectRows: true,
    });
    expect(String((r.rows?.[0] as any).v)).toStrictEqual('2 mons 00:30:00');
  });

  it('should accept a plain object or a string as a parameter', async () => {
    const r = await conn.query(
      'select $1::interval::text as a, $2::interval::text as b',
      {
        params: [
          new BindParam(DataTypeOIDs.interval, { months: 2, minutes: 30 }),
          new BindParam(DataTypeOIDs.interval, '3 days 04:00:00'),
        ],
        objectRows: true,
      },
    );
    expect(r.rows?.[0]).toStrictEqual({
      a: '2 mons 00:30:00',
      b: '3 days 04:00:00',
    });
  });

  it('should send back what it read, unchanged', () => {
    // An Interval handed straight back as a parameter, asserted through
    // ::text rather than on "no error was raised": the sign, the zero
    // and the microseconds are the three that could be lost on the way.
    const values = [
      '1 year 2 mons 3 days 04:05:06.7',
      '-1 days -02:00:00',
      '00:00:00',
      '00:00:00.000001',
      '-1 years -2 mons',
    ];
    return Promise.all(
      values.map(async v => {
        const read = await conn.query(`select '${v}'::interval as iv`, {
          objectRows: true,
        });
        const iv = (read.rows?.[0] as any).iv;
        const back = await conn.query('select ($1::interval)::text as t', {
          params: [iv],
          objectRows: true,
        });
        expect((back.rows?.[0] as any).t).toStrictEqual(v);
      }),
    );
  });
});
