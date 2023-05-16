// import _debug from "debug"; // it is vulnerable
import { BindParam } from "./BindParam.js";
import { GlobalTypeMap } from "./DataTypeMap.js";
import {
  ConnectionConfiguration,
  ConnectionState,
  DataTypeOIDs,
  Maybe,
  OID,
  QueryOptions,
  QueryResult,
  ScriptExecuteOptions,
  ScriptResult,
  StatementPrepareOptions,
} from "./definitions.js";
import { IntlConnection } from "./IntlConnection.js";
import type { Pool } from "./Pool.js";
import { PreparedStatement } from "./PreparedStatement.js";
import { DatabaseError } from "./protocol/DatabaseError.js";
import { Protocol } from './protocol/protocol.js';
import { SafeEventEmitter } from "./SafeEventEmitter.js";

const debug = (() => void 0) as any;// _debug("pgc:intlcon");

export type NotificationMessage = Protocol.NotificationResponseMessage;
export type NotificationCallback = (msg: NotificationMessage) => any;

export class Connection extends SafeEventEmitter {
  private readonly _pool?: Pool;
  private readonly _intlCon: IntlConnection;
  private readonly _notificationListeners = new SafeEventEmitter();
  private _closing = false;

  constructor(pool: Pool, intlCon: IntlConnection);
  constructor(config?: ConnectionConfiguration | string | IntlConnection);
  constructor(arg0: any, arg1?: any) {
    super();
    if (arg0 && typeof arg0.acquire === "function") {
      if (!(arg1 instanceof IntlConnection)) throw new TypeError("Invalid argument");
      this._pool = arg0;
      this._intlCon = arg1;
    } else this._intlCon = new IntlConnection(arg0);
    this._intlCon.on("ready", (...args) => this.emit("ready", ...args));
    this._intlCon.on("error", (...args) => this.emit("error", ...args));
    this._intlCon.on("close", (...args) => this.emit("close", ...args));
    this._intlCon.on("connecting", (...args) => this.emit("connecting", ...args));
    this._intlCon.on("ready", (...args) => this.emit("ready", ...args));
    this._intlCon.on("terminate", (...args) => this.emit("terminate", ...args));
    this._intlCon.on("notification", (msg: NotificationMessage) => this._handleNotification(msg));
  }

  /**
   * Returns configuration object
   */
  get config(): ConnectionConfiguration {
    return this._intlCon.config;
  }

  /**
   * Returns true if connection is in a transaction
   */
  get inTransaction(): boolean {
    return this._intlCon.inTransaction;
  }

  /**
   * Returns current state of the connection
   */
  get state(): ConnectionState {
    return this._intlCon.state;
  }

  /**
   * Returns processId of current session
   */
  get processID(): Maybe<number> {
    return this._intlCon.processID;
  }

  /**
   * Returns information parameters for current session
   */
  get sessionParameters(): Record<string, string> {
    return this._intlCon.sessionParameters;
  }

  /**
   * Returns secret key of current session
   */
  get secretKey(): Maybe<number> {
    return this._intlCon.secretKey;
  }

  /**
   * Connects to the server
   */
  async connect(): Promise<void> {
    await this._intlCon.connect();
    if (this.state === ConnectionState.READY) this._closing = false;
  }

  /**
   * Closes connection. You can define how long time the connection will
   * wait for active queries before terminating the connection.
   * On the end of the given time, it forces to close the socket and than emits `terminate` event.
   *
   * @param terminateWait {number} - Determines how long the connection will wait for active queries before terminating.
   */
  async close(terminateWait?: number): Promise<void> {
    this._notificationListeners.removeAllListeners();
    this._intlCon.statementQueue.clearQueue();
    if (this.state === ConnectionState.CLOSED || this._closing) return;
    debug("[%s] closing", this.processID);

    this._closing = true;
    // @ts-ignore
    if (this._intlCon.refCount > 0 && typeof terminateWait === "number" && terminateWait > 0) {
      const startTime = Date.now();
      return new Promise((resolve, reject) => {
        debug("[%s] waiting active queries", this.processID);
        const timer = setInterval(() => {
          if (this._intlCon.refCount <= 0 || Date.now() > startTime + terminateWait) {
            clearInterval(timer);
            if (this._intlCon.refCount > 0) {
              debug("[%s] terminate", this.processID);
              this.emit("terminate");
            }
            this._close().then(resolve).catch(reject);
          }
        }, 50);
      });
    }
    await this._close();
  }

