import { Readable, Writable } from 'node:stream';
import type { DataFormat } from '../constants.js';
import type { DatabaseError } from '../protocol/database-error.js';
import type { CaptureCallback, PgSocket } from '../protocol/pg-socket.js';
import { Protocol } from '../protocol/protocol.js';

const BackendMessageCode = Protocol.BackendMessageCode;

/**
 * A COPY ... TO STDOUT in progress, as a Readable of the raw bytes the
 * server sends - text, CSV or binary, whichever the statement asked for.
 * No decoding happens here: the payload is handed on exactly as it arrived,
 * without a copy.
 *
 * The stream must be consumed (or destroyed): until the copy finishes the
 * connection is still mid-statement, and an unread stream pauses the socket
 * rather than buffering the whole export in memory.
 */
export class CopyToStream extends Readable {
  /** Format of the copy as a whole, from CopyOutResponse. */
  overallFormat?: DataFormat;
  /** Per-column formats, from CopyOutResponse. */
  columnFormats?: DataFormat[];
  /**
   * Rows the server reported for the copy. Set before 'end' is emitted, so
   * it is always readable once the stream has finished.
   */
  rowCount?: number;
  protected readonly _socket: PgSocket;
  protected _error?: Error;
  protected _started?: (err?: Error) => void;
  protected _discarding = false;
  protected _settled = false;
  protected _paused = false;

  constructor(socket: PgSocket) {
    super();
    this._socket = socket;
  }

  /**
   * Handles the copy's backend messages. Passed straight to
   * PgSocket.sendQueryMessage() by IntlConnection.copyTo().
   */
  readonly capture: CaptureCallback = (code, msg, done) => {
    switch (code) {
      case BackendMessageCode.CopyOutResponse:
        this.overallFormat = msg.overallFormat;
        this.columnFormats = msg.columnFormats;
        this._started?.();
        this._started = undefined;
        break;
      case BackendMessageCode.CopyData:
        if (this._discarding) break;
        if (!this.push(msg.data) && !this._paused) {
          this._paused = true;
          this._socket.pause();
        }
        break;
      case BackendMessageCode.CopyDone:
        break;
      case BackendMessageCode.CommandComplete:
        this.rowCount = msg.rowCount;
        break;
      case BackendMessageCode.ErrorResponse:
        this._error = msg as DatabaseError;
        break;
      case BackendMessageCode.ReadyForQuery:
        this._finish(done);
        break;
      default:
        if (!this._error && !this.overallFormat)
          this._error = new Error(
            'Statement did not start a COPY TO STDOUT - use query() or execute() instead',
          );
        break;
    }
  };

  /**
   * Resolves once the server has accepted the copy, rejects if it never
   * starts one.
   */
  waitStarted(): Promise<void> {
    if (this.overallFormat != null) return Promise.resolve();
    if (this._error) return Promise.reject(this._error);
    return new Promise((resolve, reject) => {
      this._started = (err?: Error) => (err ? reject(err) : resolve());
    });
  }

  /**
   * Reports a failure that happened outside the message flow (the socket
   * dying, say). A no-op once the copy has already settled, so the normal
   * error path is never reported twice.
   */
  fail(err: Error): void {
    if (this._settled) return;
    this._settled = true;
    this._error = this._error || err;
    const started = this._started;
    this._started = undefined;
    if (started) started(this._error);
    else if (!this.destroyed) this.destroy(this._error);
  }

  override _read(): void {
    if (!this._paused) return;
    this._paused = false;
    this._socket.resume();
  }

  override _destroy(
    err: Error | null,
    callback: (err?: Error | null) => void,
  ): void {
    this._discarding = true;
    this._paused = false;
    this._socket.resume();
    callback(err);
  }

  protected _finish(done: (err?: Error) => void): void {
    this._settled = true;
    const err = this._error;
    const started = this._started;
    this._started = undefined;
    done(err);
    if (started) {
      started(err || new Error('Copy ended before it started'));
      return;
    }
    if (this._discarding) return;
    if (err) this.destroy(err);
    else this.push(null);
  }
}

/**
 * A COPY ... FROM STDIN in progress, as a Writable. Whatever is written is
 * forwarded as CopyData without being copied or reinterpreted, so the
 * caller decides the encoding by the format its statement asked for.
 *
 * 'finish' means the server accepted the whole copy: the stream waits for
 * CommandComplete rather than for the last byte to leave, so rowCount is
 * set by the time a `pipeline()` over it resolves. Destroying the stream
 * (which `pipeline()` does when the source fails) sends CopyFail, leaving
 * the connection usable rather than stuck waiting for data.
 */
export class CopyFromStream extends Writable {
  /** Rows the server accepted. Set before 'finish' is emitted. */
  rowCount?: number;
  protected readonly _socket: PgSocket;
  protected _error?: Error;
  protected _started?: (err?: Error) => void;
  protected _completed?: (err?: Error) => void;
  protected _copyEnded = false;
  protected _settled = false;

  constructor(socket: PgSocket) {
    super();
    this._socket = socket;
  }

  /**
   * Handles the copy's backend messages. Passed straight to
   * PgSocket.sendQueryMessage() by IntlConnection.copyFrom().
   */
  readonly capture: CaptureCallback = (code, msg, done) => {
    switch (code) {
      case BackendMessageCode.CopyInResponse:
        this._started?.();
        this._started = undefined;
        break;
      case BackendMessageCode.CommandComplete:
        this.rowCount = msg.rowCount;
        break;
      case BackendMessageCode.ErrorResponse:
        this._error = msg as DatabaseError;
        if (!this._copyEnded && !this.destroyed) this.destroy(this._error);
        break;
      case BackendMessageCode.ReadyForQuery:
        this._finish(done);
        break;
      default:
        if (!this._error && !this._copyEnded && this._started)
          this._error = new Error(
            'Statement did not start a COPY FROM STDIN - use query() or execute() instead',
          );
        break;
    }
  };

  /**
   * Resolves once the server is ready for data, rejects if it never asks
   * for any.
   */
  waitStarted(): Promise<void> {
    if (this._error) return Promise.reject(this._error);
    return new Promise((resolve, reject) => {
      this._started = (err?: Error) => (err ? reject(err) : resolve());
    });
  }

  /** See CopyToStream.fail(). */
  fail(err: Error): void {
    if (this._settled) return;
    this._settled = true;
    this._error = this._error || err;
    const started = this._started;
    this._started = undefined;
    const completed = this._completed;
    this._completed = undefined;
    if (started) started(this._error);
    else if (completed) completed(this._error);
    else if (!this.destroyed) this.destroy(this._error);
  }

  override _write(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (err?: Error | null) => void,
  ): void {
    if (this._error) return callback(this._error);
    this._socket.sendCopyData(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
      callback,
    );
  }

  override _final(callback: (err?: Error | null) => void): void {
    if (this._error) return callback(this._error);
    this._copyEnded = true;
    this._socket.sendCopyDone();
    this._completed = callback;
  }

  override _destroy(
    err: Error | null,
    callback: (err?: Error | null) => void,
  ): void {
    if (this._copyEnded) return callback(err);
    this._copyEnded = true;
    this._socket.sendCopyFail(err ? err.message : 'aborted by client');
    callback(err);
  }

  protected _finish(done: (err?: Error) => void): void {
    this._settled = true;
    const err = this._error;
    const started = this._started;
    this._started = undefined;
    const completed = this._completed;
    this._completed = undefined;
    done(err);
    if (started)
      return started(err || new Error('Copy ended before it started'));
    if (completed) return completed(err);
    if (err && !this.destroyed) this.destroy(err);
  }
}
