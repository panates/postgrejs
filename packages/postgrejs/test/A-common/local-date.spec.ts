import process from 'node:process';
import { expect } from 'expect';
import { utcPartsAsLocal } from '../../src/util/local-date.js';

/**
 * `timestamp`, `date` and `time` carry no zone, so with `utcDates` off -
 * the default - what comes back is the local Date reading the wall clock
 * the server sent. That used to be built by reading seven `getUTC*`
 * components off one Date and handing them to another, which cost more
 * than both Dates together; it is now a shift by the zone's own offset,
 * with the component route kept for the hour a DST transition moves.
 *
 * So what has to hold is that the two answer the same thing, everywhere
 * - which is what these sweeps are.
 */
describe('utcPartsAsLocal()', () => {
  /** What it replaced, kept here as the definition to measure against. */
  function byComponents(ms: number): Date {
    const utc = new Date(ms);
    return new Date(
      utc.getUTCFullYear(),
      utc.getUTCMonth(),
      utc.getUTCDate(),
      utc.getUTCHours(),
      utc.getUTCMinutes(),
      utc.getUTCSeconds(),
      utc.getUTCMilliseconds(),
    );
  }

  /** Runs `fn` with the process in `tz`, and puts the zone back. */
  function inZone(tz: string, fn: () => void): void {
    const saved = process.env.TZ;
    process.env.TZ = tz;
    try {
      fn();
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  }

  const ZONES = [
    'UTC',
    'Europe/Istanbul', // a fixed +03 since 2016
    'America/New_York', // an hour forward and back
    'Australia/Lord_Howe', // a *half* hour forward and back
    'Asia/Kolkata', // +05:30, never moves
    'Pacific/Chatham', // +12:45/+13:45
  ];

  for (const tz of ZONES)
    it(`should agree with the component route in ${tz}`, () => {
      inZone(tz, () => {
        const wrong: string[] = [];
        // Every hour of two years, which crosses four transitions in
        // the zones that have them.
        for (
          let ms = Date.UTC(2024, 0, 1);
          ms < Date.UTC(2026, 0, 1);
          ms += 3600000
        )
          if (utcPartsAsLocal(ms).getTime() !== byComponents(ms).getTime())
            wrong.push(new Date(ms).toISOString());
        expect(wrong).toStrictEqual([]);
      });
    });

  it('should agree before 1970, where an offset carries seconds', () => {
    // A zone's pre-standard offset is local mean time - Istanbul was
    // +01:55:52 - and `getTimezoneOffset()` answers whole minutes, so a
    // shift would land up to 59 seconds off. Those take the component
    // route, which is why this sweep has to pass rather than be excused.
    for (const tz of ['Europe/Istanbul', 'America/New_York', 'Asia/Kolkata'])
      inZone(tz, () => {
        const wrong: string[] = [];
        for (
          let ms = Date.UTC(1850, 0, 1);
          ms < Date.UTC(1970, 0, 1);
          ms += 6 * 3600000
        )
          if (utcPartsAsLocal(ms).getTime() !== byComponents(ms).getTime())
            wrong.push(new Date(ms).toISOString());
        expect([tz, wrong.length]).toStrictEqual([tz, 0]);
      });
  });

  it('should agree across the transition itself, to the minute', () => {
    // The hour that does not exist and the hour that happens twice -
    // where the shift lands on a wall clock that is not the one asked
    // for, and hands back to the component route.
    inZone('America/New_York', () => {
      const wrong: string[] = [];
      for (const day of [Date.UTC(2024, 2, 10), Date.UTC(2024, 10, 3)])
        for (let ms = day; ms < day + 12 * 3600000; ms += 60000)
          if (utcPartsAsLocal(ms).getTime() !== byComponents(ms).getTime())
            wrong.push(new Date(ms).toISOString());
      expect(wrong).toStrictEqual([]);
    });
  });

  it('should keep the later of two instants that read the same clock', () => {
    // Pacific/Chatham goes back 45 minutes, so `2024-04-07T03:00Z` is
    // `03:00` at +13:45 and again at +12:45 - the shift lands on the
    // second of them, the component route picks the first, and the
    // second guard is what sends this one back to it.
    inZone('Pacific/Chatham', () => {
      const ms = Date.UTC(2024, 3, 7, 3, 0);
      expect(utcPartsAsLocal(ms).getTime()).toStrictEqual(
        byComponents(ms).getTime(),
      );
    });
  });

  it('should read a wall clock back as itself', () => {
    inZone('America/New_York', () => {
      const d = utcPartsAsLocal(Date.UTC(2024, 5, 15, 10, 30, 0, 123));
      expect([
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
        d.getMilliseconds(),
      ]).toStrictEqual([2024, 5, 15, 10, 30, 0, 123]);
    });
  });

  it('should not move a year between 0 and 99 by a century', () => {
    // `new Date(44, 2, 15)` means 1944, so the component route turned
    // `0044-03-15` into 1944 - silently, and only on the local path.
    // The shift has no such rule and answers the year the server sent.
    inZone('Europe/Istanbul', () => {
      // Built through setUTCFullYear, since `Date.UTC(44, ...)` has the
      // same century rule and would name 1944 before anything is read.
      const ad44 = new Date(0);
      ad44.setUTCFullYear(44, 2, 15);
      ad44.setUTCHours(0, 0, 0, 0);
      expect(utcPartsAsLocal(ad44.getTime()).getFullYear()).toStrictEqual(44);
      expect(byComponents(ad44.getTime()).getFullYear()).toStrictEqual(1944);
    });
  });
});
