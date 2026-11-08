import type { DataMappingOptions } from './interfaces/data-mapping-options.js';
import type { SmartBuffer } from './protocol/smart-buffer.js';

/** A PostgreSQL type identifier, as `pg_type.oid` gives it. */
export type OID = number;
/** `T`, or nothing. */
export type Maybe<T> = T | undefined;
/** `T`, or SQL NULL. */
export type Nullable<T> = T | null;
/** One decoded row - an array, an object, or whatever a custom decoder returns. */
export type Row = any;
/** The node-style callback the stream-facing methods accept. */
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
/**
 * What a DataType's own `decodeTextBuffer` implements: the same value
 * `decodeText` would be given, still as bytes in the shared row buffer.
 */
/* A text-format value has no constant byte width - int4's decimal form
   runs from 1 to 11 characters - so it needs an explicit `len` to know
   where its own value ends within the shared buffer, the same reasoning
   as DecodeBinaryFunction above and ResolvedColumnParser below. */
export type DecodeTextBufferFunction = (
  buf: Buffer,
  offset: number,
  len: number,
  options: DataMappingOptions & Record<string, any>,
) => any;
/** What a DataType's own `encodeBinary` implements: writes the value into the send buffer. */
export type EncodeBinaryFunction = (
  buf: SmartBuffer,
  v: any,
  options: DataMappingOptions,
) => void;
/** Measures an array's dimensions, for a type whose own values are arrays. */
export type EncodeCalculateDimFunction = (v: any[]) => number[];
/** Whether this value should go out as SQL NULL instead of being encoded. */
export type EncodeAsNullFunction = (
  v: any,
  options: DataMappingOptions,
) => boolean;
/** What a DataType's own `decodeText` implements: reads the value out of the server's text. */
export type DecodeTextFunction = (v: any, options: DataMappingOptions) => any;
/** What a DataType's own `encodeText` implements: renders the value as text the server parses. */
export type EncodeTextFunction = (
  v: any,
  options: DataMappingOptions,
) => string;
/**
 * One column's parser, already chosen for the format that column arrives
 * in: called with the whole row's buffer and where this value sits in
 * it.
 */
/* Same shape as the DataType's own decode functions, which is what lets
   get-parsers.ts pass the arguments straight through rather than slicing
   a bounded buffer per value - see parse-row.ts for the call. */
export type ResolvedColumnParser = (
  data: Buffer,
  offset: number,
  len: number,
  options: DataMappingOptions & Record<string, any>,
) => any;
/** Any of the decode functions, which all share the column parser's shape. */
export type AnyParseFunction = ResolvedColumnParser;
/** What `debugLogger` is called with - a namespace, then `util.format` arguments. */
export type DebugLogger = (
  namespace: string,
  format: any,
  ...args: any[]
) => void;
