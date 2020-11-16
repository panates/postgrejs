import {DataType, DataTypeOIDs} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';
import {readBigInt64BE} from '../util/bigint-methods';

export const Int8Type: DataType = {

    name: 'int8',
    oid: DataTypeOIDs.int8,
    jsType: 'BigInt',

    parseBinary(v: Buffer): bigint {
        if (typeof v.readBigInt64BE === 'function')
            return v.readBigInt64BE(0);
        return readBigInt64BE(v);
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

export const ArrayInt8Type: DataType = {
    ...Int8Type,
    name: '_int8',
    oid: DataTypeOIDs._int8,
    elementsOID: DataTypeOIDs.int8
}
