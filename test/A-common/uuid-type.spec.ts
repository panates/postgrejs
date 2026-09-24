import { expect } from 'expect';
import { UuidType } from '../../src/data-types/uuid-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

describe('UuidType', () => {
  describe('decodeBinary()', () => {
    /**
     * The canonical text is written into one reused scratch buffer and
     * read back per value, instead of five `toString('hex')` calls and
     * four concatenations - 25 000 strings and 20 000 concatenations for
     * a 5 000-row column, which was more work than `pg` does for the
     * same column despite this client reading half the bytes. Measured
     * over 5 000 values: 1.89 ms before, 0.32 ms now.
     *
     * So what has to be pinned is that the string is still exactly the
     * one it was, and that the reuse cannot show.
     */
    const CASES: [string, number[]][] = [
      [
        '00000000-0000-0000-0000-000000000000',
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
      [
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        [
          255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
          255, 255,
        ],
      ],
      [
        '123e4567-e89b-12d3-a456-426614174000',
        [
          0x12, 0x3e, 0x45, 0x67, 0xe8, 0x9b, 0x12, 0xd3, 0xa4, 0x56, 0x42,
          0x66, 0x14, 0x17, 0x40, 0x00,
        ],
      ],
      [
        // A v4 with the high bits set in both the version and variant
        // nibbles, and a leading zero in every group - the places a hex
        // digit goes missing when one is dropped.
        '0a0b0c0d-0e0f-4a0b-8c0d-0e0f0a0b0c0d',
        [
          0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x4a, 0x0b, 0x8c, 0x0d, 0x0e,
          0x0f, 0x0a, 0x0b, 0x0c, 0x0d,
        ],
      ],
    ];

    for (const [text, bytes] of CASES)
      it(`should read ${text}`, () => {
        expect(
          UuidType.decodeBinary!(Buffer.from(bytes), 0, 16, {}),
        ).toStrictEqual(text);
      });

    it('should read one that does not start at the beginning', () => {
      const [text, bytes] = CASES[2];
      const buf = Buffer.concat([Buffer.alloc(7, 0xaa), Buffer.from(bytes)]);
      expect(UuidType.decodeBinary!(buf, 7, 16, {})).toStrictEqual(text);
    });

    it('should not let one value reach into the next', () => {
      // The scratch is shared, so a value decoded earlier must not
      // change when the next one is read - the string is built before
      // anything else can run, but nothing says so except this.
      const first = UuidType.decodeBinary!(Buffer.from(CASES[2][1]), 0, 16, {});
      const second = UuidType.decodeBinary!(
        Buffer.from(CASES[1][1]),
        0,
        16,
        {},
      );
      expect(first).toStrictEqual(CASES[2][0]);
      expect(second).toStrictEqual(CASES[1][0]);
    });

    it('should round-trip every case through encodeBinary()', () => {
      for (const [text] of CASES) {
        const buf = new SmartBuffer();
        UuidType.encodeBinary!(buf, text, {});
        expect(UuidType.decodeBinary!(buf.toBuffer(), 0, 16, {})).toStrictEqual(
          text,
        );
      }
    });
  });

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
