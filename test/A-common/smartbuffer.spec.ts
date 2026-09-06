import { expect } from 'expect';
import { SmartBuffer } from '../../src/index.js';

describe('SmartBuffer', () => {
  it('should automatically grow', () => {
    const buf = new SmartBuffer({ pageSize: 16 });
    expect(buf.buffer.length).toStrictEqual(16);
    buf.writeString('1234567890');
    expect(buf.buffer.length).toStrictEqual(16);
    buf.writeString('1234567890'.repeat(10));
    expect(buf.buffer.length).toStrictEqual(112);
  });

  it('should house keep on given interval time', done => {
    const buf = new SmartBuffer({ pageSize: 16, houseKeepInterval: 50 });
    expect(buf.buffer.length).toStrictEqual(16);
    buf.writeString('1234567890'.repeat(10));
    expect(buf.buffer.length).toStrictEqual(112);
    buf.flush();
    setTimeout(() => {
      try {
        expect(buf.buffer.length).toStrictEqual(16);
        done();
      } catch (e) {
        done(e);
      }
    }, 150);
  });

  it('should refuse to grow past its configured maxSize', () => {
    const buf = new SmartBuffer({ pageSize: 4, maxLength: 6 });
    buf.start();
    buf.writeInt32BE(1);
    expect(() => buf.writeInt32BE(2)).toThrow(/Buffer limit exceeded/);
  });

  it('should clear a pending housekeeping timer when flush() runs again before start()', () => {
    // pageSize 4 with two 4-byte writes forces the buffer to grow past one
    // page, which is what makes the first flush() schedule a housekeeping
    // timer at all - a single-page write never would. start() itself also
    // clears a pending timer, so this needs two flush() calls back to back
    // with no start() in between to reach flush()'s own clearTimeout.
    const buf = new SmartBuffer({ pageSize: 4, houseKeepInterval: 100000 });
    buf.start();
    buf.writeInt32BE(1);
    buf.writeInt32BE(2);
    expect(buf.capacity).toBeGreaterThan(4);
    buf.flush(); // schedules a housekeeping timer
    expect(() => buf.flush()).not.toThrow();
  });

  it('should flush a zero-length write without dividing by the page size', () => {
    const buf = new SmartBuffer({ pageSize: 4 });
    buf.start();
    const out = buf.flush();
    expect(out.length).toStrictEqual(0);
  });

  it("should size the next housekeeping pass by whatever's pending, not just what was last flushed", () => {
    // Only reachable in practice from the deferred timer callback, once
    // start() + a write reused the buffer for something new before it
    // fires - forced directly here (skipping flush(), which would reset
    // length back to 0 first) instead of racing a real timer.
    const buf = new SmartBuffer({ pageSize: 4 });
    buf.start();
    buf.writeInt32BE(1);
    buf.writeInt32BE(2);
    (buf as any)._houseKeep();
    expect((buf as any)._stMaxPages).toStrictEqual(2);
  });

  describe('writeLString()', () => {
    it('should write length -1 and no bytes for a null/undefined string', () => {
      const buf = new SmartBuffer();
      buf.start();
      buf.writeLString(undefined);
      const out = buf.flush();
      expect(out.readInt32BE(0)).toStrictEqual(-1);
      expect(out.length).toStrictEqual(4);
    });

    it('should write length 0 and no bytes for an empty string', () => {
      const buf = new SmartBuffer();
      buf.start();
      buf.writeLString('');
      const out = buf.flush();
      expect(out.readInt32BE(0)).toStrictEqual(0);
      expect(out.length).toStrictEqual(4);
    });
  });

  describe('writeBigInt64BE()', () => {
    it('should accept a plain number and convert it to bigint', () => {
      const buf = new SmartBuffer();
      buf.start();
      buf.writeBigInt64BE(123);
      const out = buf.flush();
      expect(out.readBigInt64BE(0)).toStrictEqual(123n);
    });

    it('should fall back to the manual writer when the buffer has no native writeBigInt64BE', () => {
      const buf = new SmartBuffer();
      buf.start();
      (buf as any).buffer.writeBigInt64BE = undefined;
      try {
        buf.writeBigInt64BE(456n);
      } finally {
        delete (buf as any).buffer.writeBigInt64BE;
      }
      const out = buf.flush();
      expect(out.readBigInt64BE(0)).toStrictEqual(456n);
    });
  });
});
