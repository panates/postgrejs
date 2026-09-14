import { BufferReader as FlexyBufferReader } from 'flexy-buffer';

/**
 * Adds the PostgreSQL wire format's two string encodings on top of
 * flexy-buffer's `BufferReader`: a NUL-terminated C string, and a
 * length-prefixed string where a negative length is the NULL sentinel.
 */
export class BufferReader extends FlexyBufferReader {
  readCString(encoding?: BufferEncoding): string {
    const idx = this.buffer.indexOf(0, this.position);
    if (idx === -1) throw new Error('Eof in buffer detected (readCString)');
    const v = this.buffer.toString(encoding, this.position, idx);
    this.position = idx + 1;
    return v;
  }

  readLString(len: number, encoding?: BufferEncoding): string | null {
    if (len < 0) return null;
    return this.readString(len, encoding);
  }
}
