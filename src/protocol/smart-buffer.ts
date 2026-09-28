import { FlexyBuffer } from 'flexy-buffer';
import * as os from 'os';

/** How a `SmartBuffer` grows, how far, and when it gives the pages back. */
export interface SmartBufferConfig {
  /** Bytes added at a time when it has to grow. */
  pageSize?: number;
  /** The most it may ever hold. */
  maxLength?: number;
  /** Idle milliseconds before the grown capacity is released. */
  houseKeepMs?: number;
}

/**
 * Adds the PostgreSQL wire format's two string encodings on top of
 * flexy-buffer's `FlexyBuffer`: a NUL-terminated C string, and a
 * length-prefixed string where a `null`/`undefined` value is written as a
 * length of -1 with no bytes following.
 */
export class SmartBuffer extends FlexyBuffer {
  static DEFAULT_PAGE_SIZE = 512;
  static DEFAULT_MAX_SIZE = Math.min(
    Math.floor(os.totalmem() / 2),
    1024 * 1024 * 1024 * 2, // 2 GB
  );

  constructor(cfg?: SmartBufferConfig) {
    super({
      pageSize: cfg?.pageSize || SmartBuffer.DEFAULT_PAGE_SIZE,
      maxLength: cfg?.maxLength || SmartBuffer.DEFAULT_MAX_SIZE,
      houseKeepMs: cfg?.houseKeepMs,
    });
  }

  writeCString(str: string, encoding?: BufferEncoding): number {
    const written = this.writeString(str, encoding);
    return written + this.writeUInt8(0);
  }

  writeLString(str?: string, encoding?: BufferEncoding): number {
    if (str == null) return this.writeInt32BE(-1);
    const len = Buffer.byteLength(str, encoding);
    return this.writeInt32BE(len) + this.writeString(str, encoding);
  }
}
