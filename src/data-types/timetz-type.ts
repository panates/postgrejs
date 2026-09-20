import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { readBigInt64BE } from '../util/bigint-methods.js';

/**
 * `timetz` decodes to a string, alone among the date/time types, and the
 * reason is the one thing that distinguishes it from `time`: the offset.
 * A JavaScript Date has no field for one. Handing back a Date would mean
 * either dropping the offset - throwing away the only part that makes
 * this type different - or folding it into the instant, so that
 * `12:00:00+03` and `09:00:00+00` became indistinguishable and writing
 * the value back changed it. The string keeps both parts, is exactly what
 * the server printed, and casts straight back. `pg` also leaves it a
 * string.
 *
 * PostgreSQL's own documentation calls this type's definition of
 * questionable usefulness - a time with no date cannot resolve a real
 * zone, only a fixed offset - which is a further reason not to invent a
 * richer representation for it here.
 */

/**
 * Hours may reach 24 (`24:00:00` is a legal `timetz`), the fraction is
 * microseconds, and the offset may carry seconds - `12:34:56+03:00:30`
 * is a value the server stores and prints.
 */
const TIMETZ_PATTERN =
  /^\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,6}))?\s*(?:(Z|z)|([+-])(\d{1,2})(?::?(\d{2}))?(?::?(\d{2}))?)?\s*$/;

const MICROS_PER_DAY = 86400000000;
/** What the server accepts: ±15:59:59, and ±16 is out of range. */
const MAX_ZONE_SECONDS = 15 * 3600 + 59 * 60 + 59;

const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

/**
 * Microseconds since midnight and the zone as the wire carries it -
 * seconds *west* of UTC, so `+03` is stored as -10800.
 */
interface TimeTzParts {
  micros: number;
  zone: number;
}

function parseTimeTzText(v: string): TimeTzParts {
  const m = TIMETZ_PATTERN.exec(v);
  if (!m) throw new Error(`"${v}" is not a valid timetz value`);
  if (!m[5] && !m[6]) {
    // The server would resolve this against the session's time zone,
    // which is not knowable here - and guessing the Node process's zone
    // instead would silently shift the value. The text path does not go
    // through this function and still accepts the bare form, since there
    // the server does the resolving itself.
    throw new Error(
      `"${v}" has no time zone offset - give it one ("12:34:56+03"), or ` +
        'pass a Date, whose own offset is used',
    );
  }
  const hours = +m[1];
  const minutes = +m[2];
  const seconds = m[3] ? +m[3] : 0;
  const micros =
    ((hours * 60 + minutes) * 60 + seconds) * 1000000 +
    (m[4] ? +m[4].padEnd(6, '0') : 0);
  if (minutes > 59 || seconds > 59 || micros > MICROS_PER_DAY)
    throw new Error(`"${v}" is out of range for a timetz value`);
  let zone = 0;
  if (m[6]) {
    zone = +m[7] * 3600 + (m[8] ? +m[8] : 0) * 60 + (m[9] ? +m[9] : 0);
    if (zone > MAX_ZONE_SECONDS)
      throw new Error(`"${v}" has a time zone displacement out of range`);
    // Stored west-positive, the opposite sign from the way it is written.
    if (m[6] === '+') zone = -zone;
  }
  return { micros, zone };
}

/**
 * A Date carries no offset of its own, but its local components and the
 * zone they are read in go together: `getHours()` means "in the local
 * zone", so that zone's offset is the value's, not a guess. Under
 * `utcDates` the encoders read UTC components instead, and then the
 * offset that matches is zero - the same rule the rest of the date/time
 * types follow.
 */
function fromDate(v: Date, options: DataMappingOptions): TimeTzParts {
  const utc = !!options.utcDates;
  const hours = utc ? v.getUTCHours() : v.getHours();
  const minutes = utc ? v.getUTCMinutes() : v.getMinutes();
  const seconds = utc ? v.getUTCSeconds() : v.getSeconds();
  const ms = utc ? v.getUTCMilliseconds() : v.getMilliseconds();
  return {
    micros: (((hours * 60 + minutes) * 60 + seconds) * 1000 + ms) * 1000,
    // getTimezoneOffset() is already minutes west of UTC, the same
    // direction the wire uses.
    zone: utc ? 0 : v.getTimezoneOffset() * 60,
  };
}

