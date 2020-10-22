import {PgSocket} from './PgSocket';
import {Protocol} from './protocol/protocol';
import {wrapRowDescription} from './Statement';
import {ScriptExecuteOptions} from './definitions';
import {convertRowToObject, getParsers, parseRow} from './helpers';
import RowDescription = Protocol.RowDescription;

export function executeScript(socket: PgSocket, sql, options: ScriptExecuteOptions = {}): ScriptPromise {
    let cancelled = false;
    let resolveFn;
    const promise = new ScriptPromise((resolve, reject) => {
        resolveFn = resolve;
        const startTime = Date.now();
        const result: any = {
            results: []
        };
        socket.sendQueryMessage(sql);
        let currentStart = Date.now();
        let parsers;
        let current: any = {command: undefined};
        let fields: RowDescription[];

        socket.capture(async (code: Protocol.BackendMessageCode, msg: any, done: (err?: Error, result?: any) => void) => {
            switch (code) {
                case Protocol.BackendMessageCode.NoticeResponse:
                case Protocol.BackendMessageCode.CopyInResponse:
                case Protocol.BackendMessageCode.CopyOutResponse:
                case Protocol.BackendMessageCode.EmptyQueryResponse:
                    break;
                case Protocol.BackendMessageCode.RowDescription:
                    fields = msg.fields;
                    parsers = getParsers(fields);
                    current.fields = wrapRowDescription(fields);
                    current.rows = [];
                    break;
                case Protocol.BackendMessageCode.DataRow:
                    parseRow(parsers, msg.columns);
                    const row = options.objectRows ?
                        convertRowToObject(fields, msg.columns) : msg.columns;
                    current.rows = current.rows || [];
                    current.rows.push(row);
                    break;
                case Protocol.BackendMessageCode.CommandComplete:
                    current.command = msg.command;
                    if (current.command === 'DELETE' || current.command === 'UPDATE')
                        current.rowsAffected = msg.rowCount;
                    current.executeTime = Date.now() - currentStart;
                    result.results.push(current);
                    current = {command: undefined};
                    currentStart = Date.now();
                    break;
                case Protocol.BackendMessageCode.ReadyForQuery:
                    result.totalTime = Date.now() - startTime;
                    done(undefined, result);
            }
        }).then(resolve).catch(reject);
    });
    promise.cancel = () => {
        if (!resolveFn)
            return;
        cancelled = true;
        resolveFn();
    }
    return promise;
}

export class ScriptPromise extends Promise<any> {

    public cancel?: () => void;

}
