import _debug from 'debug';
import DoublyLinked from 'doublylinked';
import TaskQueue from 'putil-taskqueue';
import {convertRowToObject, parseRow} from './common.js';
import {AnyParseFunction, FieldInfo, Maybe, QueryOptions, Row} from './definitions.js';
import {Portal} from './Portal.js';
import {PreparedStatement} from './PreparedStatement.js';
import {SafeEventEmitter} from './SafeEventEmitter.js';

const debug = _debug('pgc:cursor');

export class Cursor extends SafeEventEmitter {

  private readonly _statement: PreparedStatement;
  private readonly _portal: Portal;
  private readonly _parsers: AnyParseFunction[];
  private readonly _queryOptions: QueryOptions;
  private _taskQueue = new TaskQueue();
  private _rows = new DoublyLinked();
  private _closed = false;
  readonly fields: FieldInfo[];

  constructor(statement: PreparedStatement,
              portal: Portal,
              fields: FieldInfo[],
              parsers: AnyParseFunction[],
              queryOptions: QueryOptions) {
    super();
    this._statement = statement;
    this._portal = portal;
    this._parsers = parsers;
    this._queryOptions = queryOptions;
    this.fields = fields;
    debug('[%s] constructor', this._portal.name);
  }

  get rowType(): 'array' | 'object' {
    return this._queryOptions.objectRows ? 'object' : 'array';
  }

  get isClosed(): boolean {
    return this._closed;
  }

  async next(): Promise<Maybe<Row>> {
    if (!this._rows.length) {
      if (this._closed)
        return;
      await this._fetchRows();
    }
    return this._rows.shift();
  }

  async fetch(nRows: number): Promise<Row[]> {
    const out: Row[] = [];
    if (this._closed)
      return out;
    for (let i = 0; i < nRows; i++) {
      if (!this._rows.length)
        await this._fetchRows();
      if (this._rows.length)
        out.push(this._rows.shift());
      else break;
    }
    return out;
  }

  async close(): Promise<void> {
    if (this._closed)
      return;
    debug('[%s] close', this._portal.name);
    await this._portal.close();
    await this._statement.close();
    this.emit('close');
    this._closed = true;
  }

  private async _fetchRows(): Promise<void> {
    if (this._closed)
      return;
    const portal = this._portal;
    await this._taskQueue.enqueue(async () => {
      debug('[%s] fetching rows', this._portal.name);
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
            if (objectRows)
              rows[i] = convertRowToObject(fields, row);
          }
        }
        this._rows.push(...r.rows);
        debug('[%s] %d rows fetched', this._portal.name, r.rows.length);
        this.emit('fetch', r.rows);
      } else {
        await this.close();
      }
    });
  }

}
