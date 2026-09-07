import { ConnectionState } from '../constants.js';
import type { ConnectionConfiguration } from '../interfaces/database-connection-params.js';
import type { CaptureCallback } from '../protocol/pg-socket.js';
import {
  formatLsn,
  PgOutputDecoder,
  type PgOutputMessage,
  type PgOutputRelation,
  type TupleValues,
} from '../protocol/pgoutput.js';
import { Protocol } from '../protocol/protocol.js';
import { SafeEventEmitter } from '../safe-event-emitter.js';
import { escapeLiteral } from '../util/escape-literal.js';
import { IntlConnection } from './intl-connection.js';

const PG_EPOCH_MS = Date.UTC(2000, 0, 1);
const DEFAULT_KEEPALIVE_MS = 10000;

export type ChangeCommand = 'insert' | 'update' | 'delete' | 'truncate';

export interface Change {
  command: ChangeCommand;
  /** Schema-qualified, e.g. `public.users`. */
  table: string;
  schema: string;
  relation: PgOutputRelation;
  /** The row after the change; absent for delete and truncate. */
  row?: TupleValues;
  /**
   * The row before the change, for update and delete. How much of it is
   * present depends on the table's REPLICA IDENTITY - by default only the
   * primary key.
   */
  oldRow?: TupleValues;
  /** Where this change sits in the write-ahead log. */
  lsn: bigint;
  /** Commit time of the transaction it belongs to. */
  timestamp?: Date;
}

export interface LogicalReplicationOptions extends ConnectionConfiguration {
  /** Publication(s) to subscribe to; they must already exist on the server. */
  publication: string | string[];
  /**
   * Replication slot name. A slot is what makes the server keep WAL until it
   * is confirmed, so the default is a temporary one, dropped when the
   * connection ends. A permanent slot outlives the process and keeps WAL
   * piling up until it is either read or dropped - which is how a disk fills.
   */
  slot?: string;
  /** Keep the slot after disconnecting. Off by default, deliberately. */
  permanent?: boolean;
  /** Only these commands are yielded. */
  commands?: ChangeCommand[];
  /** Only these tables, as `users` or `public.users`. */
  tables?: string[];
  /** Anything the two above cannot express. */
  filter?: (change: Change) => boolean;
  /** How often to tell the server where we are, in ms (default 10000). */
  keepAliveIntervalMs?: number;
}

/**
 * Streams row-level changes out of PostgreSQL as they are committed.
 *
 * It owns its own connection rather than borrowing one: a connection that
 * has run START_REPLICATION is in a streaming mode it never leaves, so none
 * of Connection's own API would work on it afterwards.
 *
 * ```ts
 * const sub = new LogicalReplication({ ...config, publication: 'my_pub' });
 * for await (const change of sub) {
 *   if (change.command === 'insert') await index.add(change.row);
 * }
 * ```
 *
 * The loop is the backpressure: nothing is read from the socket while the
 * body is running, so a slow consumer slows the stream instead of filling
 * memory. Leaving the loop - by `break`, by throwing, or by closing the
 * subscription - ends it cleanly.
 *
 * Each change is confirmed to the server when the *next* one is pulled, not
 * when it is handed over. A consumer that crashes half way through therefore
 * sees that change again on the next run rather than losing it, and no
 * caller has to remember to acknowledge anything.
 */
export class LogicalReplication extends SafeEventEmitter {
  readonly options: LogicalReplicationOptions;
  protected _intlCon?: IntlConnection;
  protected readonly _decoder = new PgOutputDecoder();
  protected readonly _queue: Change[] = [];
  protected _waiting?: (value: void) => void;
  protected _finished = false;
  protected _error?: Error;
  protected _slotName: string;
  protected _slotCreated = false;
  protected _keepAliveTimer?: NodeJS.Timeout;
  protected _receivedLsn = 0n;
  protected _confirmedLsn = 0n;
  protected _pendingLsn = 0n;
  protected _commitTime?: Date;
  protected _streamDone?: Promise<any>;