function toParts(v: any, options: DataMappingOptions): TimeTzParts {
  if (typeof v === 'string') return parseTimeTzText(v);
  if (v instanceof Date) return fromDate(v, options);
  throw new TypeError(
    `"${typeof v}" cannot be encoded as a timetz - pass the string form ` +
      'with its offset, or a Date',
  );
}

/**
 * Prints what the server prints: the clock time, then microseconds with
 * trailing zeroes dropped and the whole fraction omitted when it is zero,
 * then the offset - always with hours, with minutes when they are not
 * zero and seconds only when they are not either.
 */
function formatTimeTz(micros: number, zone: number): string {
  const us = micros % 1000000;
  let rest = (micros - us) / 1000000;
  const seconds = rest % 60;
  rest = (rest - seconds) / 60;
  const minutes = rest % 60;
  const hours = (rest - minutes) / 60;
  let out = pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
  if (us) out += '.' + String(us).padStart(6, '0').replace(/0+$/, '');
  // Back to the way it is written, east-positive.
  let z = -zone;
  out += z < 0 ? '-' : '+';
  if (z < 0) z = -z;
  const zs = z % 60;
  z = (z - zs) / 60;
  const zm = z % 60;
  out += pad((z - zm) / 60);
  if (zm || zs) out += ':' + pad(zm);
  if (zs) out += ':' + pad(zs);
  return out;
}

export const TimeTzType: DataType = {
  name: 'timetz',
  oid: DataTypeOIDs.timetz,
  jsType: 'string',

  // `time` already claims any string that looks like a clock time,
  // offset and all, so inference here would only take those strings away
  // from it - and a plain "12:34:56" is far more often a `time`. Name
  // this type to reach it: `new BindParam(DataTypeOIDs.timetz, v)`.
  inferrable: false,

  /**
   * Twelve bytes: microseconds since midnight as an int64, then the zone
   * as an int32 of seconds west of UTC.
   */
  decodeBinary(v: Buffer, offset: number = 0): string {
    const micros =
      typeof v.readBigInt64BE === 'function'
        ? v.readBigInt64BE(offset)
        : readBigInt64BE(v, offset);
    // A day of microseconds is far inside the safe integer range, so
    // this is only about the wire type, not the value.
    return formatTimeTz(Number(micros), v.readInt32BE(offset + 8));
  },

  encodeBinary(buf: SmartBuffer, v: any, options: DataMappingOptions): void {
    const p = toParts(v, options);
    buf.writeBigInt64BE(BigInt(p.micros));
    buf.writeInt32BE(p.zone);
  },

  decodeText(v: string): string {
    return v;
  },

  encodeText(v: any, options: DataMappingOptions): string {
    // A string goes over as written - the server accepts spellings this
    // file does not have to know, including a bare time, which it
    // resolves against the session's own zone.
    if (typeof v === 'string') return v;
    const p = toParts(v, options);
    return formatTimeTz(p.micros, p.zone);
  },

  // Digits, colons and a sign - see inet-type.ts for why 'latin1'.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
    return buf.toString('latin1', offset, offset + len);
  },

  isType(v: any): boolean {
    // The type's own JavaScript shape is the string the server prints,
    // which always carries an offset. A Date is accepted by the encoder
    // as a convenience, but it is `time`'s shape, not this one's - the
    // same line IntervalType draws between what it encodes and what it
    // claims.
    if (typeof v !== 'string') return false;
    try {
      parseTimeTzText(v);
      return true;
    } catch {
      return false;
    }
  },
};

export const ArrayTimeTzType: DataType = {
  ...TimeTzType,
  name: '_timetz',
  oid: DataTypeOIDs._timetz,
  elementsOID: DataTypeOIDs.timetz,
};
