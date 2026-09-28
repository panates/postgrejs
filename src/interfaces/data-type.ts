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

/**
 * How one PostgreSQL type is read and written.
 *
 * One of these per type in a `DataTypeMap`, and the extension point for
 * a type this client does not know: register it on the global map or on
 * one of a connection's own, and every column and parameter of that OID
 * goes through it.
 *
 * A type needs to decode - both formats, since which one arrives depends
 * on what the column asked for - and needs to encode only what callers
 * will send. Registering the array counterpart is a separate entry, with
 * `elementsOID` pointing back at this one.
 */
export interface DataType {
  /** The type's own OID, as `pg_type` gives it. */
  oid: OID;
  /** The type's name, for `FieldInfo.dataTypeName` and for errors. */
  name: string;
  /** For an array type, the OID of what it is an array of. */
  elementsOID?: OID;
  /** Whether this entry is the array counterpart. */
  isArray?: boolean;
  /** What a decoded value is, named for `FieldInfo.jsType`. */
  jsType: string;
  /** What separates elements in this type's array literal - a comma for all but `box`. */
  arraySeparator?: string;
  /**
   * Whether a JavaScript value could be of this type, asked when nothing
   * declared one - see `inferrable` for when it is asked at all.
   */
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
  /** Reads a value out of the binary wire format. */
  decodeBinary: DecodeBinaryFunction;
  /** Reads a value out of the text the server rendered. */
  decodeText: DecodeTextFunction;
  /**
   * Reads a text value straight from the wire buffer, when the type can
   * do better than being handed a string.
   */
  /* The pre-converted UTF-8 string decodeText receives costs an
     allocation per value; a type that can read the bytes skips it. Only
     meaningful for text-format scalar columns - see get-parsers.ts for
     when it is preferred. */
  decodeTextBuffer?: DecodeTextBufferFunction;
  /** Whether a value should go out as SQL NULL rather than be encoded. */
  encodeAsNull?: EncodeAsNullFunction;
  /** Writes a value in the binary wire format. */
  encodeBinary?: EncodeBinaryFunction;
  /** Renders a value as the text the server parses. */
  encodeText?: EncodeTextFunction;
  /** Measures an array's dimensions, for a type whose values are arrays themselves. */
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
  /** First corner's x. */
  x1: number;
  /** First corner's y. */
  y1: number;
  /** Second corner's x. */
  x2: number;
  /** Second corner's y. */
  y2: number;
}
