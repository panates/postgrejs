import { expect } from 'expect';
import { DateType } from '../../src/data-types/date-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

/**
 * `date` goes on the wire as a signed day count from 2000-01-01, so
 * every date before that one is a negative number - and rounding a
 * negative towards zero is rounding it to the day *after* the one it is.
 *
 * Taken with `utcDates`, so these say the same thing wherever they run:
 * the sign of the arithmetic is the subject, not the zone.
 */
describe('DateType.encodeBinary()', () => {
  const dayOf = (iso: string): number => {
    const io = new SmartBuffer();
    io.start();
    DateType.encodeBinary!(io, new Date(iso), { utcDates: true });
    return io.flush().readInt32BE(0);
  };

  it('should answer the day a pre-epoch instant falls in, not the next one', () => {
    // Regression: `Math.trunc` put 1999-12-31T22:00Z two hours before
    // the epoch into day 0, which is 2000-01-01 - a day late, silently,
    // for every pre-2000 date carrying a time.
    expect(dayOf('1999-12-31T22:00:00.000Z')).toStrictEqual(-1);
    expect(dayOf('1999-12-31T00:00:00.000Z')).toStrictEqual(-1);
    expect(dayOf('1999-12-30T23:59:59.999Z')).toStrictEqual(-2);
    expect(dayOf('1999-06-15T13:30:00.000Z')).toStrictEqual(-200);
  });

  it('should keep answering the day a post-epoch instant falls in', () => {
    expect(dayOf('2000-01-01T00:00:00.000Z')).toStrictEqual(0);
    expect(dayOf('2000-01-01T13:00:00.000Z')).toStrictEqual(0);
    expect(dayOf('2000-01-02T00:00:00.000Z')).toStrictEqual(1);
    expect(dayOf('2026-07-15T23:59:59.999Z')).toStrictEqual(9692);
  });

  it('should land an exact midnight on its own day, either side of the epoch', () => {
    // What the epsilon is for: the division must not leave a whole day a
    // hair under itself and floor to the one before.
    for (let d = -800; d <= 800; d += 1) {
      const iso = new Date(Date.UTC(2000, 0, 1 + d)).toISOString();
      expect(dayOf(iso)).toStrictEqual(d);
    }
  });
});
