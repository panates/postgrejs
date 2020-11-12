import {BufferReader} from './BufferReader';
import {writeBigUInt64BE} from '../helpers/bigint-methods';

export class SmartBuffer extends BufferReader {

    private _length = 0;
    readonly initialSize: number;
    readonly maxSize: number;

    constructor(initialSize: number, maxSize?: number) {
        // @ts-ignore
        super(Buffer.allocUnsafe(parseInt(initialSize, 10) || 4096))
        this.initialSize = this.buffer.length;
        this.maxSize = maxSize || 1024 * 1024 * 2; // 2 MB
        this._length = 0;
    }

    get capacity(): number {
        return this.buffer.length;
    }

    get length(): number {
        return this._length;
    }

    ensureCapacity(len: number): this {
        let endOffset = this.offset + len;
        if (this.capacity < endOffset) {
            if (endOffset > this.maxSize)
                throw new Error('Buffer limit exceeded.');
            const growSize = this.initialSize + (this.initialSize >> 1); //  1.5 initialSize
            const newSize = Math.ceil(endOffset / growSize) * growSize;
            const newBuffer = Buffer.allocUnsafe(newSize);
            this.buffer.copy(newBuffer);
            this.buffer = newBuffer;
        }
        this._length = Math.max(this.length, endOffset);
        return this;
    }

    fill(value: number = 0, len: number = 1): this {
        this.ensureCapacity(len);
        this.buffer.fill(value, this.offset, this.offset + len);
        this.offset += len;
        return this;
    }

    flush(): Buffer {
        return this.buffer.slice(0, this.length);
    }

    reset(): this {
        this.offset = 0;
        this._length = 0;
        return this;
    }

    // todo
    shrink(): this {
        if (this.buffer.length !== this.initialSize)
            this.buffer = Buffer.allocUnsafe(this.initialSize);
        return this;
    }

    writeCString(str: string, encoding?: BufferEncoding): this {
        const len = str ? Buffer.byteLength(str, encoding) : 0;
        this.ensureCapacity(len + 1);
        if (str) {
            this.buffer.write(str, this.offset, encoding);
            this.offset += len;
        }
        this.writeUInt8(0);
        return this;
    }

    writeLString(str?: string, encoding?: BufferEncoding): this {
        const len = str ? Buffer.byteLength(str, encoding) : 0;
        this.ensureCapacity(len + 4);
        this.writeInt32BE(str == null ? -1 : len);
        if (str) {
            if (encoding)
                this.offset += this.buffer.write(str, this.offset, encoding);
            else this.offset += this.buffer.write(str, this.offset);
        }
        return this;
    }

    writeString(str: string, encoding?: BufferEncoding): this {
        if (str) {
            const len = Buffer.byteLength(str, encoding);
            this.ensureCapacity(len);
            this.offset += this.buffer.write(str, this.offset, encoding);
        }
        return this;
    }

    writeInt8(n: number): this {
        this.ensureCapacity(1);
        this.buffer.writeInt8(n, this.offset);
        this.offset++;
        return this;
    }

    writeUInt8(n: number): this {
        this.ensureCapacity(1);
        this.buffer.writeUInt8(n, this.offset);
        this.offset++;
        return this;
    }

    writeUInt16BE(n: number): this {
        this.ensureCapacity(2);
        this.buffer.writeUInt16BE(n, this.offset);
        this.offset += 2;
        return this;
    }

    writeUInt32BE(n: number): this {
        this.ensureCapacity(4);
        this.buffer.writeUInt32BE(n, this.offset);
        this.offset += 4;
        return this;
    }

    writeInt16BE(n: number): this {
        this.ensureCapacity(2);
        this.buffer.writeInt16BE(n, this.offset);
        this.offset += 2;
        return this;
    }

    writeInt32BE(n: number): this {
        this.ensureCapacity(4);
        this.buffer.writeInt32BE(n, this.offset);
        this.offset += 4;
        return this;
    }

    writeBigInt64BE(n: bigint | number): this {
        n = typeof n === 'bigint' ? n : BigInt(n);
        this.ensureCapacity(8);
        if (typeof this.buffer.writeBigInt64BE === 'function')
            this.buffer.writeBigInt64BE(n, this.offset);
        else
            writeBigUInt64BE(this.buffer, n, this.offset);
        this.offset += 8;
        return this;
    }

    writeFloatBE(n: number): this {
        this.ensureCapacity(4);
        this.buffer.writeFloatBE(n, this.offset);
        this.offset += 4;
        return this;
    }

    writeDoubleBE(n: number): this {
        this.ensureCapacity(8);
        this.buffer.writeDoubleBE(n, this.offset);
        this.offset += 8;
        return this;
    }

    writeBuffer(buffer: Buffer): this {
        this.ensureCapacity(buffer.length);
        buffer.copy(this.buffer, this.offset, 0, buffer.length);
        this.offset += buffer.length;
        return this;
    }

}