  /**
   * Executes single or multiple SQL scripts using Simple Query protocol.
   *
   * @param sql {string} - SQL script that will be executed
   * @param options {ScriptExecuteOptions} - Execute options
   */
  execute(sql: string, options?: ScriptExecuteOptions): Promise<ScriptResult> {
    return this._intlCon.execute(sql, options).catch((e: DatabaseError) => {
      throw this._handleError(e, sql);
    });
  }

  async query(sql: string, options?: QueryOptions): Promise<QueryResult> {
    this._intlCon.assertConnected();
    debug("[%s] query | %s", this.processID, sql);
    const typeMap = options?.typeMap || GlobalTypeMap;
    const paramTypes: Maybe<OID[]> = options?.params?.map((prm) =>
        prm instanceof BindParam ? prm.oid : typeMap.determine(prm) || DataTypeOIDs.varchar
    );
    const statement = await this.prepare(sql, {paramTypes, typeMap}).catch((e: DatabaseError) => {
      throw this._handleError(e, sql);
    });
    try {
      const params: Maybe<Maybe<OID>[]> = options?.params?.map((prm) => (prm instanceof BindParam ? prm.value : prm));
      return await statement.execute({...options, params});
    } finally {
      await statement.close();
    }
  }

  /**
   * Creates a PreparedStatement instance
   * @param sql {string} - SQL script that will be executed
   * @param options {StatementPrepareOptions} - Options
   */
  async prepare(sql: string, options?: StatementPrepareOptions): Promise<PreparedStatement> {
    debug("[%s] prepare", this.processID);
    return await PreparedStatement.prepare(this, sql, options);
  }

  /**
   * Starts a transaction
   */
  startTransaction(): Promise<void> {
    return this._intlCon.startTransaction();
  }

  /**
   * Commits current transaction
   */
  commit(): Promise<void> {
    return this._intlCon.commit();
  }

  /**
   * Rolls back current transaction
   */
  rollback(): Promise<void> {
    return this._intlCon.rollback();
  }

  /**
   * Starts transaction and creates a savepoint
   * @param name {string} - Name of the savepoint
   */
  async savepoint(name: string): Promise<void> {
    if (!this._intlCon.inTransaction) await this._intlCon.startTransaction();
    return this._intlCon.savepoint(name);
  }

  /**
   * Rolls back current transaction to given savepoint
   * @param name {string} - Name of the savepoint
   */
  rollbackToSavepoint(name: string): Promise<void> {
    return this._intlCon.rollbackToSavepoint(name);
  }

  /**
   * Releases savepoint
   * @param name {string} - Name of the savepoint
   */
  releaseSavepoint(name: string): Promise<void> {
    return this._intlCon.releaseSavepoint(name);
  }

  async listen(channel: string, callback: NotificationCallback) {
    if (!/^[A-Z]\w+$/i.test(channel))
      throw new TypeError(`Invalid channel name`);
    const registered = !!this._notificationListeners.eventNames().length;
    this._notificationListeners.on(channel, callback);
    if (!registered)
      await this.query('LISTEN ' + channel);
  }

  async unListen(channel: string) {
    if (!/^[A-Z]\w+$/i.test(channel))
      throw new TypeError(`Invalid channel name`);
    this._notificationListeners.removeAllListeners(channel);
    await this.query('UNLISTEN ' + channel);
  }

  async unListenAll() {
    this._notificationListeners.removeAllListeners();
    await this.query('UNLISTEN *');
  }

  protected _handleNotification(msg: NotificationMessage) {
    this.emit("notification", msg);
    this._notificationListeners.emit(msg.channel, msg);
  }

  protected async _close(): Promise<void> {
    if (this._pool) {
      await this._pool.release(this);
      this.emit("release");
    } else await this._intlCon.close();
    this._closing = false;
  }

  protected _handleError(err: DatabaseError, script: string): DatabaseError {
    if (err.position) {
      let s = script.substring(0, err.position - 1);
      err.lineNr = s ? (s.match(/\n/g) || []).length : 0;
      const lineStart = s.lastIndexOf("\n") + 1;
      const lineEnd = script.indexOf("\n", lineStart);
      s = script.substring(0, lineStart);
      err.colNr = err.position - s.length;
      err.line = lineEnd > 0 ? script.substring(lineStart, lineEnd) : script.substring(lineStart);
    }
    return err;
  }
}
