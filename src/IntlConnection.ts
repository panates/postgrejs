import TaskQueue from 'putil-taskqueue';
import {PgSocket} from './protocol/PgSocket';
import {SafeEventEmitter} from './SafeEventEmitter';
import {
    CommandResult,
    ConnectionConfiguration,
    ConnectionState,
    Maybe,
    ScriptExecuteOptions,
    ScriptResult
} from './definitions';
import {getConnectionConfig} from './util/connection-config';
import {Protocol} from './protocol/protocol';
import {GlobalTypeMap} from './DataTypeMap';
import {convertRowToObject, getParsers, parseRow, wrapRowDescription} from './common';
import {escapeLiteral} from './util/escape-literal';
import DataFormat = Protocol.DataFormat;
import {coerceToBoolean} from 'putil-varhelpers';

export class IntlConnection extends SafeEventEmitter {
    protected _refCount = 0;
    protected _config: ConnectionConfiguration;
    transactionStatus = 'I';
    socket: PgSocket;
    statementQueue = new TaskQueue();

    constructor(config?: ConnectionConfiguration | string) {
        super();
        this._config = Object.freeze(getConnectionConfig(config));
        this.socket = new PgSocket(this._config);
        this.socket.on('error', (err) => this._onError(err));
        this.socket.on('close', () => this.emit('close'));
        this.socket.on('connecting', () => this.emit('connecting'));
    }

    get config(): ConnectionConfiguration {
        return this._config;
    }

    get inTransaction(): boolean {
        return this.transactionStatus === 'T' || this.transactionStatus === 'E';
    }

    get state(): ConnectionState {
        return this.socket.state;
    }

    get refCount(): number {
        return this._refCount;
    }

    get processID(): Maybe<number> {
        return this.socket.processID;
    }

    get secretKey(): Maybe<number> {
        return this.socket.secretKey;
    }

    get sessionParameters(): Record<string, string> {
        return this.socket.sessionParameters;
    }

    async connect(): Promise<void> {
        if (this.socket.state === ConnectionState.READY)
            return;
        await new Promise((resolve, reject) => {
            const handleConnectError = (err) => reject(err);
            this.socket.once('ready', () => {
                this.socket.removeListener('error', handleConnectError);
                resolve();
                this.emit('ready');
            });
            this.socket.once('error', handleConnectError);
            this.socket.connect();
        });
        let startupCommand = '';
        if (this.config.searchPath)
            startupCommand += 'SET search_path = ' + escapeLiteral(this.config.searchPath) + ';';
        if (this.config.timezone)
            startupCommand += 'SET timezone TO ' + escapeLiteral(this.config.timezone) + ';';
        if (startupCommand)
            await this.execute(startupCommand);
    }

    async close(): Promise<void> {
        if (this.state === ConnectionState.CLOSED)
            return;
        this.statementQueue.clear();
        return new Promise(resolve => {
            if (this.socket.state === ConnectionState.CLOSED)
                return;
            this.socket.once('close', resolve);
            this.socket.sendTerminateMessage(
                () => {
                    this.socket.close();
                    this.emit('close');
                });
        });
    }

    async execute(sql: string, options?: ScriptExecuteOptions, cb?: (event: string, ...args: any[]) => void): Promise<ScriptResult> {
        this.assertConnected();
        return this.statementQueue.enqueue<ScriptResult>(async (): Promise<ScriptResult> => {
            return this._execute(sql, options, cb);
        });
    }

    async startTransaction(): Promise<void> {
        if (!this.inTransaction)
            await this.execute('BEGIN');
    }

    async savepoint(name: string): Promise<void> {
        if (!(name && name.match(/^[a-zA-Z]\w+$/)))
            throw new Error(`Invalid savepoint "${name}`);
        await this.execute('BEGIN; SAVEPOINT ' + name);
    }

    async commit(): Promise<void> {
        if (this.inTransaction)
            await this.execute('COMMIT');
    }

    async rollback(): Promise<void> {
        if (this.inTransaction)
            await this.execute('ROLLBACK');
    }

    async rollbackToSavepoint(name: string): Promise<void> {
        if (!(name && name.match(/^[a-zA-Z]\w+$/)))
            throw new Error(`Invalid savepoint "${name}`);
        await this.execute('ROLLBACK TO SAVEPOINT ' + name, {autoCommit: false});
    }

    ref(): void {
        this._refCount++;
    }

    unref(): boolean {
        return !--this._refCount;
    }

    assertConnected(): void {
        if (this.state === ConnectionState.CLOSING)
            throw new Error('Connection is closing');
        if (this.state === ConnectionState.CLOSED)
            throw new Error('Connection closed');
    }

    protected async _execute(sql: string, options?: ScriptExecuteOptions, cb?: (event: string, ...args: any[]) => void): Promise<ScriptResult> {
        this.ref();
        try {
            const startTime = Date.now();
            const result: ScriptResult = {
                totalCommands: 0,
                totalTime: 0,
                results: [],
            };
            const opts = options || {};
            const transactionCommand = sql.match(/^(\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b)/i) &&
                !sql.match(/^\bROLLBACK TO SAVEPOINT\b/i);
            const autoCommit = coerceToBoolean(opts.autoCommit != null ?
                opts.autoCommit : this.config.autoCommit, true);
            const beginAtFirst = !autoCommit && !transactionCommand;
            const commitLast = autoCommit && !transactionCommand;
            if (beginAtFirst)
                sql = 'BEGIN;\n' + sql;
            if (commitLast)
                sql += ';\nCOMMIT;';

            this.socket.sendQueryMessage(sql);
            let currentStart = Date.now();
            let parsers;
            let current: CommandResult = {command: undefined};
            let fields: Protocol.RowDescription[];
            const typeMap = opts.typeMap || GlobalTypeMap;
            let commandIdx = 0;
            return this.socket.capture(async (code: Protocol.BackendMessageCode, msg: any,
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
                        current.fields = wrapRowDescription(typeMap, fields, DataFormat.text);
                        current.rows = [];
                        break;
                    case Protocol.BackendMessageCode.DataRow:
                        let row = msg.columns.map((x: Buffer) => x.toString('utf8'));
                        parseRow(parsers, row, opts);
                        if (opts.objectRows && current.fields)
                            row = convertRowToObject(current.fields, row);
                        if (cb) cb('row', row);
                        current.rows = current.rows || [];
                        current.rows.push(row);
                        break;
                    case Protocol.BackendMessageCode.CommandComplete:
                        // Ignore BEGIN command that we added to sql
                        if (beginAtFirst && commandIdx++ == 0)
                            break;
                        current.command = msg.command;
                        if (current.command === 'DELETE' ||
                            current.command === 'INSERT' ||
                            current.command === 'UPDATE')
                            current.rowsAffected = msg.rowCount;
                        current.executeTime = Date.now() - currentStart;
                        result.results.push(current);
                        if (cb) cb('command-complete', current);
                        current = {command: undefined};
                        currentStart = Date.now();
                        break;
                    case Protocol.BackendMessageCode.ReadyForQuery:
                        this.transactionStatus = msg.status;
                        result.totalTime = Date.now() - startTime;
                        // Ignore COMMIT command that we added to sql
                        if (commitLast)
                            result.results.pop();
                        result.totalCommands = result.results.length;
                        done(undefined, result);
                }
            });
        } finally {
            this.unref();
        }
    }

    protected _onError(err: Error): void {
        if (this.socket.state !== ConnectionState.READY)
            return;
        this.emit('error', err);
    }

}
