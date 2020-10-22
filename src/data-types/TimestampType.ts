import arrayParser from 'postgres-array';
import {DataType, Nullable} from '../definitions';
import {parseTimestamp} from '../helpers';

const timeShift = 946684800000;
const timeMul = 4294967296;

export const TimestampType: DataType = {

    parse(v: string, isArray?: boolean): Nullable<Date | Number> | Nullable<Date | Number>[] {
        if (isArray)
            return arrayParser.parse(v, parseTimestamp);
        return parseTimestamp(v);
    },

    decode(v: Buffer): Date {
        const lo = v.readInt32BE();
        const hi = v.readInt32BE();
        return new Date((lo + hi * timeMul) / 1000 + timeShift);
    },

    encode(v: Date): string | Buffer {
        return v.toUTCString().substring(0, 19) +
            (v.getUTCMilliseconds() ? '.' + v.getUTCMilliseconds() : '');
    },

    isType(v: any): boolean {
        return v instanceof Date;
    }

}
