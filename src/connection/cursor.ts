import DoublyLinked from 'doublylinked';
import { TaskQueue } from 'power-tasks';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import type { AnyParseFunction, Maybe, Row } from '../types.js';
import type { RowDecoder } from '../util/row-decoder.js';
import { resolveRowDecoder, resolveRowType } from '../util/row-decoder.js';
import type { Portal, PortalExecuteResult } from './portal.js';
import type { PreparedStatement } from './prepared-statement.js';

export class Cursor extends SafeEventEmitter implements AsyncDisposable {
  private readonly _statement: PreparedStatement;
  private readonly _portal: Portal;
  private readonly _parsers: AnyParseFunction[];
  private readonly _queryOptions: QueryOptions;
  private readonly _rowDecoder: RowDecoder;
  private _taskQueue = new TaskQueue({ concurrency: 1 });
  private _rows = new DoublyLinked();
  private _closed = false;
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

  get rowType(): 'array' | 'object' | 'custom' {
    return resolveRowType(this._queryOptions);
  }

  get isClosed(): boolean {
    return this._closed;
  }

  async next(): Promise<Maybe<Row>> {
    if (!this._rows.length) {
      if (this._closed) return;
      await this._fetchRows();
    }
    return this._rows.shift();
  }

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

  async close(): Promise<void> {
    if (this._closed) return;
    const combined = await this._statement._maybeCloseWithPortal(
      this._portal.name!,
    );
    if (!combined) await this._portal.close();
    this.emit('close');
    this._closed = true;
  }

  private async _fetchRows(): Promise<void> {
    // Both callers (next()/fetch()) already gate on _closed with no await
    // in between, so this can't currently observe a change - kept as a
    // defensive backstop for this private method's own contract.
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
            e.message +=
              ' - the portal was destroyed by another statement running on' +
              ' the same connection, which ends the implicit transaction it' +
              ' lives in. Open the cursor inside an explicit transaction, or' +
              ' give it a connection of its own.';
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
              const { data, columnCount } = rows[i];
              rows[i] = rowDecoder.decode(
                parsers,
                data,
                columnCount,
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
   * Iterates the remaining rows, fetching a batch at a time, and closes
   * the cursor when the loop ends - whether it ran out of rows, broke
   * early, or the body threw. Nothing is decoded ahead of what is asked
   * for, so this streams a result larger than memory the same way next()
   * does one row at a time.
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<Row> {
    try {
      let row: Maybe<Row>;
      while ((row = await this.next()) !== undefined) yield row;
    } finally {
      await this.close();
    }
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
