import type { Readable } from 'node:stream';
import { GlobalTypeMap } from '../data-type-map.js';
import type { CopyFromRowsOptions } from '../interfaces/copy-from-rows-options.js';
import { SmartBuffer } from '../protocol/smart-buffer.js';
import type { OID } from '../types.js';
import {
  assertCopyBinaryEncodable,
  COPY_BINARY_HEADER,
  COPY_BINARY_TRAILER,
  encodeCopyBinaryRow,
} from './encode-copy-binary.js';
import { escapeIdentifier } from './escape-identifier.js';

/** Default bytes accumulated before a CopyData message goes out. */
export const DEFAULT_COPY_CHUNK_SIZE = 128 * 1024;

export type CopyRow = any[] | Record<string, any>;
export type CopyRowSource =
  Iterable<CopyRow> | AsyncIterable<CopyRow> | Readable;

/**
 * Quotes a possibly schema-qualified name. A single dot separates schema
 * from table, which is what PostgreSQL's own client tools assume for a name
 * given as one string; a table whose name genuinely contains a dot has to
 * be reached through a view or a plain (unqualified) name instead.
 */
export function quoteQualifiedName(name: string): string {
  const dot = name.indexOf('.');
  return dot < 0
    ? escapeIdentifier(name)
    : escapeIdentifier(name.slice(0, dot)) +
        '.' +
        escapeIdentifier(name.slice(dot + 1));
}

/**
 * The statement whose RowDescription tells us the destination columns'
 * type OIDs. `where false` keeps the server from producing rows for a
 * Describe that is never followed by an Execute, and letting PostgreSQL
 * resolve the name is the point: schemas, quoting, search_path and views
 * all behave exactly as they will for the COPY itself, which parsing the
 * name here could only approximate.
 */
export function buildProbeSql(table: string, columns?: string[]): string {
  const cols = columns?.length ? columns.map(escapeIdentifier).join(', ') : '*';
  return `select ${cols} from ${quoteQualifiedName(table)} where false`;
}

export function buildCopySql(table: string, columns?: string[]): string {
  const cols = columns?.length
    ? ' (' + columns.map(escapeIdentifier).join(', ') + ')'
    : '';
  return (
    `copy ${quoteQualifiedName(table)}${cols} ` +
    `from stdin with (format binary)`
  );
}

/** Positional array, or an object read by column name. */
function toValues(row: CopyRow, columns: string[]): any[] {
  if (Array.isArray(row)) return row;
  const l = columns.length;
  const out = new Array(l);
  let i: number;
  for (i = 0; i < l; i++) out[i] = (row as Record<string, any>)[columns[i]];
  return out;
}

export interface CopyFromRowsContext {
  columns: string[];
  dataTypeIds: OID[];
  options: CopyFromRowsOptions;
  /**
   * Sends one CopyData message, resolving once the socket has taken it -
   * immediately when it had room, and only after it drains when it did
   * not. Awaiting this is what makes backpressure reach the source: the
   * `for await` below cannot ask for another row until it settles.
   */
  write: (chunk: Buffer) => Promise<void>;
}

/**
 * Encodes `source` into binary COPY chunks and hands them to `write`,
 * accumulating rows until a chunk is worth sending.
 *
 * The chunk size is the difference between this being fast and being
 * pointless: one CopyData per row costs a message header and a socket write
 * each time, which measured 1208ms against 129ms at 64KB for the same
 * 200,000 rows. Sizes from 64KB to 256KB all land near the floor, so the
 * default sits inside that range rather than at either edge.
 *
 * Pulls from `source` rather than being pushed into, so an async iterable -
 * which every Readable is - only produces the next row once the previous
 * chunk has been accepted, making backpressure the caller's own loop
 * pausing rather than an unbounded queue here.
 */
export async function writeCopyBinaryRows(
  source: CopyRowSource,
  ctx: CopyFromRowsContext,
): Promise<{ rowCount: number; skippedRows: number; nulledValues: number }> {
  const { columns, dataTypeIds, options } = ctx;
  const typeMap = options.typeMap || GlobalTypeMap;
  assertCopyBinaryEncodable(dataTypeIds, columns, typeMap);

  const chunkSize = options.chunkSize || DEFAULT_COPY_CHUNK_SIZE;
  const io = new SmartBuffer();
  io.start();
  io.writeBytes(COPY_BINARY_HEADER);

  const onInvalidValue = options.onInvalidValue || 'throw';
  let rowCount = 0;
  let skippedRows = 0;
  const stats = { nulled: 0 };
  let index = 0;
  for await (const row of source as AsyncIterable<CopyRow>) {
    const written = encodeCopyBinaryRow(
      io,
      toValues(row, columns),
      dataTypeIds,
      columns,
      typeMap,
      options,
      index,
      onInvalidValue,
      stats,
    );
    index++;
    if (!written) {
      skippedRows++;
      continue;
    }
    rowCount++;
    if (io.size >= chunkSize) {
      await ctx.write(io.flush());
      io.start();
    }
  }

  io.writeBytes(COPY_BINARY_TRAILER);
  await ctx.write(io.flush());
  return { rowCount, skippedRows, nulledValues: stats.nulled };
}
