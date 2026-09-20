import { expect } from 'expect';
import { DataTypeNames, GlobalTypeMap } from 'postgrejs';
import { formatDateParam } from '../../src/util/format-datetime.js';

const name = (v: any) => DataTypeNames[GlobalTypeMap.determine(v)];

describe('Date parameters', () => {
  describe('formatDateParam()', () => {
    it('should write the local wall clock with the local offset', () => {
      // What `pg` sends, and the only rendering right for a timestamptz
      // column and a timestamp column at once - the offset is honoured
      // by the first and discarded by the second, so the column decides.
      const d = new Date(2024, 2, 5, 9, 7, 8, 900);
      const offset = -d.getTimezoneOffset();
      const sign = offset < 0 ? '-' : '+';
      const abs = Math.abs(offset);
      const p = (n: number) => String(n).padStart(2, '0');
      expect(formatDateParam(d)).toStrictEqual(
        `2024-03-05 09:07:08.900${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`,
      );
    });

    it('should write UTC with a zero offset under utcDates', () => {
      const d = new Date(Date.UTC(2024, 2, 5, 6, 7, 8, 900));
      expect(formatDateParam(d, { utcDates: true })).toStrictEqual(
        '2024-03-05 06:07:08.900+00:00',
      );
    });

    it('should pass infinity through, as the other formatters do', () => {
      expect(formatDateParam(Infinity)).toStrictEqual('infinity');
      expect(formatDateParam(-Infinity)).toStrictEqual('-infinity');
    });
  });

  describe('determine()', () => {
    // The parameter path no longer asks determine() about a Date - it
    // sends one unspecified and lets the column decide. These are pinned
    // anyway: the 1970-01-01 rule is how this library expresses a `time`
    // and a `date`, and it runs through TimestampType.isType's exclusion,
    // so a reordering of the type registrations could move it silently.
    it('should answer timestamp for an ordinary Date', () => {
      expect(name(new Date(2024, 2, 5, 9, 7, 8))).toStrictEqual('timestamp');
      expect(name(new Date(2024, 2, 5))).toStrictEqual('timestamp');
    });

    it('should answer time for a Date on the epoch day', () => {
      expect(name(new Date('1970-01-01T05:00:00Z'))).toStrictEqual('time');
    });

    it('should answer date for local midnight on the epoch day', () => {
      expect(name(new Date(1970, 0, 1))).toStrictEqual('date');
    });

    it('should never answer timestamptz, which is what made this a bug', () => {
      // TimestamptzType.isType is `v instanceof Date` and nothing else,
      // but TimestampType, TimeType and DateType are all consulted
      // before it, so it cannot fire. Declaring `timestamp` for every
      // Date is what moved the instant on the way into a timestamptz
      // column; the fix was to stop declaring a type at all rather than
      // to make this answer differently.
      for (const d of [
        new Date(2024, 2, 5, 9, 7, 8),
        new Date('1970-01-01T05:00:00Z'),
        new Date(1970, 0, 1),
      ])
        expect(name(d)).not.toStrictEqual('timestamptz');
    });
  });
});