  constructor(options: LogicalReplicationOptions) {
    super();
    if (!options.publication)
      throw new TypeError('LogicalReplication requires a publication');
    this.options = options;
    this._slotName =
      options.slot ||
      'postgrejs_' + Math.random().toString(36).substring(2, 10);
  }

  /** The slot this subscription is reading from. */
  get slot(): string {
    return this._slotName;
  }

  /** The last position confirmed to the server. */
  get confirmedLsn(): string {
    return formatLsn(this._confirmedLsn);
  }

  /**
   * Opens the connection, creates the slot if needed and starts streaming.
   * Iterating calls this on its own, so it is only needed to start early.
   */
  async start(): Promise<void> {
    if (this._intlCon) return;
    const intlCon = (this._intlCon = new IntlConnection({
      ...this.options,
      replication: 'database',
    }));
    await intlCon.connect();

    if (!this.options.slot || this.options.permanent === false) {
      await intlCon.execute(
        `CREATE_REPLICATION_SLOT ${this._slotName}` +
          (this.options.permanent ? '' : ' TEMPORARY') +
          ' LOGICAL pgoutput',
      );
      this._slotCreated = true;
    }

    const publications = (
      Array.isArray(this.options.publication)
        ? this.options.publication
        : [this.options.publication]
    ).join(',');
    const sql =
      `START_REPLICATION SLOT ${this._slotName} LOGICAL 0/0 ` +
      `(proto_version '1', publication_names ${escapeLiteral(publications)})`;

    // Deliberately not awaited here: this resolves only when streaming
    // ends. Stored so close() can wait for it after asking the server to
    // stop, rather than sending a new query while COPY BOTH is still active.
    this._streamDone = intlCon.socket
      .sendQueryMessage(sql, this._capture)
      .catch(err => this._fail(err));

    this._keepAliveTimer = setInterval(
      () => this._sendStatus(false),
      this.options.keepAliveIntervalMs || DEFAULT_KEEPALIVE_MS,
    );
    this._keepAliveTimer.unref();
  }

  /** Ends the subscription and closes its connection. */
  async close(): Promise<void> {
    const wasStreaming = !this._finished;
    this._finished = true;
    this._wake();
    if (this._keepAliveTimer) clearInterval(this._keepAliveTimer);
    this._keepAliveTimer = undefined;
    const intlCon = this._intlCon;
    this._intlCon = undefined;
    if (!intlCon) return;
    if (wasStreaming && intlCon.state === ConnectionState.READY) {
      // Still mid-COPY-BOTH: a new Query message (like the DROP below) is
      // invalid until the server has acknowledged the end of streaming and
      // returned to normal command processing. A paused socket (from
      // backpressure) would never see that acknowledgment at all.
      intlCon.socket.resume();
      intlCon.socket.sendCopyDone();
      await this._streamDone?.catch(() => undefined);
    }
    if (
      this._slotCreated &&
      this.options.permanent &&
      intlCon.state === ConnectionState.READY
    ) {
      await intlCon
        .execute(`DROP_REPLICATION_SLOT ${this._slotName}`)
        .catch(() => undefined);
    }
    await intlCon.close().catch(() => undefined);
  }

