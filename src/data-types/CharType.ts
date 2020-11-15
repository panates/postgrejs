import {DataType, DataTypeOIDs} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';

export const CharType: DataType = {

    name: 'char',
    oid: DataTypeOIDs.Char,

    parseBinary(v: Buffer): string {
        return v.toString('utf8');
    },

    encodeBinary(buf: SmartBuffer, v: string): void {
        buf.writeString((v ? ('' + v) : ' ')[0], 'utf8');
    },

    parseText(v): string {
        return '' + v;
    },

    isType(v: any): boolean {
        return typeof v === 'string' && v.length === 1;
    }

}

export const ArrayCharType: DataType = {
    ...CharType,
    name: '_char',
    oid: DataTypeOIDs.ArrayChar,
    elementsOID: DataTypeOIDs.Char
}
