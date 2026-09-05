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
  // Set when the consumer destroys the stream early. The copy itself cannot
  // be cancelled mid-flight, so the remaining rows are read and thrown away
  // instead - dropping them on the floor would leave the connection sitting
  // in copy-out with a response nobody is reading.
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
        // push() returning false means the consumer is behind; stop
        // reading from the socket until _read() asks for more. One socket
        // chunk usually carries many CopyData messages and every one of
        // them reports the buffer as full, so the flag keeps this to one
        // pause per stall instead of one per row.
        if (!this.push(msg.data) && !this._paused) {
          this._paused = true;
          this._socket.pause();
        }
        break;
      case BackendMessageCode.CopyDone:
        // Deliberately not ending the stream here: CommandComplete carries
        // the row count and arrives right after, and ending now would race
        // 'end' against it.
        break;
      case BackendMessageCode.CommandComplete:
        this.rowCount = msg.rowCount;
        break;
      case BackendMessageCode.ErrorResponse:
        this._error = msg as DatabaseError;
        break;
      case BackendMessageCode.ReadyForQuery:
        // Only here, once the connection is idle again, so a consumer that
        // awaits the stream can safely issue its next query.
        this._finish(done);
        break;
      default:
        // Anything else means the statement was not a COPY ... TO STDOUT.
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
    // Keep reading so the connection reaches ReadyForQuery; the rows are
    // dropped by the CopyData branch above.
    this._discarding = true;
    this._paused = false;
    this._socket.resume();
    callback(err);
  }

  protected _finish(done: (err?: Error) => void): void {
    this._settled = true;
    const err = this._error;
    // A copy that never started has no stream for anyone to listen on, so
    // the failure has to go to waitStarted() and nowhere else - destroying
    // the stream here would raise an 'error' event with no listener.
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
        // The server has stopped accepting rows and will ignore everything
        // up to CopyDone/CopyFail, so stop feeding it. destroy() sends the
        // CopyFail that gets the connection out of copy-in mode.
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
    // The callback is the socket's own write callback, so a full socket
    // buffer pauses the source rather than growing in memory.
    this._socket.sendCopyData(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
      callback,
    );
  }

  override _final(callback: (err?: Error | null) => void): void {
    if (this._error) return callback(this._error);
    this._copyEnded = true;
    this._socket.sendCopyDone();
    // Not done yet: 'finish' should mean the server accepted the copy, so
    // wait for its CommandComplete/ReadyForQuery.
    this._completed = callback;
  }

  override _destroy(
    err: Error | null,
    callback: (err?: Error | null) => void,
  ): void {
    if (this._copyEnded) return callback(err);
    this._copyEnded = true;
    // Without this the server would wait for data that is never coming.
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
    // Same reasoning as CopyToStream._finish(): before waitStarted()
    // resolves there is no stream anyone could be listening to.
    if (started)
      return started(err || new Error('Copy ended before it started'));
    if (completed) return completed(err);
    if (err && !this.destroyed) this.destroy(err);
  }
}
