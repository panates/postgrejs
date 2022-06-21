import _debug from 'debug';
import {TaskQueue} from 'power-tasks';
import {coerceToBoolean} from 'putil-varhelpers';
import {convertRowToObject, getParsers, parseRow, wrapRowDescription} from './common.js';
import {GlobalTypeMap} from './DataTypeMap.js';
import {
  CommandResult,
  ConnectionConfiguration,
  ConnectionState,
  Maybe,
  ScriptExecuteOptions,
  ScriptResult
} from './definitions.js';
import {PgSocket} from './protocol/PgSocket.js';
import {Protocol} from './protocol/protocol.js';
import {SafeEventEmitter} from './SafeEventEmitter.js';
import {getConnectionConfig} from './util/connection-config.js';
import {escapeLiteral} from './util/escape-literal.js';
import DataFormat = Protocol.DataFormat;

const debug = _debug('pgc:intlcon');

export class IntlConnection extends SafeEventEmitter {
  protected _refCount = 0;
  protected _config: ConnectionConfiguration;
  protected _onErrorSavePoint: string;
  transactionStatus = 'I';
  socket: PgSocket;
  statementQueue = new TaskQueue({concurrency: 1});

  constructor(config?: ConnectionConfiguration | string) {
    super();
    this._config = Object.freeze(getConnectionConfig(config));
    this.socket = new PgSocket(this._config);
    this.socket.on('error', (err) => this._onError(err));
    this.socket.on('close', () => this.emit('close'));
    this.socket.on('connecting', () => this.emit('connecting'));
    this._onErrorSavePoint = 'SP_' + (Math.round(Math.random() * 100000000));
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
    debug('connecting');
    await new Promise<void>((resolve, reject) => {
      const handleConnectError = (err) => reject(err);
      this.socket.once('ready', () => {
        this.socket.removeListener('error', handleConnectError);
        resolve();
      });
      this.socket.once('error', handleConnectError);
      this.socket.connect();
    });
    let startupCommand = '';
    if (this.config.schema)
      startupCommand += 'SET search_path = ' + escapeLiteral(this.config.schema) + ';';
    if (this.config.timezone)
      startupCommand += 'SET timezone TO ' + escapeLiteral(this.config.timezone) + ';';
    if (startupCommand)
      await this.execute(startupCommand, {autoCommit: true});
    debug('[%s] ready', this.processID);
    this.emit('ready');
  }

  async close(): Promise<void> {
    if (this.state === ConnectionState.CLOSED)
      return;
    debug('[%s] closing', this.processID);
    this.statementQueue.clearQueue();
    return new Promise(resolve => {
      if (this.socket.state === ConnectionState.CLOSED)
        return;
      this.socket.once('close', resolve);
      this.socket.sendTerminateMessage(
        () => {
          this.socket.close();
          debug('[%s] closed', this.processID);
          this.emit('close');
        });
    });
  }

  async execute(sql: string, options?: ScriptExecuteOptions, cb?: (event: string, ...args: any[]) => void): Promise<ScriptResult> {
    this.assertConnected();
    return this.statementQueue.enqueue(async (): Promise<ScriptResult> => {
      const transactionCommand = sql.match(/^(\bBEGIN\b|\bCOMMIT\b|\bROLLBACK|SAVEPOINT|RELEASE\b)/i);
      let beginFirst = false;
      let commitLast = false;
      if (!transactionCommand) {
        if (!this.inTransaction &&
          (options?.autoCommit != null ? options?.autoCommit : this.config.autoCommit) === false) {
          beginFirst = true;
        }
        if (this.inTransaction && options?.autoCommit)
          commitLast = true;
      }
      if (beginFirst)
        await this._execute('BEGIN');

      const onErrorRollback = !transactionCommand &&
        (options?.onErrorRollback != null ? options.onErrorRollback :
          coerceToBoolean(this.config.onErrorRollback, true));

      if (this.inTransaction && onErrorRollback)
        await this._execute('SAVEPOINT ' + this._onErrorSavePoint);
      try {
        const result = await this._execute(sql, options, cb);
        if (commitLast)
          await this._execute('COMMIT');
        else if (this.inTransaction && onErrorRollback)
          await this._execute('RELEASE ' + this._onErrorSavePoint + ';');
        return result;
      } catch (e: any) {
        if (this.inTransaction && onErrorRollback)
          await this._execute('ROLLBACK TO ' + this._onErrorSavePoint + ';');
        throw e;
      }
    }).toPromise();
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

  async releaseSavepoint(name: string): Promise<void> {
    if (!(name && name.match(/^[a-zA-Z]\w+$/)))
      throw new Error(`Invalid savepoint "${name}`);
    await this.execute('RELEASE SAVEPOINT ' + name, {autoCommit: false});
  }

  ref(): void {
    this._refCount++;
    debug('[%s] ref %d', this.processID, this._refCount);
  }

  unref(): boolean {
    this._refCount--;
    debug('[%s] unref %d', this.processID, this._refCount);
    return !this._refCount;
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
      debug('[%s] execute | %s', this.processID, sql);
      const startTime = Date.now();
      const result: ScriptResult = {
        totalCommands: 0,
        totalTime: 0,
        results: [],
      };
      const opts = options || {};
      this.socket.sendQueryMessage(sql);
      let currentStart = Date.now();
      let parsers;
      let current: CommandResult = {command: undefined};
      let fields: Protocol.RowDescription[];
      const typeMap = opts.typeMap || GlobalTypeMap;
      return await this.socket.capture(async (code: Protocol.BackendMessageCode, msg: any,
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
            current.command = msg.command;
            if (current.command === 'DELETE' ||
              current.command === 'INSERT' ||
              current.command === 'UPDATE')
              current.rowsAffected = msg.rowCount;
            current.executeTime = Date.now() - currentStart;
            if (current.rows)
              current.rowType = opts.objectRows && current.fields ? 'object' : 'array';
            result.results.push(current);
            if (cb) cb('command-complete', current);
            current = {command: undefined};
            currentStart = Date.now();
            break;
          case Protocol.BackendMessageCode.ReadyForQuery:
            this.transactionStatus = msg.status;
            result.totalTime = Date.now() - startTime;
            // Ignore COMMIT command that we added to sql
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
    debug('[%s] error | %s', this.processID, err.message);
    this.emit('error', err);
  }

}
