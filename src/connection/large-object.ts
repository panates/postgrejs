import { Readable, Writable } from 'node:stream';
import { DataTypeOIDs } from '../constants.js';
import { BindParam } from './bind-param.js';
import type { Connection } from './connection.js';

/** Open modes, as PostgreSQL's own INV_READ / INV_WRITE constants. */
export const LargeObjectMode = {
  read: 0x00040000,
  write: 0x00020000,
  readWrite: 0x00060000,
} as const;

export interface LargeObjectStreamOptions {
  /**
   * Bytes per round trip (default 65536). Each chunk is its own `loread`
   * or `lowrite` call, so this trades memory against the number of
   * queries.
   */
  chunkSize?: number;
}

/**
 * A PostgreSQL large object: binary data stored outside the row it belongs
 * to and reached through a file-like interface, so it can be seeked into
 * and read a piece at a time rather than loaded whole the way a `bytea`
 * column must be. Up to 4TB, against roughly 1GB for `bytea`.
 *
 * ```ts
 * const lo = await connection.createLargeObject();
 * await pipeline(fs.createReadStream('video.mp4'), lo.writable());
 * await lo.close();
 * // keep lo.oid somewhere - a large object belongs to no row
 * ```
 *
 * The descriptor a large object is opened with only lives as long as the
 * transaction that opened it, so one is started if the connection is not
 * already in one, and close() commits that one - but never a transaction
 * the caller started, which stays theirs to finish.
 */
export class LargeObject {
  readonly oid: number;
  protected readonly _connection: Connection;
  protected readonly _fd: number;
  /** True when this object opened the transaction and so should commit it. */
  protected readonly _ownsTransaction: boolean;
  protected _closed = false;

  constructor(
    connection: Connection,
    oid: number,
    fd: number,
    ownsTransaction: boolean,
  ) {
    this._connection = connection;
    this.oid = oid;
    this._fd = fd;
    this._ownsTransaction = ownsTransaction;
  }

  /** Reads at most `length` bytes from the current position. */
  async read(length: number): Promise<Buffer> {
    this._assertOpen();
    const r = await this._connection.query('select loread($1, $2) as data', {
      params: [
        new BindParam(DataTypeOIDs.int4, this._fd),
        new BindParam(DataTypeOIDs.int4, length),
      ],
    });
    return (r.rows?.[0][0] as Buffer) ?? Buffer.alloc(0);
  }

  /** Writes at the current position and returns how many bytes went in. */
  async write(data: Buffer): Promise<number> {
    this._assertOpen();
    const r = await this._connection.query('select lowrite($1, $2) as n', {
      params: [
        new BindParam(DataTypeOIDs.int4, this._fd),
        new BindParam(DataTypeOIDs.bytea, data),
      ],
    });
    return Number(r.rows?.[0][0]);
  }

  /** Moves the read/write position. `whence`: 0 start, 1 current, 2 end. */
  async seek(offset: number | bigint, whence = 0): Promise<bigint> {
    this._assertOpen();
    const r = await this._connection.query(
      'select lo_lseek64($1, $2, $3) as pos',
      {
        params: [
          new BindParam(DataTypeOIDs.int4, this._fd),
          new BindParam(DataTypeOIDs.int8, BigInt(offset)),
          new BindParam(DataTypeOIDs.int4, whence),
        ],
      },
    );
    return BigInt(r.rows?.[0][0]);
  }

  /** The current read/write position. */
  async tell(): Promise<bigint> {
    this._assertOpen();
    const r = await this._connection.query('select lo_tell64($1) as pos', {
      params: [new BindParam(DataTypeOIDs.int4, this._fd)],
    });
    return BigInt(r.rows?.[0][0]);
  }

  /** Total size in bytes; leaves the position where it found it. */
  async size(): Promise<bigint> {
    const here = await this.tell();
    const end = await this.seek(0, 2);
    await this.seek(here, 0);
    return end;
  }

  /** Cuts the object down to `length` bytes. */
  async truncate(length: number | bigint): Promise<void> {
    this._assertOpen();
    await this._connection.query('select lo_truncate64($1, $2)', {
      params: [
        new BindParam(DataTypeOIDs.int4, this._fd),
        new BindParam(DataTypeOIDs.int8, BigInt(length)),
      ],
    });
  }

  /** Reads from the current position to the end. */
  readable(options?: LargeObjectStreamOptions): Readable {
    const chunkSize = options?.chunkSize || 65536;
    const self = this;
    return new Readable({
      async read() {
        try {
          const chunk = await self.read(chunkSize);
          // A short read is not the end; an empty one is.
          this.push(chunk.length ? chunk : null);
        } catch (e) {
          this.destroy(e as Error);
        }
      },
    });
  }

  /** Writes from the current position onwards. */
  writable(options?: LargeObjectStreamOptions): Writable {
    const self = this;
    return new Writable({
      highWaterMark: options?.chunkSize || 65536,
      write(chunk: Buffer, _encoding, callback) {
        // Each write is its own round trip, so awaiting it before asking
        // for more is what keeps a fast source from running ahead.
        self
          .write(chunk)
          .then(() => callback())
          .catch(callback);
      },
    });
  }

  /**
   * Closes the descriptor, and commits the transaction if this object
   * started it. Safe to call twice.
   */
  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    await this._connection.query('select lo_close($1)', {
      params: [new BindParam(DataTypeOIDs.int4, this._fd)],
    });
    if (this._ownsTransaction) await this._connection.commit();
  }

  protected _assertOpen(): void {
    if (this._closed)
      throw new Error(`Large object ${this.oid} is already closed`);
  }
}
