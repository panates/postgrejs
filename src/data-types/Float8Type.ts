import {DataType, DataTypeOIDs} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';

export const Float8Type: DataType = {

    name: 'float8',
    oid: DataTypeOIDs.Float8,
    mappedType: 'number',

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

export const ArrayFloat8Type: DataType = {
    ...Float8Type,
    name: '_float8',
    oid: DataTypeOIDs.ArrayFloat8,
    elementsOID: DataTypeOIDs.Float8
}
