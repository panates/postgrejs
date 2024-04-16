import DoublyLinked from 'doublylinked';
import { TaskQueue } from 'power-tasks';
import { FieldInfo } from '../interfaces/field-info.js';
import { QueryOptions } from '../interfaces/query-options.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import { AnyParseFunction, Maybe, Row } from '../types.js';
import { convertRowToObject } from '../util/convert-row-to-object.js';
import { parseRow } from '../util/parse-row.js';
import { Portal } from './portal.js';
import { PreparedStatement } from './prepared-statement.js';

export class Cursor extends SafeEventEmitter {
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
    for (let i = 0; i < nRows; i++) {
      if (!this._rows.length) await this._fetchRows();
      if (this._rows.length) out.push(this._rows.shift());
      else break;
    }
    return out;
  }

  async close(): Promise<void> {
    if (this._closed) return;
    await this._portal.close();
    await this._statement.close();
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
          if (this._parsers) {
            const objectRows = queryOptions.objectRows;
            const fields = this.fields;
            const rows = r.rows;
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              parseRow(this._parsers, row, this._queryOptions);
              if (objectRows) rows[i] = convertRowToObject(fields, row);
            }
          }
          this._rows.push(...r.rows);
          this.emit('fetch', r.rows);
        } else {
          await this.close();
        }
      })
      .toPromise();
  }
}
