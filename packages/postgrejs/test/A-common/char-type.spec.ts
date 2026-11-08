import { expect } from 'expect';
import { CharType } from '../../src/data-types/char-type.js';

describe('CharType', () => {
  it('should encode as the string form for the text/literal path', () => {
    expect(CharType.encodeText!('a')).toStrictEqual('a');
    expect(CharType.encodeText!(5)).toStrictEqual('5');
  });

  it('should encode a falsy value as a single space, not an empty string', () => {
    let written: string | undefined;
    const buf = { writeString: (s: string) => (written = s) };
    CharType.encodeBinary!(buf as any, '' as any, {});
    expect(written).toStrictEqual(' ');
  });

  it('should decode a length-bounded slice directly from the row buffer', () => {
    const row = Buffer.from('xxAyy', 'utf8');
    expect(CharType.decodeTextBuffer!(row, 2, 1, {})).toStrictEqual('A');
  });
});
