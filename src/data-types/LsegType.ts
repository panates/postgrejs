import arrayParser from 'postgres-array';
import {DataType, Nullable, FiniteLine} from '../definitions';
import {parseFiniteLine} from '../helpers';

export const LsegType: DataType = {

    parse(v: string, isArray?: boolean): Nullable<FiniteLine> | Nullable<FiniteLine>[] {
        if (isArray) {
            if (v.includes(';')) {
                v = v.substring(1, v.length - 1);
                return v.split(';').map(parseFiniteLine)
            }
            return arrayParser.parse(v, parseFiniteLine);
        }
        return parseFiniteLine(v);
    },

    decode(v: Buffer): FiniteLine {
        return {
            x1: v.readDoubleBE(0),
            y1: v.readDoubleBE(0),
            x2: v.readDoubleBE(0),
            y2: v.readDoubleBE(0)
        };
    },

    encode(v: FiniteLine): string {
        return '((' + v.x1 + ',' + v.y1 + '), ' +
            '(' + v.x2 + ',' + v.y2 + '))';
    },

    isType(v: any): boolean {
        return typeof v === 'object' &&
            typeof v.x1 === 'number' &&
            typeof v.y1 === 'number' &&
            typeof v.x2 === 'number' &&
            typeof v.y2 === 'number';
    }

}
