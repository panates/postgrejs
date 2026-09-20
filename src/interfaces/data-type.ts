import type {
  DecodeBinaryFunction,
  DecodeTextBufferFunction,
  DecodeTextFunction,
  EncodeAsNullFunction,
  EncodeBinaryFunction,
  EncodeCalculateDimFunction,
  EncodeTextFunction,
  OID,
} from '../types.js';

export interface DataType {
  oid: OID;
  name: string;
  elementsOID?: OID;
  isArray?: boolean;
  jsType: string;
  arraySeparator?: string;
  isType: (v: any) => boolean;
  /**
   * Whether DataTypeMap.determine() may pick this type for a value, which
   * it does by asking `isType`. Defaults to true.
   *
   * `false` is for a type that can genuinely hold the value - so `isType`
   * answers truthfully for anyone who asks it directly - but that no
   * caller means when they pass a plain JavaScript value. Inference then
   * passes it by and the type is reached only by asking for it, with
   * `new BindParam(oid, value)`.
   */
  inferrable?: boolean;
  decodeBinary: DecodeBinaryFunction;
  decodeText: DecodeTextFunction;
  // Optional fast path: decodes straight from the raw wire Buffer instead
  // of the pre-converted UTF-8 string decodeText receives. Only meaningful
  // for text-format scalar columns; see get-parsers.ts for how it's used.
  decodeTextBuffer?: DecodeTextBufferFunction;
  encodeAsNull?: EncodeAsNullFunction;
  encodeBinary?: EncodeBinaryFunction;
  encodeText?: EncodeTextFunction;
  encodeCalculateDim?: EncodeCalculateDimFunction;
}

/**
 * The shape `box` and `lseg` share.
 *
 * @deprecated Both types now decode to a class of their own - `Box` and
 *   `LineSegment` - which is what tells them apart; they were
 *   indistinguishable while both were only this. Kept because a plain
 *   object of these four numbers is still accepted as a parameter.
 */
export interface Rectangle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
