import {DataType} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';
import {fastParseInt} from '../helpers/fast-parseint';

export const OidType: DataType = {

    parseBinary(v: Buffer): number {
        return v.readUInt32BE(0);
    },

    encodeBinary(buf: SmartBuffer, v: number): void {
        buf.writeUInt32BE(fastParseInt(v));
    },

    parseText: fastParseInt,

    isType(v: any): boolean {
        return typeof v === 'number' &&
            Number.isInteger(v) && v >= 0;
    }

}
