import type { DataMappingOptions } from './interfaces/data-mapping-options.js';
import type { SmartBuffer } from './protocol/smart-buffer.js';

export type OID = number;
export type Maybe<T> = T | undefined;
export type Nullable<T> = T | null;
export type Row = any;
export type Callback = (err?: Error | null) => void;
/**
 * What a DataType's own `decodeBinary` implements. `buf` is a shared
 * buffer - the whole row, or the whole array - and this value occupies
 * exactly `len` bytes starting at `offset`.
 *
 * Honouring `len` is the implementation's responsibility, and reading past
 * it is not a bounds error: it silently returns the next column's or
 * element's bytes. A type whose binary form says how long it is - a fixed
 * width like int4's four bytes, or a count it carries itself like
 * numeric's - can ignore `len`; anything that would otherwise read "to the
 * end of the buffer" must not.
 */
export type DecodeBinaryFunction = (
  buf: Buffer,
  offset: number,
  len: number,
  options: DataMappingOptions & Record<string, any>,
) => any;
// A text-format value has no constant byte width (e.g. int4's decimal text
// form varies from 1 to 11 characters), so it needs an explicit `len` to
// know where its own value ends within the shared row buffer - the same
// reasoning as DecodeBinaryFunction above and ResolvedColumnParser below.
export type DecodeTextBufferFunction = (
  buf: Buffer,
  offset: number,
  len: number,
  options: DataMappingOptions & Record<string, any>,
) => any;
export type EncodeBinaryFunction = (
  buf: SmartBuffer,
  v: any,
  options: DataMappingOptions,
) => void;
export type EncodeCalculateDimFunction = (v: any[]) => number[];
export type EncodeAsNullFunction = (
  v: any,
  options: DataMappingOptions,
) => boolean;
export type DecodeTextFunction = (v: any, options: DataMappingOptions) => any;
export type EncodeTextFunction = (
  v: any,
  options: DataMappingOptions,
) => string;
// The per-column parser functions get-parsers.ts hands back - called as
// (data, offset, len, options) where `data` is the ENTIRE row's raw
// buffer and `offset`/`len` locate this column's own value within it
// (see parse-row.ts). Same shape as the DataType's own decode functions,
// which is what lets get-parsers.ts pass the arguments straight through
// rather than slicing a bounded buffer per value.
export type ResolvedColumnParser = (
  data: Buffer,
  offset: number,
  len: number,
  options: DataMappingOptions & Record<string, any>,
) => any;
export type AnyParseFunction = ResolvedColumnParser;
export type DebugLogger = (
  namespace: string,
  format: any,
  ...args: any[]
) => void;