  /**
   * Confirms everything up to the last change handed out. Called for you
   * when the next change is pulled; use it directly only to confirm sooner.
   */
  async ack(): Promise<void> {
    this._confirmedLsn = this._pendingLsn;
    this._sendStatus(false);
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Change> {
    await this.start();
    try {
      while (true) {
        if (this._error) throw this._error;
        const change = this._queue.shift();
        if (change) {
          this._confirmedLsn = this._pendingLsn;
          this._pendingLsn = change.lsn;
          yield change;
          continue;
        }
        if (this._finished) return;
        this._resume();
        await new Promise<void>(resolve => (this._waiting = resolve));
      }
    } finally {
      await this.close();
    }
  }

  protected readonly _capture: CaptureCallback = (code, msg, done) => {
    switch (code) {
      case Protocol.BackendMessageCode.CopyBothResponse:
        break;
      case Protocol.BackendMessageCode.CopyData:
        this._handleCopyData(msg.data);
        break;
      case Protocol.BackendMessageCode.ErrorResponse:
        this._error = msg;
        break;
      case Protocol.BackendMessageCode.ReadyForQuery:
        this._finished = true;
        done(undefined);
        this._wake();
        break;
      default:
        break;
    }
  };

  protected _handleCopyData(data: Buffer): void {
    const kind = String.fromCharCode(data[0]);
    if (kind === 'k') {
      this._receivedLsn = data.readBigUInt64BE(1);
      if (data[17] === 1) this._sendStatus(false);
      return;
    }
    if (kind !== 'w') return; // XLogData is the only other thing sent here
    const walStart = data.readBigUInt64BE(1);
    this._receivedLsn = data.readBigUInt64BE(9);
    const message = this._decoder.decode(data.subarray(25));
    const changes = this._toChanges(message, walStart);
    if (!changes.length) return;
    this._queue.push(...changes);
    if (this._queue.length > 1) this._intlCon?.socket.pause();
    this._wake();
  }

  /**
   * Turns one decoded message into the changes it represents - none for
   * bookkeeping messages, one for a row change, and one per table for a
   * truncate, so that a `tables` filter behaves the same way there.
   */
  protected _toChanges(message: PgOutputMessage, lsn: bigint): Change[] {
    let change: Change | undefined;
    switch (message.kind) {
      case 'commit':
        this._commitTime = message.commitTime;
        return [];
      case 'insert':
        change = this._build('insert', message.relation, lsn, message.row);
        break;
      case 'update':
        change = this._build(
          'update',
          message.relation,
          lsn,
          message.row,
          message.oldRow,
        );
        break;
      case 'delete':
        change = this._build(
          'delete',
          message.relation,
          lsn,
          undefined,
          message.oldRow,
        );
        break;
      case 'truncate':
        return message.relations
          .map(relation => this._build('truncate', relation, lsn))
          .filter(c => this._accepts(c));
      default:
        return [];
    }
    return this._accepts(change) ? [change] : [];
  }

  protected _build(
    command: ChangeCommand,
    relation: PgOutputRelation,
    lsn: bigint,
    row?: TupleValues,
    oldRow?: TupleValues,
  ): Change {
    return {
      command,
      relation,
      schema: relation.schema,
      table: `${relation.schema}.${relation.name}`,
      row,
      oldRow,
      lsn,
      timestamp: this._commitTime,
    };
  }

  /** Client-side filtering, on top of whatever the publication already limits. */
  protected _accepts(change: Change): boolean {
    const { commands, tables, filter } = this.options;
    if (commands && !commands.includes(change.command)) return false;
    if (
      tables &&
      !tables.some(t => t === change.table || t === change.relation.name)
    )
      return false;
    if (filter && !filter(change)) return false;
    return true;
  }

  /** Standby status update: where we have written, flushed and applied. */
  protected _sendStatus(replyRequested: boolean): void {
    const socket = this._intlCon?.socket;
    if (!socket) return;
    const buf = Buffer.allocUnsafe(34);
    buf[0] = 0x72; // 'r'
    buf.writeBigUInt64BE(this._receivedLsn, 1);
    buf.writeBigUInt64BE(this._confirmedLsn, 9);
    buf.writeBigUInt64BE(this._confirmedLsn, 17);
    buf.writeBigInt64BE(BigInt(Date.now() - PG_EPOCH_MS) * 1000n, 25);
    buf[33] = replyRequested ? 1 : 0;
    socket.sendCopyData(buf);
  }

  protected _resume(): void {
    this._intlCon?.socket.resume();
  }

  protected _wake(): void {
    const waiting = this._waiting;
    this._waiting = undefined;
    waiting?.();
  }

  protected _fail(err: Error): void {
    this._error = this._error || err;
    this._finished = true;
    this._wake();
  }
}
