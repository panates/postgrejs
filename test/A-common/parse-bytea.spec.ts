import { expect } from 'expect';
import { parseBytea, parseByteaBuffer } from '../../src/util/parse-bytea.js';

describe('parse-bytea', () => {
  describe('parseBytea() - hex format (bytea_output=hex, the PostgreSQL default)', () => {
    it('should decode a \\x-prefixed hex string', () => {
      expect(parseBytea('\\x48656c6c6f')).toStrictEqual(Buffer.from('Hello'));
    });

    it('should decode an empty hex value', () => {
      expect(parseBytea('\\x')).toStrictEqual(Buffer.alloc(0));
    });
  });

  describe('parseBytea() - legacy escape format', () => {
    it('should pass ordinary characters through unchanged', () => {
      expect(parseBytea('abc')).toStrictEqual(Buffer.from('abc', 'binary'));
    });

    it('should decode a \\ddd octal-escaped byte', () => {
      // \141 (octal) = 97 = 'a'
      expect(parseBytea('\\141bc')).toStrictEqual(Buffer.from('abc'));
    });

    it('should decode a doubled backslash as one literal backslash byte', () => {
      expect(parseBytea('a\\\\b')).toStrictEqual(Buffer.from('a\\b'));
    });

    it('should mix literal characters and octal escapes', () => {
      // 'a' literal, \142 (octal) = 98 = 'b', 'c' literal
      expect(parseBytea('a\\142c')).toStrictEqual(Buffer.from('abc'));
    });

    it('should make forward progress on a lone, unescaped trailing backslash', () => {
      // Malformed per PostgreSQL's own escape grammar (a backslash always
      // starts either a \ddd triplet or a doubled \\), but must still
      // terminate rather than loop forever re-scanning the same position -
      // the `|| 1` fallback this exercises is what stops that.
      expect(parseBytea('a\\')).toStrictEqual(Buffer.from('a'));
    });

    it('should decode three consecutive backslashes as one literal backslash plus a lone one', () => {
      // 3 backslashes: paired into 1 literal '\' (u=1), with one left over
      // that cannot pair - same forward-progress case as above, just with
      // a real pair ahead of it.
      expect(parseBytea('\\\\\\')).toStrictEqual(Buffer.from('\\'));
    });
  });

  describe('parseByteaBuffer() - hex format', () => {
    it('should decode a \\x-prefixed hex value straight from the wire buffer', () => {
      const buf = Buffer.from('\\x48656c6c6f');
      expect(parseByteaBuffer(buf, 0, buf.length)).toStrictEqual(
        Buffer.from('Hello'),
      );
    });

    it('should honor a non-zero offset/len within a larger shared buffer', () => {
      const value = '\\x48656c6c6f';
      const buf = Buffer.concat([
        Buffer.from('prefix-garbage'),
        Buffer.from(value),
        Buffer.from('-suffix-garbage'),
      ]);
      expect(
        parseByteaBuffer(buf, 'prefix-garbage'.length, value.length),
      ).toStrictEqual(Buffer.from('Hello'));
    });

    it('should truncate a trailing odd hex nibble instead of throwing', () => {
      // 3 hex digits after \x - only the first full pair ("48") decodes,
      // matching Buffer.from(hexString, 'hex')'s own silent-truncate
      // behavior for an odd-length hex string.
      const buf = Buffer.from('\\x486');
      expect(parseByteaBuffer(buf, 0, buf.length)).toStrictEqual(
        Buffer.from([0x48]),
      );
    });
  });

  describe('parseByteaBuffer() - legacy escape format', () => {
    it('should fall back to the escape grammar via a latin1 buffer->string conversion', () => {
      const buf = Buffer.from('a\\142c', 'latin1');
      expect(parseByteaBuffer(buf, 0, buf.length)).toStrictEqual(
        Buffer.from('abc'),
      );
    });

    it('should honor a non-zero offset/len for the escape path too', () => {
      const value = 'a\\142c';
      const buf = Buffer.concat([
        Buffer.from('xx', 'latin1'),
        Buffer.from(value, 'latin1'),
      ]);
      expect(parseByteaBuffer(buf, 2, value.length)).toStrictEqual(
        Buffer.from('abc'),
      );
    });
  });
});
