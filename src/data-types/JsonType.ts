import {DataType} from '../definitions';

export const JsonType: DataType = {

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
