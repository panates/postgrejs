import { expect } from 'expect';
import { TimestamptzType } from '../../src/data-types/timestamptz-type.js';

/** Encodes through the type's own encodeBinary, so only decoding is under test. */
function encode(d: Date): Buffer {
  const buf = Buffer.allocUnsafe(8);
  TimestamptzType.encodeBinary!(
    {
      writeInt32BE: (v: number) => buf.writeInt32BE(v, 0),
      writeUInt32BE: (v: number) => buf.writeUInt32BE(v, 4),
    } as any,
    d,
    {},
  );
  return buf;
}

const decode = (d: Date, options = {}) =>
  TimestamptzType.decodeBinary!(encode(d), 0, options) as Date;

/**
 * Finds an instant that local time cannot name unambiguously - one inside
 * the hour that repeats where the zone falls back - or undefined in a zone
 * that has no such hour (UTC, and anywhere that has dropped DST).
 *
 * Searched at runtime rather than pinned to a zone: setting process.env.TZ
 * has no effect once this suite is running, so a fixed zone would quietly
 * test nothing at all.
 */
function findRepeatedLocalHour(): Date | undefined {
  const now = new Date().getUTCFullYear();
  for (let year = now; year > now - 30; year--) {
    // Only the months a transition can fall in, north or south.
    for (const month of [2, 3, 8, 9, 10, 11]) {
      for (let day = 1; day <= 31; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const ms = Date.UTC(year, month, day, hour, 30, 15, 123);
          const d = new Date(ms);
          // Reading the instant as wall-clock and building it back is only
          // lossy when that wall-clock reading names two different
          // instants.
          const roundTrip = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            d.getHours(),
            d.getMinutes(),
            d.getSeconds(),
            d.getMilliseconds(),
          );
          if (roundTrip.getTime() !== ms) return d;
        }
      }
    }
  }
  return undefined;
}

describe('TimestamptzType.decodeBinary()', () => {
  it('should return the instant itself, not a wall-clock reading of it', function () {
    // A timestamptz is an absolute instant. Decoding used to rebuild the
    // Date from its own local calendar fields, which is the same instant
    // for every value except one inside a repeated local hour - there it
    // silently picked the other reading and moved the value by an hour,
    // disagreeing with the text-format decode of the very same row.
    const ambiguous = findRepeatedLocalHour();
    if (!ambiguous) return this.skip(); // zone has no repeated hour
    expect(decode(ambiguous).getTime()).toStrictEqual(ambiguous.getTime());
  });

  it('should return the instant itself for ordinary values', () => {
    for (const iso of [
      '1970-01-01T00:00:00.000Z',
      '1999-12-31T23:59:59.999Z',
      '2020-10-22T23:45:00.000Z',
      '2024-06-15T12:00:00.000Z',
      '2024-11-03T05:30:00.000Z',
    ]) {
      expect(decode(new Date(iso)).toISOString()).toStrictEqual(iso);
    }
  });

  it('should not let utcDates change which instant comes back', () => {
    // The option picks how a value with no zone of its own is read; a
    // timestamptz has no such ambiguity, so it decodes the same either way.
    const instant = new Date('2020-10-22T23:45:00.000Z');
    expect(decode(instant, { utcDates: true }).getTime()).toStrictEqual(
      instant.getTime(),
    );
    expect(decode(instant, { utcDates: false }).getTime()).toStrictEqual(
      instant.getTime(),
    );
  });
});
