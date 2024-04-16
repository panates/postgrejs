import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

describe('SmartBuffer', function () {
  it('should automatically grow', function () {
    const buf = new SmartBuffer({ pageSize: 16 });
    expect(buf.buffer.length).toStrictEqual(16);
    buf.writeString('1234567890');
    expect(buf.buffer.length).toStrictEqual(16);
    buf.writeString('1234567890'.repeat(10));
    expect(buf.buffer.length).toStrictEqual(112);
  });

  it('should house keep on given interval time', function (done) {
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
});
