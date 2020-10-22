import arrayParser from 'postgres-array';
import {DataType, Nullable, Circle} from '../definitions';
import {parseCircle} from '../helpers';

export const CircleType: DataType = {

    parse(v: string, isArray?: boolean): Nullable<Circle> | Nullable<Circle>[] {
        if (isArray)
            return arrayParser.parse(v, parseCircle);
        return parseCircle(v);
    },

    decode(v: Buffer): Circle {
        return {
            x: v.readDoubleBE(0),
            y: v.readDoubleBE(0),
            r: v.readDoubleBE(0),
        };
    },

    encode(v: Circle): string {
        return '<(' + v.x + ',' + v.y + '), ' + v.r + '>';
    },

    isType(v: any): boolean {
        return typeof v === 'object' &&
            typeof v.x === 'number' &&
            typeof v.y === 'number' &&
            typeof v.r === 'number';
    }

}
