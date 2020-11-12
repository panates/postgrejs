import {DataType, DataTypeOIDs} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';
// noinspection ES6PreferShortImport
import {fastParseInt} from '../helpers/fast-parseint';

export const OidType: DataType = {

    name: 'oid',
    oid: DataTypeOIDs.Oid,

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

export const ArrayOidType: DataType = {
    ...OidType,
    name: '_oid',
    oid: DataTypeOIDs.ArrayOid,
    elementsOID: DataTypeOIDs.Oid
}
