import {DataType, FetchOptions} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';
import {parseDateTime} from '../helpers/parse-datetime';

const timeShift = 946684800000;
const timeMul = 4294967296;

export const TimestampType: DataType = {

    parseBinary(v: Buffer, options: FetchOptions): Date | number {
        const hi = v.readInt32BE();
        const lo = v.readUInt32BE(4);
        if (lo === 0xffffffff && hi === 0x7fffffff) return Infinity;
        if (lo === 0x00000000 && hi === -0x80000000) return -Infinity;

        // Shift from 2000 to 1970
        const d = new Date((lo + hi * timeMul) / 1000 + timeShift);
        // We created Date object with timestamp number which is always utc
        if (options.utcDates)
            return d;
        // Create date with local timezone
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
            d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
    },

    encodeBinary(buf: SmartBuffer, v: Date | number | string, options: FetchOptions): void {
        if (typeof v === 'string')
            v = parseDateTime(v, true, false, options.utcDates);
        if (v === Infinity) {
            buf.writeInt32BE(0x7fffffff); // hi
            buf.writeUInt32BE(0xffffffff); // lo
            return;
        }
        if (v === -Infinity) {
            buf.writeInt32BE(-0x80000000); // hi
            buf.writeUInt32BE(0x00000000); // lo
            return;
        }
        if (!(v instanceof Date))
            v = new Date(v);
        // Postgresql ignores timezone data so we are
        let n = options.utcDates ? v.getTime() :
            v.getTime() - (v.getTimezoneOffset() * 60 * 1000)
        n = (n - timeShift) * 1000;
        const hi = Math.floor(n / timeMul);
        const lo = n - hi * timeMul;
        buf.writeInt32BE(hi);
        buf.writeUInt32BE(lo);
    },

    parseText(v: string, options: FetchOptions): Date | number {
        return parseDateTime(v, true, false, options.utcDates);
    },

    isType(v: any): boolean {
        return v instanceof Date;
    }

}
