import { expect } from 'expect';
import { BoolType } from '../../src/data-types/bool-type.js';

describe('BoolType', () => {
  it('should encode true/false as "t"/"f" for the text/literal path', () => {
    expect(BoolType.encodeText!(true)).toStrictEqual('t');
    expect(BoolType.encodeText!(false)).toStrictEqual('f');
  });
});
