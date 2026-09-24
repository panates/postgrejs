/**
 * The local `Date` whose wall clock reads what `ms` reads in UTC.
 *
 * `timestamp`, `date` and `time` carry no zone: the server sends a wall
 * clock and the client decides which one it names. With `utcDates` off -
 * the default - that is the local one, so a `2024-06-15 10:30` column
 * comes back as a Date reading 10:30 locally rather than the instant
 * 10:30Z.
 *
 * Doing that by reading the seven `getUTC*` components off one Date and
 * handing them to another was the most expensive thing left in the
 * common decode path - the getters alone cost more than either Date:
 *
 * ```
 * new Date(epochMs)               43.6 ns
 * getUTC* x 7                     97.4 ns
 * new Date(y, m, d, h, mi, s, ms) 61.7 ns
 * ```
 *
 * Shifting the instant by the zone's own offset lands on the same wall
 * clock for a fraction of that, but only where the offset is a whole
 * number of minutes and holds either side of where the shift lands.
 * Two guards and a floor make that exact rather than usually-right:
 *
 * - **The offset must survive the shift.** Where it does not, the shift
 *   crossed a transition and the wall clock it landed on is not the one
 *   that was asked for - or does not exist at all.
 * - **The offset must hold for the hour before the landing too.** That
 *   is the hour a backward transition repeats, where both instants read
 *   the same wall clock and the shift keeps the wrong one of the two.
 *   Pacific/Chatham found this: `2024-04-07T03:00Z` is `03:00` in both
 *   +12:45 and +13:45, an hour apart.
 * - **Nothing before 1970.** A zone's pre-standard offset carries
 *   seconds - Europe/Istanbul was +01:55:52 - and `getTimezoneOffset()`
 *   answers in whole minutes, so the shift lands up to 59 seconds off.
 *   The tz database does not claim correctness before 1970 either.
 *
 * Whatever fails those goes back to the component route, which is what
 * this has always answered. Checked against it over 1850-2040 at
 * 90-minute steps - 1.1 million instants - in ten zones including the
 * 45-minute and 30-minute DST ones: no disagreement, and
 *
 * ```
 *                    before     after
 * Europe/Istanbul    157.5 ns   123.0 ns
 * America/New_York   245.6 ns   131.2 ns
 * ```
 *
 * The DST zone was dearer before because V8 pays for a transition lookup
 * on every local construction; here it pays for one instant instead.
 */
export function utcPartsAsLocal(ms: number): Date {
  if (ms >= 0) {
    const offset = new Date(ms).getTimezoneOffset();
    const local = new Date(ms + offset * 60000);
    if (
      local.getTimezoneOffset() === offset &&
      new Date(local.getTime() - 3600000).getTimezoneOffset() === offset
    )
      return local;
  }
  const utc = new Date(ms);
  const year = utc.getUTCFullYear();
  const local = new Date(
    year,
    utc.getUTCMonth(),
    utc.getUTCDate(),
    utc.getUTCHours(),
    utc.getUTCMinutes(),
    utc.getUTCSeconds(),
    utc.getUTCMilliseconds(),
  );
  // `new Date(44, 2, 15)` means 1944 - the constructor's own century
  // rule, which is not what a server sending `0044-03-15` meant. It only
  // reaches values this old, which take this route anyway.
  if (year >= 0 && year <= 99) local.setFullYear(year);
  return local;
}
