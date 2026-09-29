import { updateErrorMessage } from '@jsopen/objects';
import DoublyLinked from 'doublylinked';
import { TaskQueue } from 'power-tasks';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import type { AnyParseFunction, Maybe, Row } from '../types.js';
import type { RowDecoder } from '../util/row-decoder.js';
import {
  dataRowBytes,
  resolveRowDecoder,
  resolveRowType,
} from '../util/row-decoder.js';
import type { Portal, PortalExecuteResult } from './portal.js';
import type { PreparedStatement } from './prepared-statement.js';

/**
 * A result read a batch at a time instead of all at once.
 *
 * Returned by `Connection.query()`/`PreparedStatement.execute()` when
 * `cursor: true` is passed, and backed by a server-side portal: rows are
 * fetched `fetchCount` at a time (100 by default) as they are asked for,
 * so a result larger than memory can be read through without ever
 * holding it.
 *
 * The cursor closes itself when the rows run out, and `for await`
 * closes it however the loop ends. Anything else - breaking out of a
 * manual `next()` loop, an error in the middle - wants `close()`, or
 * `await using`, which calls it.
 *
 * ```ts
 * const result = await connection.query('select * from big_table', {
 *   cursor: true,
 *   fetchCount: 500,
 * });
 * for await (const row of result.cursor!) {
 *   // one row at a time; 500 arrive per round trip
 * }
 * ```
 *
 * Emits `fetch` with each batch as it arrives, and `close` once.
 */
/* The portal lives inside the implicit transaction the statement opened,
   so any other statement on the same connection ends it - see
   _fetchRows() for what that looks like when it happens, and why the
   error says more than the server's own does. */
export class Cursor extends SafeEventEmitter implements AsyncDisposable {
  private readonly _statement: PreparedStatement;
  private readonly _portal: Portal;
  private readonly _parsers: AnyParseFunction[];
  private readonly _queryOptions: QueryOptions;
  private readonly _rowDecoder: RowDecoder;
  private _taskQueue = new TaskQueue({ concurrency: 1 });
  private _rows = new DoublyLinked();
  private _closed = false;
  /** What the columns of every row this cursor returns are. */
  readonly fields: FieldInfo[];

  constructor(
    statement: PreparedStatement,
    portal: Portal,
    fields: FieldInfo[],
    parsers: AnyParseFunction[],
    queryOptions: QueryOptions,
  ) {
    super();
    this._statement = statement;
    this._portal = portal;
    this._parsers = parsers;
    this._queryOptions = queryOptions;
    this.fields = fields;
    this._rowDecoder = resolveRowDecoder(queryOptions);
  }

  /**
   * The shape of the rows this cursor hands back - `'array'`,
   * `'object'`, or `'custom'` when a `RowDecoder` of the caller's own is
   * producing them.
   */
  get rowType(): 'array' | 'object' | 'custom' {
    return resolveRowType(this._queryOptions);
  }

  /**
   * Whether the cursor is finished: the rows ran out, `close()` was
   * called, or the portal was lost.
   */
  get isClosed(): boolean {
    return this._closed;
  }

  /**
   * The next row, or `undefined` once there are none left.
   *
   * Fetches a batch from the server when the current one is used up, and
   * closes the cursor when the server answers with nothing.
   *
   * @returns The next row, or `undefined` at the end.
   */
  async next(): Promise<Maybe<Row>> {
    if (!this._rows.length) {
      if (this._closed) return;
      await this._fetchRows();
    }
    return this._rows.shift();
  }

  /**
   * Up to `nRows` rows, fetching as many batches as it takes.
   *
   * Shorter than asked for only at the end of the result, and empty once
   * the cursor is closed - which is how the end is told apart from a
   * batch boundary.
   *
   * @param nRows How many rows to read at most.
   * @returns The rows read, in order.
   */
  async fetch(nRows: number): Promise<Row[]> {
    const out: Row[] = [];
    if (this._closed) return out;
    let i: number;
    for (i = 0; i < nRows; i++) {
      if (!this._rows.length) await this._fetchRows();
      if (this._rows.length) out.push(this._rows.shift());
      else break;
    }
    return out;
  }

  /**
   * Closes the cursor and releases the portal behind it.
   *
   * Idempotent, and called automatically when the rows run out or a
   * `for await` loop ends. Emits `close`.
   */
  async close(): Promise<void> {
    if (this._closed) return;
    const combined = await this._statement._maybeCloseWithPortal(
      this._portal.name!,
    );
    if (!combined) await this._portal.close();
    this.emit('close');
    this._closed = true;
  }

  /** Reads one batch from the portal and queues it up for the callers. */
  /* Both callers (next()/fetch()) already gate on _closed with no await
     in between, so the test below cannot currently observe a change -
     kept as a backstop for this method's own contract rather than for
     anything that reaches it today. */
  private async _fetchRows(): Promise<void> {
    if (this._closed) return;
    const portal = this._portal;
    await this._taskQueue
      .enqueue(async () => {
        const queryOptions = this._queryOptions;
        let r: Maybe<PortalExecuteResult>;
        try {
          r = await portal.execute(queryOptions.fetchCount ?? 100);
        } catch (e: any) {
          // 34000 here means the portal is gone, and the only thing that
          // takes a portal away mid-cursor is another statement on this
          // connection: its Sync ends the implicit transaction the portal
          // lives in. The server's own message says nothing about why, and
          // a caller cannot act on it without knowing. Closing first keeps
          // the statement from leaking and lets whoever is holding the
          // connection for this cursor (Pool.query()) have it back.
          if (e?.code === '34000') {
            await this.close().catch(() => undefined);
            updateErrorMessage(
              e,
              e.message +
                ' - the portal was destroyed by another statement running on' +
                ' the same connection, which ends the implicit transaction it' +
                ' lives in. Open the cursor inside an explicit transaction, or' +
                ' give it a connection of its own.',
            );
          }
          throw e;
        }
        if (r && r.rows && r.rows.length) {
          const rows: any[] = r.rows;
          if (this._parsers) {
            const fields = this.fields;
            const parsers = this._parsers;
            const rowDecoder = this._rowDecoder;
            const rowLen = rows.length;
            let i: number;
            for (i = 0; i < rowLen; i++) {
              const raw = rows[i];
              rows[i] = rowDecoder.decodeAt
                ? rowDecoder.decodeAt(
                    parsers,
                    raw.buffer,
                    raw.offset,
                    raw.len,
                    raw.columnCount,
                    this._queryOptions,
                    fields,
                  )
                : rowDecoder.decode(
                    parsers,
                    dataRowBytes(raw),
                    raw.columnCount,
                    this._queryOptions,
                    fields,
                  );
            }
          }
          this._rows.push(...rows);
          this.emit('fetch', rows);
        } else {
          await this.close();
        }
      })
      .toPromise();
  }

  /**
   * Iterates the remaining rows, a batch at a time, and closes the cursor
   * when the loop ends - whether it ran out of rows, broke early, or the
   * body threw.
   *
   * @returns An iterator over the rows left to read.
   */
  /* Nothing is decoded ahead of what is asked for, so this streams a
     result larger than memory the same way next() does one row at a
     time. */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<Row> {
    try {
      let row: Maybe<Row>;
      while ((row = await this.next()) !== undefined) yield row;
    } finally {
      await this.close();
    }
  }

  /** Closes the cursor, so `await using` can own one. */
  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
