import {DataType, Nullable, Point} from '../definitions';
import arrayParser from 'postgres-array';
import {parsePoint} from '../helpers';

export const PointType: DataType = {

    parse(v: string, isArray?: boolean): Nullable<Point> | Nullable<Point>[] {
        if (isArray)
            return arrayParser.parse(v, parsePoint);
        return parsePoint(v);
    },

    decode(v: Buffer): Point {
        return {
            x: v.readDoubleBE(0),
            y: v.readDoubleBE(0)
        };
    },

    encode(v: Point): string {
        return '(' + v.x + ',' + v.y + ')';
    },

    isType(v: any): boolean {
        return typeof v === 'object' &&
            typeof v.x === 'number' &&
            typeof v.y === 'number';
    }

}
