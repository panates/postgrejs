import {DataType, FetchOptions} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';
import {parseDateTime} from '../helpers/parse-datetime';

const timeShift = 946684800000;

export const DateType: DataType = {

    parseBinary(v: Buffer, options: FetchOptions): Date | number {
        const t = v.readInt32BE();
        if (t === 0x7fffffff)
            return Infinity;
        if (t === -0x80000000)
            return -Infinity;
        // Shift from 2000 to 1970
        const d = new Date((t * 1000 * 86400) + timeShift);
        // We created Date object with timestamp number which is always utc
        if (options.utcDates)
            return d;
        // Create date with local timezone
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    },

    encodeBinary(buf: SmartBuffer, v: Date | number | string, options: FetchOptions): void {
        if (typeof v === 'string')
            v = parseDateTime(v, false, false, options.utcDates);
        if (v === Infinity) {
            buf.writeInt32BE(0x7fffffff);
            return;
        }
        if (v === -Infinity) {
            buf.writeInt32BE(-0x80000000);
            return;
        }
        if (!(v instanceof Date))
            v = new Date(v);
        let n = options.utcDates ? v.getTime() :
            v.getTime() - (v.getTimezoneOffset() * 60 * 1000)
        n = (n - timeShift) / 1000 / 86400;
        const t = Math.trunc(n + Number.EPSILON);
        buf.writeInt32BE(t);
    },

    parseText(v: string, options: FetchOptions): Date | number {
        return parseDateTime(v, false, false, options.utcDates);
    },

    isType(v: any): boolean {
        return v instanceof Date;
    }

}
