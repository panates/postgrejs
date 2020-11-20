import assert from 'assert';
import '../_support/env';
import {SmartBuffer} from '../../src/protocol/SmartBuffer';

describe('SmartBuffer', function () {

   it('should automatically grow', function () {
        const buf = new SmartBuffer({pageSize: 16});
        assert.deepStrictEqual(buf.buffer.length, 16);
        buf.writeString('1234567890');
        assert.deepStrictEqual(buf.buffer.length, 16);
        buf.writeString('1234567890'.repeat(10));
        assert.deepStrictEqual(buf.buffer.length, 112);
    });

    it('should house keep on given interval time', function (done) {
        const buf = new SmartBuffer({pageSize: 16, houseKeepInterval: 50});
        assert.deepStrictEqual(buf.buffer.length, 16);
        buf.writeString('1234567890'.repeat(10));
        assert.deepStrictEqual(buf.buffer.length, 112);
        buf.flush();
        setTimeout(() => {
            try {
                assert.deepStrictEqual(buf.buffer.length, 16);
                done();
            } catch (e) {
                done(e);
            }
        }, 150);

    });

});
