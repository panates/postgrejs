import { expect } from 'expect';
import { Float4Type } from '../../src/data-types/float4-type.js';
import { Float8Type } from '../../src/data-types/float8-type.js';

describe('Float4Type', () => {
  it('should encode as its string form for the text/literal path', () => {
    expect(Float4Type.encodeText!(1.5)).toStrictEqual('1.5');
    expect(Float4Type.encodeText!(Infinity)).toStrictEqual('Infinity');
  });

  it('should parse a string value before writing it as binary', () => {
    let written: number | undefined;
    const buf = { writeFloatBE: (v: number) => (written = v) };
    Float4Type.encodeBinary!(buf as any, '2.5' as any, {});
    expect(written).toStrictEqual(2.5);
  });
});

describe('Float8Type', () => {
  it('should encode as its string form for the text/literal path', () => {
    expect(Float8Type.encodeText!(1.5)).toStrictEqual('1.5');
    expect(Float8Type.encodeText!(NaN)).toStrictEqual('NaN');
  });

  it('should parse a string value before writing it as binary', () => {
    let written: number | undefined;
    const buf = { writeDoubleBE: (v: number) => (written = v) };
    Float8Type.encodeBinary!(buf as any, '2.5' as any, {});
    expect(written).toStrictEqual(2.5);
  });
});
