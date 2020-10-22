import arrayParser from 'postgres-array';
import {DataType} from '../definitions';

export const BoolType: DataType = {

    decode(v: Buffer): boolean {
        return !!v.readUInt8();
    },

    parse(v: string, isArray?: boolean): boolean | boolean[] {
        if (isArray)
            return arrayParser.parse(v, parseBool);
        return parseBool(v);
    },

    encode(v: boolean): string | Buffer {
        return v ? 't' : 'f';
    },

    isType(v: any): boolean {
        return typeof v === 'boolean';
    }

}

function parseBool(v: string): boolean {
    return v === 'TRUE' || v === 't' ||
        v === 'true' || v === 'y' ||
        v === 'yes' || v === 'on' || v === '1';
}
