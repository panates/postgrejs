import { expect } from 'expect';
import { Interval, Point } from 'postgrejs';
import { JsonType } from '../../src/data-types/json-type.js';

describe('JsonType', () => {
  describe('encodeText()', () => {
    it('should JSON-stringify an object', () => {
      expect(JsonType.encodeText!({ a: 1 }, {})).toStrictEqual('{"a":1}');
    });

    it('should write a decoded value inside it as its fields', () => {
      // These classes have no toJSON() of their own, so what goes into a
      // json column is the structure rather than the literal - a value
      // stored as `"(1,2)"` is text that nothing can index into.
      expect(JsonType.encodeText!({ p: new Point(1, 2) }, {})).toStrictEqual(
        '{"p":{"x":1,"y":2}}',
      );
      expect(
        JsonType.encodeText!(new Interval({ days: 1, hours: 2 }), {}),
      ).toStrictEqual('{"days":1,"hours":2}');
    });

    it('should write a bigint as a bare numeric literal, not via JSON.stringify()', () => {
      // JSON.stringify() itself cannot serialize a BigInt - it throws.
      expect(JsonType.encodeText!(5n, {})).toStrictEqual('5');
    });

    it('should write a boolean as the literal word true/false', () => {
      expect(JsonType.encodeText!(true, {})).toStrictEqual('true');
      expect(JsonType.encodeText!(false, {})).toStrictEqual('false');
    });

    it('should stringify anything else via string concatenation', () => {
      expect(JsonType.encodeText!(42, {})).toStrictEqual('42');
      expect(JsonType.encodeText!('hi', {})).toStrictEqual('hi');
    });
  });

  describe('decodeBinary()', () => {
    it('should return undefined for an empty binary value', () => {
      expect(JsonType.decodeBinary!(Buffer.alloc(0), 0, 0, {})).toStrictEqual(
        undefined,
      );
    });

    it('should parse non-empty content as JSON', () => {
      const buf = Buffer.from('{"a":1}', 'utf8');
      expect(JsonType.decodeBinary!(buf, 0, buf.length, {})).toStrictEqual({
        a: 1,
      });
    });
  });

  describe('decodeText()', () => {
    it('should return null for an empty string', () => {
      expect(JsonType.decodeText!('', {})).toStrictEqual(null);
    });

    it('should parse a non-empty string as JSON', () => {
      expect(JsonType.decodeText!('{"a":1}', {})).toStrictEqual({ a: 1 });
    });
  });
});
