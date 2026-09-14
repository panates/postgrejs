import { expect } from 'expect';
import {
  parsePgTimestampBuffer,
  parsePgTimestampString,
} from '../../src/util/parse-pg-timestamp.js';

const buf = (s: string) => Buffer.from(s, 'latin1');

describe('parsePgTimestampBuffer()', () => {
  it('should decode a value that sits inside a larger buffer', () => {
    // Wire rows are decoded in place, so the value is almost never at 0.
    const value = '2024-03-05 14:22:31+03';
    const b = buf('xxxx' + value + 'yyyy');
    const d = parsePgTimestampBuffer(b, 4, 4 + value.length) as Date;
    expect(d.toISOString()).toStrictEqual('2024-03-05T11:22:31.000Z');
  });

  it('should decode local time when there is no offset', () => {
    const s = '2024-03-05 14:22:31';
    const d = parsePgTimestampBuffer(buf(s), 0, s.length) as Date;
    expect(d.getFullYear()).toStrictEqual(2024);
    expect(d.getHours()).toStrictEqual(14);
    expect(d.getMinutes()).toStrictEqual(22);
  });

  // The hazard this shape has and a string does not: reading past `end`
  // lands on whatever byte follows in the shared row buffer - the next
  // column's data - instead of running out of input. If those bytes happen
  // to be digits, a truncated timestamp would be accepted as a whole one.
  it('should not read an offset out of the bytes that follow the value', () => {
    // "...+0" with the value ending there, and a '5' sitting right after it.
    const b = buf('2024-03-05 14:22:31+05');
    expect(parsePgTimestampBuffer(b, 0, 21)).toBeUndefined();
    // And the same one byte further on: "...+03:3" followed by '0'.
    const b2 = buf('2024-03-05 14:22:31+03:30');
    expect(parsePgTimestampBuffer(b2, 0, 24)).toBeUndefined();
    // Both are whole values when `end` actually includes those bytes.
    expect(
      (parsePgTimestampBuffer(b, 0, 22) as Date).toISOString(),
    ).toStrictEqual('2024-03-05T09:22:31.000Z');
    expect(
      (parsePgTimestampBuffer(b2, 0, 25) as Date).toISOString(),
    ).toStrictEqual('2024-03-05T10:52:31.000Z');
  });

  it('should decline a non-digit where a digit belongs', () => {
    for (const s of [
      '2024-0x-05 14:22:31',
      '2024-03-x5 14:22:31',
      '2024-03-05 x4:22:31',
      '2024-03-05 14:x2:31',
      '2024-03-05 14:22:x1',
      '20x4-03-05 14:22:31',
    ])
      expect(parsePgTimestampBuffer(buf(s), 0, s.length)).toBeUndefined();
  });

  it('should decline a value too short to be the shape at all', () => {
    const s = '2024-03-05 14:22';
    expect(parsePgTimestampBuffer(buf(s), 0, s.length)).toBeUndefined();
  });
});

describe('parsePgTimestampString()', () => {
  it('should agree with the buffer scan it delegates to', () => {
    for (const s of [
      '2024-03-05 14:22:31',
      '2024-03-05 14:22:31.5',
      '2024-03-05 14:22:31.123456+03',
      '2024-02-29 00:00:00-04:30',
      '1000-01-01 00:00:00+00',
      '9999-12-31 23:59:59.999+14:00',
    ]) {
      const fromString = parsePgTimestampString(s) as Date;
      const fromBuffer = parsePgTimestampBuffer(buf(s), 0, s.length) as Date;
      expect(fromString.getTime()).toStrictEqual(fromBuffer.getTime());
    }
  });

  it('should decline a string carrying a character outside latin1', () => {
    // Copied into the scratch buffer a byte at a time, a code point above
    // 255 would be truncated - and 0x130 would land on '0', turning a
    // string that must be declined into one that parses.
    const s = '2024-03-05 14:22:3' + String.fromCharCode(0x130);
    expect(s.length).toStrictEqual(19);
    expect(parsePgTimestampString(s)).toBeUndefined();
  });

  it('should decline a string longer than any timestamp PostgreSQL prints', () => {
    const s = '2024-03-05 14:22:31.' + '1'.repeat(80);
    expect(parsePgTimestampString(s)).toBeUndefined();
  });

  it('should decline a string too short to be the shape', () => {
    expect(parsePgTimestampString('2024-03-05')).toBeUndefined();
  });
});
