import {DataType} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';

export const CharType: DataType = {

    parseBinary(v: Buffer): string {
        return v.toString('utf8');
    },

    encodeText(v): string {
        return v ? ('' + v) : ' ';
    },

    parseText(v): string {
        return '' + v;
    },

    isType(v: any): boolean {
        return typeof v === 'string' && v.length === 1;
    }

}
