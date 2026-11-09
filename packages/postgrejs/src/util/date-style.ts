/**
 * The session's `DateStyle`, when it is not the ISO default.
 *
 * PostgreSQL renders a date four ways, and the client cannot tell which
 * one it is looking at from the string alone - `05.03.2024` is the fifth
 * of March in every style that prints it, but `05/03/2024` is the fifth
 * of March under `SQL, DMY` and the third of May under `SQL, MDY`. The
 * server reports `DateStyle` in its startup parameters and again on
 * every `SET`, so the convention is known rather than guessed.
 *
 * Measured against PostgreSQL 18.4, one value in every combination:
 *
 * ```
 * ISO,      any    2024-11-25 01:02:03.456        2024-03-05
 * SQL,      MDY    11/25/2024 01:02:03.456 UTC    03/05/2024
 * SQL,      DMY    25/11/2024 01:02:03.456 UTC    05/03/2024
 * Postgres, MDY    Mon Nov 25 01:02:03.456 2024   03-05-2024
 * Postgres, DMY    Mon 25 Nov 01:02:03.456 2024   05-03-2024
 * German,   any    25.11.2024 01:02:03.456 UTC    05.03.2024
 * ```
 *
 * Two things in that table are not what the setting's name suggests:
 * German ignores the field order entirely, and `YMD` prints as `MDY`
 * for every style. Both are read off the measurement rather than off
 * the documentation.
 */
export interface PgDateStyle {
  style: 'SQL' | 'Postgres' | 'German';
  /** Whether the numeric day comes before the month. */
  dayFirst: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * `Postgres` style: a weekday, then the month and day in the configured
 * order, the time, the year, and for timestamptz a zone.
 */
const POSTGRES_PATTERN =
  /^[A-Za-z]{3} (?:([A-Za-z]{3}) (\d{1,2})|(\d{1,2}) ([A-Za-z]{3})) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))? (\d{1,6})(?: (.+))?$/;

/** `SQL` and `German`: three numbers, a time, and for timestamptz a zone. */
const NUMERIC_PATTERN =
  /^(\d{1,2})([./])(\d{1,2})\2(\d{1,6})(?: (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?(?: (.+))?$/;

/** `Postgres` style writes a date on its own with dashes. */
const POSTGRES_DATE_PATTERN = /^(\d{1,2})-(\d{1,2})-(\d{1,6})$/;

/**
 * The `DateStyle` the server reported, or undefined for ISO - which is
 * the default, is what every existing parser here expects, and is the
 * one shape that needs no extra work.
 */
export function parseDateStyleSetting(
  value: string | undefined,
): PgDateStyle | undefined {
  if (!value) return undefined;
  const comma = value.indexOf(',');
  const style = (comma < 0 ? value : value.substring(0, comma)).trim();
  if (style === 'ISO') return undefined;
  if (style !== 'SQL' && style !== 'Postgres' && style !== 'German')
    return undefined;
  const order = comma < 0 ? '' : value.substring(comma + 1).trim();
  // German prints day-first whatever the order says, and YMD prints as
  // MDY - both measured, neither obvious.
  return { style, dayFirst: style === 'German' || order === 'DMY' };
}

/**
 * The offset a rendered zone stands for, in minutes, or undefined when
 * it cannot be known.
 *
 * Outside ISO the server writes the zone's *abbreviation* where it has
 * one - `EST`, `IST` - and those do not identify an offset: IST is India
 * at +05:30, Israel at +02:00 and Ireland at +01:00. A numeric offset
 * and UTC/GMT are exact, and anything else is refused rather than
 * guessed at.
 */
function zoneOffsetMinutes(zone: string): number | undefined {
  if (zone === 'UTC' || zone === 'GMT' || zone === 'Z') return 0;
  const m = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(zone);
  if (!m) return undefined;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (+m[2] * 60 + (m[3] ? +m[3] : 0));
}

function build(
  y: number,
  mon: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  ms: number,
  offsetMinutes: number | undefined,
  utc: boolean | undefined,
): Date {
  if (offsetMinutes !== undefined)
    return new Date(Date.UTC(y, mon, d, h, mi - offsetMinutes, s, ms));
  if (utc) return new Date(Date.UTC(y, mon, d, h, mi, s, ms));
  return new Date(y, mon, d, h, mi, s, ms);
}

function fraction(f: string | undefined): number {
  return f ? +(f + '000').slice(0, 3) : 0;
}

/**
 * Reads a date or timestamp the server rendered in `style`.
 *
 * Returns undefined when the string is not that style's shape - a `BC`
 * year, an `infinity`, or a zone abbreviation nobody can resolve - so
 * the caller decides what to do with it. What it must never do is guess:
 * handing `05.03.2024` to `new Date()` is how the fifth of March became
 * the third of May, silently, for every day of the month up to twelve.
 */
export function parseStyledDateTime(
  str: string,
  style: PgDateStyle,
  utc?: boolean,
): Date | undefined {
  // Every style writes it the same way, and it is not a date.
  if (str.endsWith(' BC')) return undefined;

  if (style.style === 'Postgres') {
    const m = POSTGRES_PATTERN.exec(str);
    if (m) {
      const mon = MONTHS[(m[1] || m[4]).toLowerCase()];
      if (mon === undefined) return undefined;
      const day = +(m[2] || m[3]);
      let offset: number | undefined;
      if (m[10]) {
        offset = zoneOffsetMinutes(m[10]);
        if (offset === undefined) return undefined;
      }
      return build(
        +m[9],
        mon,
        day,
        +m[5],
        +m[6],
        +m[7],
        fraction(m[8]),
        offset,
        utc,
      );
    }
    const d = POSTGRES_DATE_PATTERN.exec(str);
    if (!d) return undefined;
    const day = +(style.dayFirst ? d[1] : d[2]);
    const mon = +(style.dayFirst ? d[2] : d[1]) - 1;
    return build(+d[3], mon, day, 0, 0, 0, 0, undefined, utc);
  }

  const m = NUMERIC_PATTERN.exec(str);
  if (!m) return undefined;
  // German writes dots and SQL writes slashes; a string using the other
  // one is not this session's rendering and is not read as if it were.
  if (m[2] !== (style.style === 'German' ? '.' : '/')) return undefined;
  const day = +(style.dayFirst ? m[1] : m[3]);
  const mon = +(style.dayFirst ? m[3] : m[1]) - 1;
  let offset: number | undefined;
  if (m[9]) {
    offset = zoneOffsetMinutes(m[9]);
    if (offset === undefined) return undefined;
  }
  return build(
    +m[4],
    mon,
    day,
    m[5] ? +m[5] : 0,
    m[6] ? +m[6] : 0,
    m[7] ? +m[7] : 0,
    fraction(m[8]),
    offset,
    utc,
  );
}
