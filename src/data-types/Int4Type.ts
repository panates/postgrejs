import {DataType, DataTypeOIDs} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';
// noinspection ES6PreferShortImport
import {fastParseInt} from '../helpers/fast-parseint';

export const Int4Type: DataType = {

    name: 'int4',
    oid: DataTypeOIDs.Int4,

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

export const ArrayInt4Type: DataType = {
    ...Int4Type,
    name: '_int4',
    oid: DataTypeOIDs.ArrayInt4,
    elementsOID: DataTypeOIDs.Int4
}
