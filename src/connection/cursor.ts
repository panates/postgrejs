import DoublyLinked from 'doublylinked';
import { TaskQueue } from 'power-tasks';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { QueryOptions } from '../interfaces/query-options.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import type { AnyParseFunction, Maybe, Row } from '../types.js';
import { parseObjectRow, parseRow } from '../util/parse-row.js';
import type { Portal } from './portal.js';
import type { PreparedStatement } from './prepared-statement.js';

export class Cursor extends SafeEventEmitter implements AsyncDisposable {
  private readonly _statement: PreparedStatement;
  private readonly _portal: Portal;
  private readonly _parsers: AnyParseFunction[];
  private readonly _queryOptions: QueryOptions;
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
  }

  get rowType(): 'array' | 'object' {
    return this._queryOptions.objectRows ? 'object' : 'array';
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
    if (this._closed) return;
    const portal = this._portal;
    await this._taskQueue
      .enqueue(async () => {
        const queryOptions = this._queryOptions;
        const r = await portal.execute(queryOptions.fetchCount || 100);
        if (r && r.rows && r.rows.length) {
          const rows: any[] = r.rows;
          if (this._parsers) {
            const objectRows = queryOptions.objectRows;
            const fields = this.fields;
            const parsers = this._parsers;
            const rowLen = rows.length;
            let i: number;
            for (i = 0; i < rowLen; i++) {
              const { data, columnCount } = rows[i];
              rows[i] = objectRows
                ? parseObjectRow(
                    parsers,
                    data,
                    columnCount,
                    this._queryOptions,
                    fields,
                  )
                : parseRow(parsers, data, columnCount, this._queryOptions);
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

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
