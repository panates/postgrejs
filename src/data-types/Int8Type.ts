import arrayParser from 'postgres-array';
import {DataType} from '../definitions';

export const Int8Type: DataType = {

    parse(v: string, isArray?: boolean): bigint | bigint[] {
        if (isArray)
            return arrayParser.parse(v, Int8Type.parse);
        return BigInt(v);
    },

    decode(v: Buffer): bigint {
        return v.readBigInt64BE(0);
    },

    encode(v: bigint): Buffer {
        const buf = Buffer.allocUnsafe(8);
        buf.writeBigInt64BE(v);
        return buf;
    },

    isType(v: any): boolean {
        return v instanceof BigInt;
    }

}
