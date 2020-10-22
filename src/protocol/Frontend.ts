import {BufferIO} from './BufferIO';
import {Protocol} from './protocol';
import {SASL} from './sasl';
import {Maybe} from '../definitions';
import DataFormat = Protocol.DataFormat;

const StaticFlushBuffer = Buffer.from([Protocol.FrontendMessageCode.Flush, 0x00, 0x00, 0x00, 0x04]);
const StaticTerminateBuffer = Buffer.from([Protocol.FrontendMessageCode.Terminate, 0x00, 0x00, 0x00, 0x04]);
const StaticSyncBuffer = Buffer.from([Protocol.FrontendMessageCode.Sync, 0x00, 0x00, 0x00, 0x04]);

export class Frontend {
    private _io = new BufferIO(Buffer.allocUnsafe(4096));

    reset(): void {
        this._io.reset();
    }

    getSSLRequestMessage(): Buffer {
        return this._io.reset()
            .writeUInt32BE(8) // Length of message contents in bytes, including self.
            .writeUInt16BE(1234)
            .writeUInt16BE(5679)
            .flush();
    }

    getStartupMessage(opts: {
        user: string;
        database: string;
        [index: string]: string;
    }): Buffer {
        const io = this._io.reset()
            .inc(4) // Preserve length
            .writeUInt16BE(Protocol.VERSION_MAJOR)
            .writeUInt16BE(Protocol.VERSION_MINOR);
        for (const [k, v] of Object.entries(opts)) {
            if (k !== 'client_encoding')
                io.writeCString(k, 'utf8')
                    .writeCString(v, 'utf8');
        }
        io.writeCString('client_encoding', 'utf8')
            .writeCString('UTF8', 'utf8')
            .writeUInt8(0);

        return flush(io);
    }

    getPasswordMessage(password: string): Buffer {
        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeCString(password, 'utf8');
        return flush(io, Protocol.FrontendMessageCode.PasswordMessage);
    }

    getSASLMessage(sasl: SASL.Session): Buffer {
        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeCString(sasl.mechanism, 'utf8')
            .writeLString(sasl.clientFirstMessage)
        return flush(io, Protocol.FrontendMessageCode.PasswordMessage);
    }

    getSASLFinalMessage(session: SASL.Session): Buffer {
        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeString(session.clientFinalMessage)
        return flush(io, Protocol.FrontendMessageCode.PasswordMessage);
    }

    getParseMessage(sql: string, name?: string, paramTypes?: number[]): Buffer {
        if (name && name.length > 63)
            throw new Error('Query name length must be lower than 63');
        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeCString(name || '', 'utf8')
            .writeCString(sql, 'utf8')
            .writeUInt16BE(paramTypes ? paramTypes.length : 0);
        if (paramTypes) {
            for (const t of paramTypes) {
                io.writeUInt32BE(t);
            }
        }
        return flush(io, Protocol.FrontendMessageCode.Parse);
    }

    getBindMessage(name?: string, portal?: string,
                   parameters?: {
                       value: string | Buffer,
                       resultFormat?: Protocol.DataFormat
                   }[], binaryResult?: boolean): Buffer {
        if (portal && portal.length > 63)
            throw new Error('Portal name length must be lower than 63');
        if (name && name.length > 63)
            throw new Error('Query name length must be lower than 63');

        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeCString(portal || '', 'utf8')
            .writeCString(name || '', 'utf8');
        if (parameters && parameters.length) {
            // Write data formats
            const hasBinary = parameters.find(Buffer.isBuffer);
            if (hasBinary) {
                io.writeUInt16BE(parameters.length);
                for (const p of parameters) {
                    io.writeUInt16BE(Buffer.isBuffer(p.value) ?
                        Protocol.DataFormat.binary : Protocol.DataFormat.text);
                }
            } else
                io.writeUInt16BE(0);

            // Write parameter values
            io.writeUInt16BE(parameters.length);
            for (const v of parameters) {
                if (v == null)
                    io.writeUInt32BE(-1);
                if (Buffer.isBuffer(v)) {
                    io.writeUInt32BE(v.length);
                    io.writeBuffer(v);
                } else
                    io.writeLString('' + v, 'utf8');
            }

        } else {
            io.writeUInt16BE(0);
            io.writeUInt16BE(0);
        }

        if (binaryResult) {
            io.writeUInt16BE(1);
            io.writeUInt16BE(1);
        } else io.writeUInt16BE(0);

        return flush(io, Protocol.FrontendMessageCode.Bind);
    }

    getDescribeMessage(type: 'P' | 'S', name?: string): Buffer {
        if (name && name.length > 63)
            throw new Error(type === 'P' ? 'Portal' : 'Statement' +
                'name length must be lower than 63');
        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeUInt8(type.charCodeAt(0))
            .writeCString(name || '', 'utf8')
        return flush(io, Protocol.FrontendMessageCode.Describe);
    }

    getExecuteMessage(portal?: string, maxRows?: number): Buffer {
        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeCString(portal || '', 'utf8')
            .writeUInt32BE(maxRows || 0)
        return flush(io, Protocol.FrontendMessageCode.Execute);
    }

    getCloseMessage(type: 'P' | 'S', name?: string): Buffer {
        if (name && name.length > 63)
            throw new Error(type === 'P' ? 'Portal' : 'Statement' +
                'name length must be lower than 63');
        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeUInt8(type.charCodeAt(0))
            .writeCString(name || '', 'utf8')
        return flush(io, Protocol.FrontendMessageCode.Close);
    }

    getQueryMessage(sql: string): Buffer {
        const io = this._io.reset()
            .inc(5) // Preserve header
            .writeCString(sql || '', 'utf8')
        return flush(io, Protocol.FrontendMessageCode.Query);
    }

    getFlushMessage(): Buffer {
        return StaticFlushBuffer;
    }

    getTerminateMessage(): Buffer {
        return StaticTerminateBuffer;
    }

    getSyncMessage(): Buffer {
        return StaticSyncBuffer;
    }

}

function flush(io: BufferIO, code?: Protocol.FrontendMessageCode): Buffer {
    if (code) {
        io.buffer.writeUInt8(code);
        io.buffer.writeUInt32BE(io.offset - 1, 1);
    } else
        io.buffer.writeUInt32BE(io.offset, 0);
    return io.flush();
}
