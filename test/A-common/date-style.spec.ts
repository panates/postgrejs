import { expect } from 'expect';
import {
  parseDateStyleSetting,
  parseStyledDateTime,
} from '../../src/util/date-style.js';

/**
 * The fixtures are what PostgreSQL 18.4 actually printed for one value
 * in every style and order, not what the documentation implies - two of
 * them are not the same thing.
 */
describe('parseDateStyleSetting()', () => {
  it('should answer nothing for the ISO default', () => {
    // Nothing to do: every parser here already reads ISO, and answering
    // undefined is what keeps the common path free of all of this.
    expect(parseDateStyleSetting('ISO, MDY')).toStrictEqual(undefined);
    expect(parseDateStyleSetting('ISO, DMY')).toStrictEqual(undefined);
    expect(parseDateStyleSetting(undefined)).toStrictEqual(undefined);
  });

  it('should read the order for SQL and Postgres', () => {
    expect(parseDateStyleSetting('SQL, DMY')).toStrictEqual({
      style: 'SQL',
      dayFirst: true,
    });
    expect(parseDateStyleSetting('SQL, MDY')).toStrictEqual({
      style: 'SQL',
      dayFirst: false,
    });
    expect(parseDateStyleSetting('Postgres, DMY')).toStrictEqual({
      style: 'Postgres',
      dayFirst: true,
    });
  });

  it('should treat YMD as MDY, which is what it prints as', () => {
    expect(parseDateStyleSetting('SQL, YMD')).toStrictEqual({
      style: 'SQL',
      dayFirst: false,
    });
  });

  it('should ignore the order for German, which always writes day first', () => {
    for (const order of ['MDY', 'DMY', 'YMD'])
      expect(parseDateStyleSetting('German, ' + order)).toStrictEqual({
        style: 'German',
        dayFirst: true,
      });
  });
});

describe('parseStyledDateTime()', () => {
  const at = (d: Date | undefined) => (d ? d.toISOString() : String(d));
  const utc = true;

  it('should read what each style prints', () => {
    const cases: [string, string, string][] = [
      // setting, rendered, expected UTC instant
      ['German, DMY', '25.11.2024 01:02:03.456', '2024-11-25T01:02:03.456Z'],
      ['German, MDY', '05.03.2024', '2024-03-05T00:00:00.000Z'],
      ['SQL, DMY', '25/11/2024 01:02:03.456', '2024-11-25T01:02:03.456Z'],
      ['SQL, MDY', '11/25/2024 01:02:03.456', '2024-11-25T01:02:03.456Z'],
      ['SQL, MDY', '03/05/2024', '2024-03-05T00:00:00.000Z'],
      [
        'Postgres, DMY',
        'Mon 25 Nov 01:02:03.456 2024',
        '2024-11-25T01:02:03.456Z',
      ],
      [
        'Postgres, MDY',
        'Mon Nov 25 01:02:03.456 2024',
        '2024-11-25T01:02:03.456Z',
      ],
      ['Postgres, DMY', '05-03-2024', '2024-03-05T00:00:00.000Z'],
      ['Postgres, MDY', '03-05-2024', '2024-03-05T00:00:00.000Z'],
    ];
    for (const [setting, rendered, expected] of cases) {
      const style = parseDateStyleSetting(setting)!;
      expect(
        `${setting} ${rendered} -> ${at(parseStyledDateTime(rendered, style, utc))}`,
      ).toStrictEqual(`${setting} ${rendered} -> ${expected}`);
    }
  });

  it('should read the same numbers the other way round when the order says so', () => {
    // The whole point: one string, two meanings, and the setting is what
    // tells them apart. `new Date()` always guessed the second one.
    const dmy = parseDateStyleSetting('SQL, DMY')!;
    const mdy = parseDateStyleSetting('SQL, MDY')!;
    expect(at(parseStyledDateTime('05/03/2024', dmy, utc))).toStrictEqual(
      '2024-03-05T00:00:00.000Z',
    );
    expect(at(parseStyledDateTime('05/03/2024', mdy, utc))).toStrictEqual(
      '2024-05-03T00:00:00.000Z',
    );
  });

  it('should take an offset the server spelled out', () => {
    const style = parseDateStyleSetting('German, DMY')!;
    expect(
      at(parseStyledDateTime('25.11.2024 04:02:03.456 +03', style, utc)),
    ).toStrictEqual('2024-11-25T01:02:03.456Z');
    expect(
      at(parseStyledDateTime('25.11.2024 01:02:03.456 UTC', style, utc)),
    ).toStrictEqual('2024-11-25T01:02:03.456Z');
  });

  it('should refuse a zone abbreviation, which names no offset', () => {
    // IST is India at +05:30, Israel at +02:00 and Ireland at +01:00.
    // Declining is what leaves the caller with an Invalid Date rather
    // than an instant that is five hours out.
    const style = parseDateStyleSetting('German, DMY')!;
    expect(
      parseStyledDateTime('25.11.2024 01:02:03 IST', style, utc),
    ).toStrictEqual(undefined);
    expect(
      parseStyledDateTime('25.11.2024 01:02:03 EST', style, utc),
    ).toStrictEqual(undefined);
  });

  it('should refuse what it does not recognise rather than guess', () => {
    const german = parseDateStyleSetting('German, DMY')!;
    // A slash-separated string is not what this session prints.
    expect(parseStyledDateTime('05/03/2024', german, utc)).toStrictEqual(
      undefined,
    );
    // BC, which every style writes the same way and none of these read.
    expect(parseStyledDateTime('03.02.0001 BC', german, utc)).toStrictEqual(
      undefined,
    );
    expect(parseStyledDateTime('infinity', german, utc)).toStrictEqual(
      undefined,
    );
    expect(parseStyledDateTime('2024-03-05', german, utc)).toStrictEqual(
      undefined,
    );
  });
});
