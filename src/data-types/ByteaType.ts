import decodeBytea from 'postgres-bytea';
import {DataType} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';

export const ByteaType: DataType = {

    parseBinary(v: Buffer): Buffer {
        return v;
    },

    encodeBinary(buf: SmartBuffer, v: Buffer): void {
        buf.writeBuffer(v);
    },

    parseText: decodeBytea,

    isType(v: any): boolean {
        return v instanceof Buffer;
    }

}
