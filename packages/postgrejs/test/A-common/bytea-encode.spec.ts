import { expect } from 'expect';
import { DataTypeOIDs, GlobalTypeMap } from 'postgrejs';
import { ByteaType } from '../../src/data-types/bytea-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

describe('bytea: any ArrayBuffer view', () => {
  // A window onto a larger buffer: the bytes on either side are what a
  // naive `Buffer.from(view.buffer)` would send along with it.
  const backing = new Uint8Array([42, 0, 128, 255, 43]);
  const view = backing.subarray(1, 4);

  function encodeBinary(v: any): Buffer {
    const buf = new SmartBuffer();
    ByteaType.encodeBinary!(buf, v, {});
    return buf.toBuffer();
  }

  it('should infer bytea for a Uint8Array, not json', () => {
    expect(GlobalTypeMap.determine(view)).toStrictEqual(DataTypeOIDs.bytea);
    expect(GlobalTypeMap.determine([view])).toStrictEqual(DataTypeOIDs._bytea);
  });

  it('should still infer bytea for a Buffer', () => {
    expect(GlobalTypeMap.determine(Buffer.from([1, 2]))).toStrictEqual(
      DataTypeOIDs.bytea,
    );
  });

  it('should encode only the bytes a view covers (binary)', () => {
    expect(encodeBinary(view)).toStrictEqual(Buffer.from([0, 128, 255]));
  });

  it('should encode only the bytes a view covers (text)', () => {
    // `Uint8Array.prototype.toString` ignores its argument and answers
    // "0,128,255", so this path has to reach a Buffer before asking for hex.
    expect(ByteaType.encodeText!(view, {})).toStrictEqual('\\x0080ff');
  });

  it('should encode a DataView over the same window', () => {
    const dv = new DataView(backing.buffer, 1, 3);
    expect(encodeBinary(dv)).toStrictEqual(Buffer.from([0, 128, 255]));
  });

  it('should pass a Buffer through without copying it', () => {
    const buf = Buffer.from([1, 2, 3]);
    expect(encodeBinary(buf)).toStrictEqual(buf);
  });

  it('should encode an empty view', () => {
    expect(encodeBinary(backing.subarray(2, 2))).toStrictEqual(Buffer.alloc(0));
  });
});
