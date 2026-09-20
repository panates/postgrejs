import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';

/**
 * `tsvector` and `tsquery` decode to the strings PostgreSQL prints -
 * `'cat':1,3 'dog':2` and `'a' & !'b'` - and encode by handing a string
 * straight back to the server. They share this file because they share
 * that decision and half their quoting.
 *
 * **Why the text form.** It is the canonical spelling of both types: what
 * the server accepts back, what the documentation is written in, and what
 * someone inspecting an indexed document or a stored search wants to
 * read. A structure of lexemes and positions, or a query tree, would be a
 * second representation to convert to and from for values that are
 * produced by `to_tsvector`/`to_tsquery` and consumed by a match
 * operator, rather than walked. `pg` leaves both as strings.
 *
 * **Why no encodeBinary.** The server's own input parser is what defines
 * these values. A `tsvector` literal is sorted and deduplicated on the
 * way in, by a byte ordering and a position-merging rule that belong to
 * the server; a `tsquery` literal is a small expression language, with
 * operators that have been added across releases. Re-implementing either
 * here would mean `'b a'::tsvector` or `'a<->b'::tsquery` quietly meaning
 * one thing as a literal and another as a parameter, depending only on
 * which column format the value travelled in. Handing the string over
 * instead makes them the same by construction - the cost is that these
 * two types cannot appear in a binary `COPY`, which `copyFrom` reports
 * by name before it writes a row.
 *
 * Decoding is a different matter and is done here: the tree has already
 * been built by the server, so reading it back is not parsing a grammar.
 */

/** The four weights, in the order the top two bits of a position hold. */
const VECTOR_WEIGHTS = ['', 'C', 'B', 'A'];
/** The weights a query value carries, as a bit each. */
const QUERY_WEIGHTS: [number, string][] = [
  [8, 'A'],
  [4, 'B'],
  [2, 'C'],
  [1, 'D'],
];
const POSITION_MASK = 0x3fff;

const QI_VAL = 1;
const OP_NOT = 1;
const OP_AND = 2;
const OP_OR = 3;
const OP_PHRASE = 4;

/**
 * How tightly each operator binds, which is what decides where the
 * server puts parentheses - and so where this has to put them too.
 */
const PRIORITY: Record<number, number> = {
  [OP_NOT]: 4,
  [OP_PHRASE]: 3,
  [OP_AND]: 2,
  [OP_OR]: 1,
};

/** A lexeme is printed quoted, with `'` doubled and `\` escaped. */
function quote(lexeme: string): string {
  let out = "'";
  const l = lexeme.length;
  let i: number;
  let c: string;
  for (i = 0; i < l; i++) {
    c = lexeme[i];
    if (c === "'" || c === '\\') out += c;
    out += c;
  }
  return out + "'";
}

/**
 * An int32 lexeme count, then for each: the lexeme as a NUL-terminated
 * string, an int16 count of positions, and that many int16s holding the
 * weight in the top two bits and the position in the low fourteen. A
 * weight of D is the default and is not printed.
 */
function decodeVector(v: Buffer, offset: number): string {
  const count = v.readInt32BE(offset);
  let p = offset + 4;
  let out = '';
  let i: number;
  let j: number;
  let end: number;
  let positions: number;
  let entry: number;
  for (i = 0; i < count; i++) {
    end = v.indexOf(0, p);
    if (i) out += ' ';
    out += quote(v.toString('utf8', p, end));
    p = end + 1;
    positions = v.readInt16BE(p);
    p += 2;
    for (j = 0; j < positions; j++) {
      entry = v.readUInt16BE(p);
      p += 2;
      out +=
        (j ? ',' : ':') + (entry & POSITION_MASK) + VECTOR_WEIGHTS[entry >> 14];
    }
  }
  return out;
}

interface QueryNode {
  /** Set on a value node; the others are set on an operator node. */
  lexeme?: string;
  weights?: number;
  prefix?: boolean;
  oper?: number;
  distance?: number;
  left?: QueryNode;
  right?: QueryNode;
}

