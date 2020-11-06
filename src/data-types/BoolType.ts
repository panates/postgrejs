import {DataType} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';

export const BoolType: DataType = {

    parseBinary(v: Buffer): boolean {
        return !!v.readUInt8();
    },

    encodeBinary(buf: SmartBuffer, v: boolean): void {
        buf.writeInt8(v ? 1 : 0);
    },

    parseText(v: string): boolean {
        return v === 'TRUE' || v === 't' ||
            v === 'true' || v === 'y' ||
            v === 'yes' || v === 'on' || v === '1';
    },

    isType(v: any): boolean {
        return typeof v === 'boolean';
    }

}
