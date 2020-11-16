import TaskQueue from 'putil-taskqueue';
import DoublyLinked from 'doublylinked';
import {SafeEventEmitter} from './SafeEventEmitter';
import {Portal} from './Portal';
import {AnyParseFunction, FieldInfo, Maybe, QueryOptions, Row} from './definitions';

import {PreparedStatement} from './PreparedStatement';
import {convertRowToObject, parseRow} from './common';

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
        await this._portal.close();
        await this._statement.close();
        this.emit('close');
        this._closed = true;
    }

    private async _fetchRows(): Promise<void> {
        const portal = this._portal;
        await this._taskQueue.enqueue(async () => {
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
                this.emit('fetch', r.rows);
            } else {
                await this.close();
            }
        });
    }

}
