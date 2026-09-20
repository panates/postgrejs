import { expect } from 'expect';
import { JsonPathType } from '../../src/data-types/jsonpath-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function wire(v: any): string {
  const buf = new SmartBuffer();
  JsonPathType.encodeBinary!(buf, v, {});
  // `buffer` is the whole allocation, `size` is how much of it was written.
  return buf.buffer.toString('hex', 0, buf.size);
}

function roundTrip(v: any): string {
  const buf = new SmartBuffer();
  JsonPathType.encodeBinary!(buf, v, {});
  return JsonPathType.decodeBinary!(buf.buffer, 0, buf.size, {});
}

describe('JsonPathType', () => {
  it('should encode a version byte and then the expression', () => {
    // 01 then `$."a"` - what the live server sent for the same value.
    expect(wire('$."a"')).toStrictEqual('01242e226122');
    expect(wire('$."a"[*]."b"')).toStrictEqual('01242e2261225b2a5d2e226222');
  });

  it('should round-trip an expression, multi-byte characters included', () => {
    for (const v of [
      '$."a"[*]."b"',
      '$."x"',
      'strict $."x"?(@ > 1)',
      '$[*]?(@ > 3)',
      '$."ü"',
      'lax $."a"."b"',
    ]) {
      expect(roundTrip(v)).toStrictEqual(v);
    }
  });

  it('should read only as far as the length it is given', () => {
    // Which is how it arrives: pointed into the shared row buffer, with
    // the next column's bytes right behind it.
    const buf = Buffer.concat([
      Buffer.from('ffff', 'hex'),
      Buffer.from([1]),
      Buffer.from('$."a"'),
      Buffer.from('ffff', 'hex'),
    ]);
    expect(JsonPathType.decodeBinary!(buf, 2, 6, {})).toStrictEqual('$."a"');
  });

  it('should refuse a version it does not know', () => {
    const buf = Buffer.concat([Buffer.from([2]), Buffer.from('$."a"')]);
    expect(() => JsonPathType.decodeBinary!(buf, 0, buf.length, {})).toThrow(
      'Unsupported jsonpath version 2',
    );
  });

  it('should refuse a non-string', () => {
    expect(() => wire(42)).toThrow('not a valid jsonpath');
    expect(() => wire(null)).toThrow('not a valid jsonpath');
  });

  describe('isType()', () => {
    it('should accept an expression, with or without a mode word', () => {
      expect(JsonPathType.isType('$."a"')).toStrictEqual(true);
      expect(JsonPathType.isType('strict $."x"?(@ > 1)')).toStrictEqual(true);
      expect(JsonPathType.isType('lax $.a')).toStrictEqual(true);
      expect(JsonPathType.isType('@ > 1')).toStrictEqual(true);
    });

    it('should refuse ordinary text and a non-string', () => {
      expect(JsonPathType.isType('hello')).toStrictEqual(false);
      expect(JsonPathType.isType('')).toStrictEqual(false);
      expect(JsonPathType.isType(42)).toStrictEqual(false);
    });

    it('should not be offered to inference', () => {
      expect(JsonPathType.inferrable).toStrictEqual(false);
    });
  });

  it('should hand the text path over as written', () => {
    expect(JsonPathType.encodeText!('$.a', {})).toStrictEqual('$.a');
    expect(JsonPathType.decodeText!('$."a"', {})).toStrictEqual('$."a"');
  });
});
