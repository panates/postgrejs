import { expect } from 'expect';
import {
  TsQueryType,
  TsVectorType,
} from '../../src/data-types/tsvector-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

/**
 * Builds a tsvector the way the server writes one: an int32 lexeme
 * count, then each lexeme NUL-terminated, an int16 position count, and
 * that many int16s holding the weight in the top two bits.
 */
function vector(
  lexemes: [string, [number, number][]][],
  pad = 0,
): { buf: Buffer; len: number } {
  const io = new SmartBuffer();
  io.writeBytes(Buffer.alloc(pad, 0xff));
  io.writeInt32BE(lexemes.length);
  for (const [lexeme, positions] of lexemes) {
    io.writeCString(lexeme, 'utf8');
    io.writeInt16BE(positions.length);
    for (const [position, weight] of positions)
      io.writeUInt16BE((weight << 14) | position);
  }
  const len = io.size - pad;
  io.writeBytes(Buffer.alloc(pad, 0xff));
  return { buf: io.buffer, len };
}

function decodeVector(
  lexemes: [string, [number, number][]][],
  pad = 0,
): string {
  const { buf, len } = vector(lexemes, pad);
  return TsVectorType.decodeBinary!(buf, pad, len, {});
}

const VAL = 1;
const OPR = 2;
const NOT = 1;
const AND = 2;
const OR = 3;
const PHRASE = 4;

/**
 * Builds a tsquery: an int32 node count, then the nodes with each
 * operator before its operands and its right operand before its left.
 */
function query(nodes: any[][]): string {
  const io = new SmartBuffer();
  io.writeInt32BE(nodes.length);
  for (const n of nodes) {
    if (n[0] === VAL) {
      io.writeUInt8(VAL);
      io.writeUInt8(n[1]); // weight bitmask
      io.writeUInt8(n[2]); // prefix
      io.writeCString(n[3], 'utf8');
    } else {
      io.writeUInt8(OPR);
      io.writeUInt8(n[1]);
      if (n[1] === PHRASE) io.writeInt16BE(n[2]);
    }
  }
  return TsQueryType.decodeBinary!(io.buffer, 0, io.size, {});
}

const a = [VAL, 0, 0, 'a'];
const b = [VAL, 0, 0, 'b'];
const c = [VAL, 0, 0, 'c'];

describe('TsVectorType', () => {
  it('should print each lexeme quoted, separated by a space', () => {
    expect(
      decodeVector([
        ['a', []],
        ['b', []],
      ]),
    ).toStrictEqual("'a' 'b'");
  });

  it('should print positions after a colon, separated by commas', () => {
    expect(
      decodeVector([
        [
          'cat',
          [
            [1, 0],
            [3, 0],
          ],
        ],
        ['dog', [[2, 0]]],
      ]),
    ).toStrictEqual("'cat':1,3 'dog':2");
  });

  it('should letter the weights, leaving D - the default - unwritten', () => {
    expect(
      decodeVector([
        [
          'a',
          [
            [1, 3],
            [2, 2],
            [3, 1],
            [4, 0],
          ],
        ],
      ]),
    ).toStrictEqual("'a':1A,2B,3C,4");
  });

  it('should read an empty vector, which is the count and nothing else', () => {
    expect(decodeVector([])).toStrictEqual('');
  });

  it('should double a quote inside a lexeme and escape a backslash', () => {
    expect(decodeVector([["te'", [[1, 0]]]])).toStrictEqual("'te''':1");
    expect(decodeVector([['\\', []]])).toStrictEqual("'\\\\'");
    expect(
      decodeVector([
        [
          'a b',
          [
            [1, 3],
            [2, 0],
          ],
        ],
      ]),
    ).toStrictEqual("'a b':1A,2");
  });

  it('should read a multi-byte lexeme and the highest position there is', () => {
    expect(decodeVector([['ü', [[1, 3]]]])).toStrictEqual("'ü':1A");
    expect(decodeVector([['zebra', [[16383, 0]]]])).toStrictEqual(
      "'zebra':16383",
    );
  });

  it('should read from the offset it is given', () => {
    // Which is how it arrives: pointed into the shared row buffer, with
    // other columns' bytes on both sides.
    expect(decodeVector([['a', [[1, 0]]]], 4)).toStrictEqual("'a':1");
  });

  it('should not offer itself to inference, or a binary encoder', () => {
    expect(TsVectorType.inferrable).toStrictEqual(false);
    // The server's own parser is what orders and deduplicates a vector,
    // so a parameter goes over as text and comes back meaning exactly
    // what the same literal would have.
    expect(TsVectorType.encodeBinary).toStrictEqual(undefined);
    expect(TsVectorType.encodeText!('b a', {})).toStrictEqual('b a');
  });
});

