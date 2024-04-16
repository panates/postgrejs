import type { DataMappingOptions } from './interfaces/data-mapping-options.js';
import type { SmartBuffer } from './protocol/smart-buffer';

export type OID = number;
export type Maybe<T> = T | undefined;
export type Nullable<T> = T | null;
export type Row = any;
export type Callback = (err?: Error, value?: any) => void;
export type DecodeBinaryFunction = (buf: Buffer, options: DataMappingOptions & Record<string, any>) => any;
export type EncodeBinaryFunction = (buf: SmartBuffer, v: any, options: DataMappingOptions) => void;
export type EncodeCalculateDimFunction = (v: any[]) => number[];
export type ParseTextFunction = (v: any, options: DataMappingOptions) => any;
export type EncodeTextFunction = (v: any, options: DataMappingOptions) => string;
export type AnyParseFunction = ParseTextFunction | DecodeBinaryFunction;
export type DebugLogger = (namespace: string, format: any, ...args: any[]) => void;
