import { expect } from 'expect';
import { JsonType } from '../../src/data-types/json-type.js';

describe('JsonType', () => {
  describe('encodeText()', () => {
    it('should JSON-stringify an object', () => {
      expect(JsonType.encodeText!({ a: 1 }, {})).toStrictEqual('{"a":1}');
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
    it('should return the raw text when fetchAsString includes the json oid', () => {
      const buf = Buffer.from('{"a":1}', 'utf8');
      expect(
        JsonType.decodeBinary!(buf, 0, { fetchAsString: [114] }),
      ).toStrictEqual('{"a":1}');
    });

    it('should return undefined for an empty binary value', () => {
      expect(JsonType.decodeBinary!(Buffer.alloc(0), 0, {})).toStrictEqual(
        undefined,
      );
    });

    it('should parse non-empty content as JSON', () => {
      const buf = Buffer.from('{"a":1}', 'utf8');
      expect(JsonType.decodeBinary!(buf, 0, {})).toStrictEqual({ a: 1 });
    });
  });

  describe('decodeText()', () => {
    it('should return the raw text when fetchAsString includes the json oid', () => {
      expect(
        JsonType.decodeText!('{"a":1}', { fetchAsString: [114] }),
      ).toStrictEqual('{"a":1}');
    });

    it('should return null for an empty string', () => {
      expect(JsonType.decodeText!('', {})).toStrictEqual(null);
    });

    it('should parse a non-empty string as JSON', () => {
      expect(JsonType.decodeText!('{"a":1}', {})).toStrictEqual({ a: 1 });
    });
  });
});
