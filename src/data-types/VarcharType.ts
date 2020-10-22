import arrayParser from 'postgres-array';
import {DataType} from '../definitions';


export const VarcharType: DataType = {

    parse(v: string, isArray?: boolean): string | string[] {
        if (isArray)
            return arrayParser.parse(v);
        return v;
    },

    decode(v: Buffer): string {
        return v.toString('utf8');
    },

    encode(v: string): string {
        return v;
    },

    isType(v: any): boolean {
        return typeof v === 'string';
    }

}
