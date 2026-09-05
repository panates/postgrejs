import type { DataMappingOptions } from './interfaces/data-mapping-options.js';
import type { SmartBuffer } from './protocol/smart-buffer.js';

export type OID = number;
export type Maybe<T> = T | undefined;
export type Nullable<T> = T | null;
export type Row = any;
export type Callback = (err?: Error | null) => void;
export type DecodeBinaryFunction = (
  buf: Buffer,
  offset: number,
  options: DataMappingOptions & Record<string, any>,
) => any;
// parseTextBuffer is only ever used for non-array scalar columns (see
// get-parsers.ts's isArray check), but - unlike DecodeBinaryFunction's
// fixed-width binary columns - a text-format value has no constant byte
// width (e.g. int4's decimal text form varies from 1 to 11 characters),
// so it needs an explicit `len` (not just `offset`) to know where its own
// value ends within the shared row buffer, same reasoning as
// ResolvedColumnParser below.
export type ParseTextBufferFunction = (
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
export type ParseTextFunction = (v: any, options: DataMappingOptions) => any;
export type EncodeTextFunction = (
  v: any,
  options: DataMappingOptions,
) => string;
// The per-column parser functions get-parsers.ts hands back - called as
// (data, offset, len, options) where `data` is the ENTIRE row's raw
// buffer and `offset`/`len` locate this column's own value within it
// (see parse-row.ts). Distinct from DecodeBinaryFunction (3-arg: buf,
// offset, options), which is what each DataType's own parseBinary
// implements - get-parsers.ts's closures wrap those with the extra `len`
// bound where needed (see get-parsers.ts's fixedBinarySize gate).
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