/**
 * An int32 node count, then the nodes themselves: an operator before its
 * operands, and its right operand before its left. A value node carries
 * a weight bitmask, a prefix flag and a NUL-terminated lexeme; a phrase
 * operator carries an int16 distance.
 */
function readQueryNode(v: Buffer, pos: { p: number }): QueryNode {
  const type = v[pos.p++];
  if (type === QI_VAL) {
    const weights = v[pos.p++];
    const prefix = !!v[pos.p++];
    const end = v.indexOf(0, pos.p);
    const lexeme = v.toString('utf8', pos.p, end);
    pos.p = end + 1;
    return { lexeme, weights, prefix };
  }
  const oper = v[pos.p++];
  if (oper === OP_NOT) return { oper, right: readQueryNode(v, pos) };
  let distance = 0;
  if (oper === OP_PHRASE) {
    distance = v.readInt16BE(pos.p);
    pos.p += 2;
  }
  // Right before left, which is the order they were written in.
  const right = readQueryNode(v, pos);
  const left = readQueryNode(v, pos);
  return { oper, distance, left, right };
}

/**
 * Prints the tree the way the server prints it, parentheses included.
 * An operand is wrapped when it binds more loosely than what it sits
 * under; the extra `rightPhraseOp` case is what keeps
 * `'a' <-> ( 'b' <-> 'c' )` distinct from `'a' <-> 'b' <-> 'c'`, which
 * are different queries.
 */
function printQuery(
  node: QueryNode,
  parentPriority: number,
  rightPhraseOp: boolean,
): string {
  if (node.oper === undefined) {
    let out = quote(node.lexeme!);
    if (node.weights || node.prefix) {
      // The star comes before the letters - `'d':*AB`, not `'d':AB*`.
      out += ':';
      if (node.prefix) out += '*';
      let w: [number, string];
      for (w of QUERY_WEIGHTS) if (node.weights! & w[0]) out += w[1];
    }
    return out;
  }
  const priority = PRIORITY[node.oper];
  if (node.oper === OP_NOT)
    return '!' + printQuery(node.right!, priority, false);
  const op =
    node.oper === OP_AND
      ? '&'
      : node.oper === OP_OR
        ? '|'
        : node.distance === 1
          ? '<->'
          : '<' + node.distance + '>';
  const out =
    printQuery(node.left!, priority, false) +
    ' ' +
    op +
    ' ' +
    printQuery(node.right!, priority, node.oper === OP_PHRASE);
  return priority < parentPriority ||
    (rightPhraseOp && priority === parentPriority)
    ? '( ' + out + ' )'
    : out;
}

export const TsVectorType: DataType = {
  name: 'tsvector',
  oid: DataTypeOIDs.tsvector,
  jsType: 'string',

  // The text form is ordinary-looking text - see inet-type.ts for why
  // none of these string-shaped types join inference.
  inferrable: false,

  encodeText(v: any): string {
    return '' + v;
  },

  decodeBinary(v: Buffer, offset: number = 0): string {
    return decodeVector(v, offset);
  },

  decodeText(v: string): string {
    return v;
  },

  isType(v: any): boolean {
    return typeof v === 'string';
  },
};

export const ArrayTsVectorType: DataType = {
  ...TsVectorType,
  name: '_tsvector',
  oid: DataTypeOIDs._tsvector,
  elementsOID: DataTypeOIDs.tsvector,
};

export const TsQueryType: DataType = {
  ...TsVectorType,
  name: 'tsquery',
  oid: DataTypeOIDs.tsquery,

  decodeBinary(v: Buffer, offset: number = 0): string {
    const count = v.readInt32BE(offset);
    // An empty query prints as nothing, and has no root to read.
    if (!count) return '';
    return printQuery(readQueryNode(v, { p: offset + 4 }), 0, false);
  },
};

export const ArrayTsQueryType: DataType = {
  ...TsQueryType,
  name: '_tsquery',
  oid: DataTypeOIDs._tsquery,
  elementsOID: DataTypeOIDs.tsquery,
};
