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
/** The ceiling on `maxSizeFor`, and its answer when there is no machine to measure. */
const HARD_MAX = 1024 * 1024 * 1024 * 2; // 2 GB

/**
 * The most a buffer may ever hold, given how much memory the machine has.
 *
 * @param totalMemory Bytes of memory, or 0 when that cannot be known.
 * @returns Half of it, capped - or the cap alone when it is unknown.
 */
/* `os.totalmem()` answers 0 where there is no machine to ask about:
   measured under Cloudflare's workerd, where `node:os` resolves and
   returns zeros rather than throwing. Taking the minimum of that was a
   maximum size of zero, which worked only because flexy-buffer reads a
   falsy `maxLength` as "use the default" - an accident, and one that
   would have become a buffer refusing every write the day that default
   changed. */
export function maxSizeFor(totalMemory: number): number {
  return totalMemory > 0
    ? Math.min(Math.floor(totalMemory / 2), HARD_MAX)
    : HARD_MAX;
}

export class SmartBuffer extends FlexyBuffer {
  static DEFAULT_PAGE_SIZE = 512;
  static DEFAULT_MAX_SIZE = maxSizeFor(
    typeof os.totalmem === 'function' ? os.totalmem() : 0,
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
