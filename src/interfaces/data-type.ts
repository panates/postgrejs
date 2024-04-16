import type {
  DecodeBinaryFunction,
  EncodeBinaryFunction,
  EncodeTextFunction,
  OID,
  ParseTextFunction,
} from '../types.js';
import { EncodeCalculateDimFunction } from '../types.js';

export interface DataType {
  oid: OID;
  name: string;
  elementsOID?: OID;
  isArray?: boolean;
  jsType: string;
  arraySeparator?: string;
  isType: (v: any) => boolean;
  parseBinary: DecodeBinaryFunction;
  parseText: ParseTextFunction;
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
