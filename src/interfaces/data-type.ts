import type {
  DecodeBinaryFunction,
  EncodeBinaryFunction,
  EncodeTextFunction,
  OID,
  ParseTextFunction
} from '../types.js';

export interface DataType {
  oid: OID;
  name: string;
  elementsOID?: OID;
  jsType: string;
  arraySeparator?: string;
  isType: (v: any) => boolean;
  parseBinary: DecodeBinaryFunction;
  parseText: ParseTextFunction;
  encodeBinary?: EncodeBinaryFunction;
  encodeText?: EncodeTextFunction;
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

