import { expect } from 'expect';
import { TimeTzType } from '../../src/data-types/timetz-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function wire(v: any, options: any = {}): string {
  const buf = new SmartBuffer();
  TimeTzType.encodeBinary!(buf, v, options);
  // `buffer` is the whole allocation, `size` is how much of it was written.
  return buf.buffer.toString('hex', 0, buf.size);
}

function roundTrip(v: any, options: any = {}): string {
  const buf = new SmartBuffer();
  TimeTzType.encodeBinary!(buf, v, options);
  return TimeTzType.decodeBinary!(buf.buffer, 0, buf.size, options);
}

function decodeHex(hex: string): string {
  const buf = Buffer.from(hex, 'hex');
  return TimeTzType.decodeBinary!(buf, 0, buf.length, {});
}

describe('TimeTzType', () => {
  describe('decodeBinary()', () => {
    // Every hex string below is what the live server sent for the value
    // named beside it, and every expectation is what it printed.
    it('should read microseconds and a west-of-UTC zone', () => {
      expect(decodeHex('0000000a8bda1c00ffffd5d0')).toStrictEqual(
        '12:34:56+03',
      );
      expect(decodeHex('0000000a8bda1c0000004d58')).toStrictEqual(
        '12:34:56-05:30',
      );
      expect(decodeHex('000000000000000000000000')).toStrictEqual(
        '00:00:00+00',
      );
    });

    it('should drop the trailing zeroes of the fraction, and the fraction when it is zero', () => {
      expect(decodeHex('0000000a8be626080000a8c0')).toStrictEqual(
        '12:34:56.789-12',
      );
      expect(decodeHex('0000000a8be1bd20ffffd5d0')).toStrictEqual(
        '12:34:56.5+03',
      );
      expect(decodeHex('000000141dd75fffffff3b20')).toStrictEqual(
        '23:59:59.999999+14',
      );
    });

    it('should print the last hour of the day as 24:00:00', () => {
      // A legal timetz, and the reason hours are not taken modulo 24.
      expect(decodeHex('000000141dd7600000000000')).toStrictEqual(
        '24:00:00+00',
      );
    });

    it('should print offset minutes only when there are some, and seconds likewise', () => {
      expect(decodeHex('0000000a8bda1c00ffffaf24')).toStrictEqual(
        '12:34:56+05:45',
      );
      // +03:00:30 - an offset with seconds is a value the server stores
      // and prints, not just a theoretical one.
      expect(decodeHex('0000000a8bda1c00ffffd5b2')).toStrictEqual(
        '12:34:56+03:00:30',
      );
    });
  });

  describe('encodeBinary()', () => {
    it('should write an int64 of microseconds and an int32 zone', () => {
      expect(wire('12:34:56+03')).toStrictEqual('0000000a8bda1c00ffffd5d0');
      expect(wire('12:34:56-05:30')).toStrictEqual('0000000a8bda1c0000004d58');
    });

    it('should round-trip every form the server prints', () => {
      for (const v of [
        '12:34:56+03',
        '12:34:56-05:30',
        '00:00:00+00',
        '23:59:59.999999+14',
        '12:34:56.789-12',
        '12:34:56+05:45',
        '24:00:00+00',
        '12:34:56.5+03',
        '12:34:56+15:59',
        '12:34:56-15:59:59',
        '12:34:56.000001+03',
        '12:34:56+03:00:30',
      ]) {
        expect(roundTrip(v)).toStrictEqual(v);
      }
    });

    it('should accept the spellings the server accepts', () => {
      expect(roundTrip('1:2:3+3')).toStrictEqual('01:02:03+03');
      expect(roundTrip('12:34:56+0330')).toStrictEqual('12:34:56+03:30');
      expect(roundTrip('12:34+03')).toStrictEqual('12:34:00+03');
      expect(roundTrip('12:34:56Z')).toStrictEqual('12:34:56+00');
    });

    it('should refuse a string with no offset, rather than guess one', () => {
      // The server would resolve it against the session's zone, which is
      // not knowable here; the Node process's zone is a different answer.
      expect(() => wire('12:34:56')).toThrow('has no time zone offset');
    });

    it('should refuse a value out of range', () => {
      expect(() => wire('24:00:01+00')).toThrow('out of range');
      expect(() => wire('12:60:00+00')).toThrow('out of range');
      expect(() => wire('12:34:56+16')).toThrow('displacement out of range');
    });

    it('should refuse what is not a time at all', () => {
      expect(() => wire('hello')).toThrow('not a valid timetz');
      expect(() => wire(42)).toThrow('cannot be encoded as a timetz');
      expect(() => wire(null)).toThrow('cannot be encoded as a timetz');
    });

    describe('from a Date', () => {
      // A Date's local components and the zone they are read in go
      // together, so its own offset is the value's - not a guess.
      const d = new Date(1970, 0, 1, 12, 34, 56, 789);
      const offsetMinutes = -d.getTimezoneOffset();

      it('should use the local offset, and the local components with it', () => {
        const sign = offsetMinutes < 0 ? '-' : '+';
        const abs = Math.abs(offsetMinutes);
        const hh = String(Math.floor(abs / 60)).padStart(2, '0');
        const mm = abs % 60;
        const zone = sign + hh + (mm ? ':' + String(mm).padStart(2, '0') : '');
        expect(roundTrip(d)).toStrictEqual('12:34:56.789' + zone);
      });

      it('should use the UTC components and a zero offset under utcDates', () => {
        const utc = new Date(Date.UTC(1970, 0, 1, 12, 34, 56, 789));
        expect(roundTrip(utc, { utcDates: true })).toStrictEqual(
          '12:34:56.789+00',
        );
      });
    });
  });

  describe('encodeText()', () => {
    it('should hand a string to the server as written', () => {
      // Including the bare form the binary path refuses: there the server
      // resolves it against its own session zone, which is the answer the
      // caller asked for.
      expect(TimeTzType.encodeText!('12:34:56', {})).toStrictEqual('12:34:56');
      expect(TimeTzType.encodeText!('1:2:3 +3', {})).toStrictEqual('1:2:3 +3');
    });

    it('should print a Date the way the binary path would send it', () => {
      const utc = new Date(Date.UTC(1970, 0, 1, 1, 2, 3));
      expect(TimeTzType.encodeText!(utc, { utcDates: true })).toStrictEqual(
        '01:02:03+00',
      );
    });
  });

  describe('isType()', () => {
    it('should accept the string form, offset and all', () => {
      expect(TimeTzType.isType('12:34:56+03')).toStrictEqual(true);
      expect(TimeTzType.isType('24:00:00+00')).toStrictEqual(true);
      expect(TimeTzType.isType('12:34:56Z')).toStrictEqual(true);
    });

    it('should refuse a time with no offset, which is a `time`', () => {
      expect(TimeTzType.isType('12:34:56')).toStrictEqual(false);
    });

    it('should refuse a Date, which the encoder takes but which is not this shape', () => {
      expect(TimeTzType.isType(new Date())).toStrictEqual(false);
      expect(TimeTzType.isType('hello')).toStrictEqual(false);
      expect(TimeTzType.isType(42)).toStrictEqual(false);
    });

    it('should not be offered to inference', () => {
      // `time` already claims any clock-time string, offset and all.
      expect(TimeTzType.inferrable).toStrictEqual(false);
    });
  });

  it('should decode the text format as the server wrote it', () => {
    expect(TimeTzType.decodeText!('12:34:56+03', {})).toStrictEqual(
      '12:34:56+03',
    );
    const buf = Buffer.from('  12:34:56+03  ');
    expect(TimeTzType.decodeTextBuffer!(buf, 2, 11, {})).toStrictEqual(
      '12:34:56+03',
    );
  });
});
