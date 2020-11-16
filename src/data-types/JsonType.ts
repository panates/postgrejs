import {DataType, DataTypeOIDs} from '../definitions';

export const JsonType: DataType = {

    name: 'json',
    oid: DataTypeOIDs.Json,
    mappedType: 'string',

    parseBinary(v: Buffer): string {
        return v.toString('utf8');
    },

    encodeText(v): string {
        if (typeof v === 'object' || typeof v === 'bigint')
            return JSON.stringify(v);
        if (typeof v === 'boolean')
            return v ? 'true' : 'false';
        return '' + v;
    },

    parseText(v): string {
        return '' + v;
    },

    isType(v: any): boolean {
        return typeof v === 'object';
    }

}

export const ArrayJsonType: DataType = {
    ...JsonType,
    name: '_json',
    oid: DataTypeOIDs.ArrayJson,
    elementsOID: DataTypeOIDs.Json
}
