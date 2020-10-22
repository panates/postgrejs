import parseBytea from 'postgres-bytea';
import arrayParser from 'postgres-array';
import {DataType} from '../definitions';

export const ByteaType: DataType = {

    parse(v: string, isArray?: boolean): Buffer | Buffer[] {
        if (isArray)
            return arrayParser.parse(v, parseBytea);
        return parseBytea(v);
    },

    decode(v: Buffer): Buffer {
        return v;
    },

    encode(v: Buffer): Buffer {
        return v;
    },

    isType(v: any): boolean {
        return v instanceof Buffer;
    }

}
