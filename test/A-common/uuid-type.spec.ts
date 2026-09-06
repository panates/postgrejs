import { expect } from 'expect';
import { UuidType } from '../../src/data-types/uuid-type.js';

describe('UuidType', () => {
  it('should encode as its string form for the text/literal path', () => {
    expect(
      UuidType.encodeText!('123e4567-e89b-12d3-a456-426614174000'),
    ).toStrictEqual('123e4567-e89b-12d3-a456-426614174000');
  });

  it('should refuse to encode a value that is not a valid guid', () => {
    const buf = { writeBuffer: () => undefined };
    expect(() => UuidType.encodeBinary!(buf as any, 'not-a-guid', {})).toThrow(
      /is not a valid guid value/,
    );
  });
});
