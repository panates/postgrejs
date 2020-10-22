import {Maybe} from '../definitions';

export class BufferIO {

    growSize: number;
    initialSize: number;
    offset = 0;

    constructor(public buffer: Buffer, growSize?: number) {
        this.initialSize = buffer.length;
        this.growSize = growSize || this.initialSize;
    }

    get remaining(): number {
        return this.buffer.length - this.offset;
    }

    ensureCapacity(len: number): this {
        let newSize = this.offset + len;
        if (this.buffer.length < newSize) {
            const growSize = this.growSize + (this.growSize >> 1);
            newSize = Math.ceil(newSize / growSize) * growSize;
            const newBuffer = Buffer.allocUnsafe(newSize);
            this.buffer.copy(newBuffer);
            this.buffer = newBuffer;
        }
        return this;
    }


    readUInt8(): number {
        this._checkReadable(1);
        const v = this.buffer.readUInt8(this.offset);
        this.offset++;
        return v;
    }

    readUInt16BE(): number {
        this._checkReadable(2);
        const v = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return v;
    }

    readInt16BE(): number {
        this._checkReadable(2);
        const v = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return v;
    }

    readUInt32BE(): number {
        this._checkReadable(4);
        const v = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return v;
    }

    readInt32BE(): number {
        this._checkReadable(4);
        const v = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return v;
    }

    readCString(encoding?: BufferEncoding): string {
        const idx = this.buffer.indexOf(0, this.offset);
        const v = this.buffer.toString(encoding, this.offset, idx);
        this.offset = idx + 1;
        return v;
    }

    readLString(len: number, encoding?: BufferEncoding): string | null {
        if (len < 0)
            return null;
        const v = this.buffer.toString(encoding, this.offset, this.offset + len);
        this.offset += len;
        return v;
    }

    readBuffer(len?: number): Buffer {
        const end = len ? this.offset + len : Buffer.length;
        const buf = this.buffer.slice(this.offset, end);
        this.offset = end;
        return buf;
    }

    reset(buffer?: Buffer): this {
        if (this.buffer.length !== this.initialSize)
            this.buffer = buffer || Buffer.allocUnsafe(this.initialSize);
        this.offset = 0;
        return this;
    }

    inc(n: number): this {
        this.offset += n;
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

    writeUInt8(n: number): this {
        this.ensureCapacity(1);
        this.buffer[this.offset++] = n;
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

    writeInt32BE(n: number): this {
        this.ensureCapacity(4);
        this.buffer.writeInt32BE(n, this.offset);
        this.offset += 4;
        return this;
    }

    writeBuffer(buffer: Buffer): this {
        this.ensureCapacity(buffer.length);
        buffer.copy(this.buffer, this.offset, 0, buffer.length - 1);
        return this;
    }


    flush(): Buffer {
        return this.buffer.slice(0, this.offset);
    }

    private _checkReadable(size: number): void {
        if (this.offset + size - 1 >= this.buffer.length)
            throw new Error('Eof in buffer detected');
    }

}
