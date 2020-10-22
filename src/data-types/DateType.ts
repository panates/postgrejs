import arrayParser from 'postgres-array';
import {DataType, Nullable} from '../definitions';
import {parseDate} from '../helpers';

const timeShift = 946684800000;

export const DateType: DataType = {

    parse(v: string, isArray?: boolean): Nullable<Date | Number> | Nullable<Date | Number>[] {
        if (isArray)
            return arrayParser.parse(v, parseDate);
        return parseDate(v);
    },

    decode(v: Buffer): Date | Number {
        const t = v.readInt32BE();
        return new Date((t * 1000 * 86400) + timeShift);
    },

    encode(v: Date): string | Buffer {
        return v.toUTCString().substring(0, 10);
    },

    isType(v: any): boolean {
        return v instanceof Date;
    }

}
