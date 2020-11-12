import {SafeEventEmitter} from './SafeEventEmitter';
import {CommandResult, ScriptExecuteOptions, ScriptResult} from './definitions';
import {Protocol} from './protocol/protocol';
import {
    convertRowToObject,
    getParsers,
    getSocket,
    getStatementQueue,
    parseRow,
    wrapRowDescription
} from './common';
import {Connection} from './Connection';
import {GlobalTypeMap} from './DataTypeMap';

export class ScriptExecutor extends SafeEventEmitter {

    private readonly _connection: Connection;
    private _running = false;

    constructor(connection: Connection) {
        super();
        this._connection = connection;
    }

    get connection(): Connection {
        return this._connection;
    }

    async execute(sql: string, options: ScriptExecuteOptions = {}): Promise<ScriptResult> {
        if (this._running)
            throw new Error('Script executor already running');

        const queue = getStatementQueue(this.connection);
        const socket = getSocket(this.connection);
        return queue.enqueue<ScriptResult>(async (): Promise<ScriptResult> => {
            this._running = true;
            this.connection['_activeQuery'] = this;
            try {
                this.emit('start');
                const startTime = Date.now();
                const result: ScriptResult = {
                    totalCommands: 0,
                    totalTime: 0,
                    results: [],
                };

                socket.sendQueryMessage(sql);
                let currentStart = Date.now();
                let parsers;
                let current: CommandResult = {command: undefined};
                let fields: Protocol.RowDescription[];
                const typeMap = options.typeMap || GlobalTypeMap;
                return socket.capture(async (code: Protocol.BackendMessageCode, msg: any,
                                             done: (err?: Error, result?: any) => void) => {
                    switch (code) {
                        case Protocol.BackendMessageCode.NoticeResponse:
                        case Protocol.BackendMessageCode.CopyInResponse:
                        case Protocol.BackendMessageCode.CopyOutResponse:
                        case Protocol.BackendMessageCode.EmptyQueryResponse:
                            break;
                        case Protocol.BackendMessageCode.RowDescription:
                            fields = msg.fields;
                            parsers = getParsers(typeMap, fields);
                            current.fields = wrapRowDescription(typeMap, fields);
                            current.rows = [];
                            break;
                        case Protocol.BackendMessageCode.DataRow:
                            let row = msg.columns.map((x: Buffer) => x.toString('utf8'));
                            parseRow(parsers, row, options);
                            if (options.objectRows && current.fields)
                                row = convertRowToObject(current.fields, row);
                            this.emit('row', row);
                            current.rows = current.rows || [];
                            current.rows.push(row);
                            break;
                        case Protocol.BackendMessageCode.CommandComplete:
                            current.command = msg.command;
                            if (current.command === 'DELETE' ||
                                current.command === 'INSERT' ||
                                current.command === 'UPDATE')
                                current.rowsAffected = msg.rowCount;
                            current.executeTime = Date.now() - currentStart;
                            result.results.push(current);
                            result.totalCommands++;
                            this.emit('command-complete', current);
                            current = {command: undefined};
                            currentStart = Date.now();
                            break;
                        case Protocol.BackendMessageCode.ReadyForQuery:
                            result.totalTime = Date.now() - startTime;
                            this.emit('finish', result);
                            done(undefined, result);
                    }
                });
            } finally {
                this._connection['_activeQuery'] = undefined;
                this._running = false;
            }
        });
    }

    async cancel(): Promise<void> {
        throw new Error('Not implemented yet');
    }

}