describe('TsQueryType', () => {
  it('should print a binary operator between its operands', () => {
    expect(query([[OPR, AND], b, a])).toStrictEqual("'a' & 'b'");
    expect(query([[OPR, OR], b, a])).toStrictEqual("'a' | 'b'");
  });

  it('should print a phrase operator with its distance', () => {
    expect(query([[OPR, PHRASE, 1], b, a])).toStrictEqual("'a' <-> 'b'");
    expect(query([[OPR, PHRASE, 3], b, a])).toStrictEqual("'a' <3> 'b'");
  });

  it('should prefix a NOT, which binds tightest and never needs parentheses', () => {
    expect(query([[OPR, NOT], a])).toStrictEqual("!'a'");
    expect(query([[OPR, NOT], [OPR, NOT], a])).toStrictEqual("!!'a'");
  });

  it('should leave out parentheses the precedence already implies', () => {
    // & binds tighter than |, so `a | (b & c)` needs none.
    expect(query([[OPR, OR], [OPR, AND], c, b, a])).toStrictEqual(
      "'a' | 'b' & 'c'",
    );
  });

  it('should add them where it does not', () => {
    expect(query([[OPR, AND], c, [OPR, OR], b, a])).toStrictEqual(
      "( 'a' | 'b' ) & 'c'",
    );
    expect(query([[OPR, AND], [OPR, OR], c, b, a])).toStrictEqual(
      "'a' & ( 'b' | 'c' )",
    );
    expect(query([[OPR, NOT], [OPR, AND], b, a])).toStrictEqual(
      "!( 'a' & 'b' )",
    );
  });

  it('should keep a right-hand phrase parenthesised, which changes the query', () => {
    // `a <-> (b <-> c)` and `(a <-> b) <-> c` are different queries, and
    // only the first needs the parentheses to stay itself.
    expect(query([[OPR, PHRASE, 1], [OPR, PHRASE, 1], c, b, a])).toStrictEqual(
      "'a' <-> ( 'b' <-> 'c' )",
    );
    expect(query([[OPR, PHRASE, 1], c, [OPR, PHRASE, 1], b, a])).toStrictEqual(
      "'a' <-> 'b' <-> 'c'",
    );
  });

  it('should print the prefix star before the weight letters', () => {
    expect(query([[VAL, 0, 1, 'a']])).toStrictEqual("'a':*");
    expect(query([[VAL, 0b1100, 0, 'a']])).toStrictEqual("'a':AB");
    expect(query([[VAL, 0b1100, 1, 'd']])).toStrictEqual("'d':*AB");
    expect(query([[VAL, 0b0001, 0, 'a']])).toStrictEqual("'a':D");
  });

  it('should read an empty query, which has no root at all', () => {
    // What a query of nothing but stop words comes to.
    expect(query([])).toStrictEqual('');
  });

  it('should not offer itself to inference, or a binary encoder', () => {
    expect(TsQueryType.inferrable).toStrictEqual(false);
    // The query grammar belongs to the server - see the file's own note.
    expect(TsQueryType.encodeBinary).toStrictEqual(undefined);
    expect(TsQueryType.encodeText!('a<->b', {})).toStrictEqual('a<->b');
  });
});
