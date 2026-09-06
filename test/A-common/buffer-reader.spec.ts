import { expect } from 'expect';
import { BufferReader } from '../../src/protocol/buffer-reader.js';

describe('BufferReader', () => {
  it('should report the underlying buffer length', () => {
    const reader = new BufferReader(Buffer.from([1, 2, 3]));
    expect(reader.length).toStrictEqual(3);
  });

  it('should read an unsigned 8-bit integer and advance by 1', () => {
    const reader = new BufferReader(Buffer.from([200]));
    expect(reader.readUInt8()).toStrictEqual(200);
    expect(reader.offset).toStrictEqual(1);
  });

  it('should read an unsigned 16-bit big-endian integer and advance by 2', () => {
    const reader = new BufferReader(Buffer.from([0x01, 0x02]));
    expect(reader.readUInt16BE()).toStrictEqual(0x0102);
    expect(reader.offset).toStrictEqual(2);
  });

  it('should read a signed 16-bit big-endian integer', () => {
    const reader = new BufferReader(Buffer.from([0xff, 0xff]));
    expect(reader.readInt16BE()).toStrictEqual(-1);
  });

  it('should read an unsigned 32-bit big-endian integer and advance by 4', () => {
    const reader = new BufferReader(Buffer.from([0, 0, 1, 0]));
    expect(reader.readUInt32BE()).toStrictEqual(256);
    expect(reader.offset).toStrictEqual(4);
  });

  it('should read a signed 32-bit big-endian integer', () => {
    const reader = new BufferReader(Buffer.from([0xff, 0xff, 0xff, 0xff]));
    expect(reader.readInt32BE()).toStrictEqual(-1);
  });

  it('should read a NUL-terminated string and stop past the NUL byte', () => {
    const reader = new BufferReader(Buffer.from('hello\0world'));
    expect(reader.readCString()).toStrictEqual('hello');
    expect(reader.offset).toStrictEqual(6);
  });

  it('should throw when a C-string is not NUL-terminated', () => {
    const reader = new BufferReader(Buffer.from('hello'));
    expect(() => reader.readCString()).toThrow(/Eof in buffer detected/);
  });

  it('should read a length-prefixed string', () => {
    const reader = new BufferReader(Buffer.from('hello'));
    expect(reader.readLString(5)).toStrictEqual('hello');
    expect(reader.offset).toStrictEqual(5);
  });

  it('should return null for a negative length without consuming anything', () => {
    const reader = new BufferReader(Buffer.from('hello'));
    expect(reader.readLString(-1)).toStrictEqual(null);
    expect(reader.offset).toStrictEqual(0);
  });

  it('should read a bounded sub-buffer and advance by its length', () => {
    const reader = new BufferReader(Buffer.from([1, 2, 3, 4]));
    const buf = reader.readBuffer(2);
    expect([...buf]).toStrictEqual([1, 2]);
    expect(reader.offset).toStrictEqual(2);
  });

  it('should read the remainder of the buffer when no length is given', () => {
    const reader = new BufferReader(Buffer.from([1, 2, 3, 4]));
    reader.readUInt8();
    const buf = reader.readBuffer();
    expect([...buf]).toStrictEqual([2, 3, 4]);
    expect(reader.offset).toStrictEqual(4);
  });

  it('should throw when reading past the end of the buffer', () => {
    const reader = new BufferReader(Buffer.from([1, 2]));
    expect(() => reader.readUInt32BE()).toThrow(/Eof in buffer detected/);
  });
});
