import {DataType} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';

export const Float4Type: DataType = {

    parseBinary(v: Buffer): number {
        return Math.round((v.readFloatBE(0) + Number.EPSILON) * 100) / 100;
    },

    encodeBinary(buf: SmartBuffer, v: number | string): void {
        buf.writeFloatBE(typeof v === 'number' ? v : parseFloat(v));
    },

    parseText: parseFloat,

    isType(v: any): boolean {
        return typeof v === 'number';
    }

}
