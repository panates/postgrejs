import arrayParser from 'postgres-array';
import {DataType} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';

export const Float8Type: DataType = {


    parseBinary(v: Buffer): number {
        return v.readDoubleBE(0);
    },

    encodeBinary(buf: SmartBuffer, v: number | string): void {
        buf.writeDoubleBE(typeof v === 'number' ? v : parseFloat(v));
    },

    parseText: parseFloat,

    isType(v: any): boolean {
        return typeof v === 'number';
    }

}
