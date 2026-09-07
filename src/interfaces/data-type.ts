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
  decodeBinary: DecodeBinaryFunction;
  decodeText: DecodeTextFunction;
  // Optional fast path: decodes straight from the raw wire Buffer instead
  // of the pre-converted UTF-8 string decodeText receives. Only meaningful
  // for text-format scalar columns; see get-parsers.ts for how it's used.
  decodeTextBuffer?: DecodeTextBufferFunction;
  // Declares this type's binary wire representation as always exactly N
  // bytes (independent of value - e.g. int4 is always 4, timestamp always
  // 8), letting decodeBinaryArray() read array elements directly out of
  // the original wire buffer at each element's offset instead of slicing
  // a throwaway Buffer view per element first. Leave unset for anything
  // whose binary length varies by value (bytea, varchar, json, jsonb,
  // numeric) - those still need decodeBinaryArray() to hand them a
  // properly-bounded slice, since decodeBinary has no way to know where
  // its own value ends otherwise.
  fixedBinarySize?: number;
  encodeAsNull?: EncodeAsNullFunction;
  encodeBinary?: EncodeBinaryFunction;
  encodeText?: EncodeTextFunction;
  encodeCalculateDim?: EncodeCalculateDimFunction;
}

export interface Point {
  x: number;
  y: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Rectangle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
