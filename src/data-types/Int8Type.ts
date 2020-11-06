import {DataType} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';

export const Int8Type: DataType = {

    parseBinary(v: Buffer): bigint {
        return v.readBigInt64BE(0);
    },

    encodeBinary(buf: SmartBuffer, v: bigint | number): void {
        buf.writeBigInt64BE(v);
    },

    parseText(v: string): bigint {
        return BigInt(v);
    },

    isType(v: any): boolean {
        return v instanceof BigInt;
    }

}
