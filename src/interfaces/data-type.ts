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
