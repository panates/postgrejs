import {DataType} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';
import {fastParseInt} from '../helpers/fast-parseint';

export const Int4Type: DataType = {

    parseBinary(v: Buffer): number {
        return v.readInt32BE(0);
    },

    encodeBinary(buf: SmartBuffer, v: number): void {
        buf.writeInt32BE(fastParseInt(v));
    },

    parseText: fastParseInt,

    isType(v: any): boolean {
        return typeof v === 'number' &&
            Number.isInteger(v);
    }

}
