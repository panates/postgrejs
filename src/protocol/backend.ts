import { BufferReader } from './buffer-reader.js';
import { Protocol } from './protocol.js';

// 1 byte message type, 4 byte frame length
const HEADER_LENGTH = 5;

const ErrorFieldTypes: Record<string, string> = {
  M: 'message',
  S: 'severity',
  V: 'severity',
  C: 'code',
  D: 'detail',
  H: 'hint',
  P: 'position',
  p: 'internalPosition',
  q: 'internalQuery',
  W: 'where',
  s: 'schema',
  t: 'table',
  c: 'column',
  d: 'dataType',
  n: 'constraint',
  F: 'file',
  L: 'line',
  R: 'routine',
};

declare type ParseCallback = (
  code: Protocol.BackendMessageCode,
  data?: any,
) => void;

export class Backend {
  // Header (1-byte code + 4-byte length) reassembly state. A message's
  // header can itself arrive split across socket reads (rare - only 5
  // bytes), so it gets a small fixed reusable scratch buffer rather than
  // going through the same body-reassembly path below.
  private readonly _headerBuf = Buffer.allocUnsafe(HEADER_LENGTH);
  private _headerFilled = 0;
  private _code?: Protocol.BackendMessageCode;
  private _len = 0;

  // Body reassembly state. Once the header is complete, the wire's own
  // length prefix already tells us the exact body size, so this allocates
  // ONE buffer sized to fit it and copies each incoming chunk directly into
  // place at the right offset - unlike the previous approach (Buffer.concat
  // of the whole accumulated-so-far buffer on every incoming chunk), which
  // reallocated and fully re-copied everything received for a message so
  // far on every single socket 'data' event: for a message split across N
  // chunks that's O(N^2) bytes copied, not O(size) - measured live for a
  // 1MB bytea value arriving across ~16 chunks as ~10x the actual payload
  // copied, and a proportional amount of short-lived Buffer garbage.
  private _bodyBuf?: Buffer;
  private _bodyFilled = 0;

  reset() {
    this._headerFilled = 0;
    this._code = undefined;
    this._bodyBuf = undefined;
    this._bodyFilled = 0;
  }

  parse(data: Buffer, callback: ParseCallback) {
    const dataLen = data.length;
    let pos = 0;
    while (pos < dataLen) {
      // Fast path: nothing carried over from a previous call, and this
      // chunk alone already holds a complete header + body - view directly
      // into `data` with zero allocation/copy, instead of the reassembly
      // path below (which always allocates, since it has to - a message
      // split across calls has no single contiguous buffer to view into).
      // This is the common case for small messages that arrive whole in
      // one socket read (e.g. the handshake's Authentication/
      // ParameterStatus/BackendKeyData/ReadyForQuery messages) - without
      // it, every one of those would pay for an allocation it doesn't need
      // (measured live: 18 small allocations per connect/close cycle,
      // ~1-34 bytes each, none of which were needed before this class
      // stopped taking zero-copy subarray views for the single-chunk case).
      if (
        this._headerFilled === 0 &&
        !this._bodyBuf &&
        dataLen - pos >= HEADER_LENGTH
      ) {
        const code = data.readUInt8(pos) as Protocol.BackendMessageCode;
        const len = data.readUInt32BE(pos + 1);
        const bodyStart = pos + HEADER_LENGTH;
        const bodyEnd = bodyStart + (len - 4);
        if (bodyEnd <= dataLen) {
          const io = new BufferReader(data.subarray(bodyStart, bodyEnd));
          const parser = MessageParsers[code];
          const v = parser && parser(io, code, len);
          callback(code, v);
          pos = bodyEnd;
          continue;
        }
        // Body doesn't fully fit in this chunk - fall through to the
        // reassembly path below, which re-reads the same header bytes (no
        // state was mutated above) and carries the partial body forward.
      }

      if (!this._bodyBuf) {
        const need = HEADER_LENGTH - this._headerFilled;
        const take = Math.min(need, dataLen - pos);
        data.copy(this._headerBuf, this._headerFilled, pos, pos + take);
        this._headerFilled += take;
        pos += take;
        if (this._headerFilled < HEADER_LENGTH) return; // header not complete yet

        this._code = this._headerBuf.readUInt8(
          0,
        ) as Protocol.BackendMessageCode;
        this._len = this._headerBuf.readUInt32BE(1);
        this._bodyBuf = Buffer.allocUnsafe(this._len - 4);
        this._bodyFilled = 0;
      }

      const need = this._bodyBuf.length - this._bodyFilled;
      const take = Math.min(need, dataLen - pos);
      if (take > 0) {
        data.copy(this._bodyBuf, this._bodyFilled, pos, pos + take);
        this._bodyFilled += take;
        pos += take;
      }
      if (this._bodyFilled < this._bodyBuf.length) return; // body not complete yet

      const io = new BufferReader(this._bodyBuf);
      const parser = MessageParsers[this._code!];
      const v = parser && parser(io, this._code!, this._len);
      callback(this._code!, v);

      // Reset reassembly state for the next message.
      this._headerFilled = 0;
      this._code = undefined;
      this._bodyBuf = undefined;
      this._bodyFilled = 0;
    }
  }
}

const MessageParsers: Record<
  string,
  (io: BufferReader, code: Protocol.BackendMessageCode, len: number) => any
> = {
  [Protocol.BackendMessageCode.Authentication]: parseAuthentication,
  [Protocol.BackendMessageCode.BackendKeyData]: parseBackendKeyData,
  [Protocol.BackendMessageCode.CommandComplete]: parseCommandComplete,
  [Protocol.BackendMessageCode.CopyData]: parseCopyData,
  [Protocol.BackendMessageCode.CopyInResponse]: parseCopyResponse,
  [Protocol.BackendMessageCode.CopyOutResponse]: parseCopyResponse,
  [Protocol.BackendMessageCode.CopyBothResponse]: parseCopyResponse,
  [Protocol.BackendMessageCode.DataRow]: parseDataRow,
  [Protocol.BackendMessageCode.ErrorResponse]: parseErrorResponse,
  [Protocol.BackendMessageCode.NoticeResponse]: parseErrorResponse,
  [Protocol.BackendMessageCode.NotificationResponse]: parseNotificationResponse,
  [Protocol.BackendMessageCode.FunctionCallResponse]: parseFunctionCallResponse,
  [Protocol.BackendMessageCode.NegotiateProtocolVersion]:
    parseNegotiateProtocolVersion,
  [Protocol.BackendMessageCode.ParameterDescription]: parseParameterDescription,
  [Protocol.BackendMessageCode.ParameterStatus]: parseParameterStatus,
  [Protocol.BackendMessageCode.ReadyForQuery]: parseReadyForQuery,
  [Protocol.BackendMessageCode.RowDescription]: parseRowDescription,
};

function parseAuthentication(
  io: BufferReader,
  code: Protocol.BackendMessageCode,
  len: number,
): any {
  const kind = io.readUInt32BE();
  switch (kind) {
    case 0:
      return; // AuthenticationOk
    case 2:
      return {
        kind: 'KerberosV5',
      } as Protocol.AuthenticationKerberosV5Message;
    case 3:
      return {
        kind: 'CleartextPassword',
      } as Protocol.AuthenticationCleartextPasswordMessage;
    case 5:
      return {
        kind: 'MD5Password',
        salt: io.readBuffer(len - 8),
      } as Protocol.AuthenticationMD5PasswordMessage;
    case 6:
      return {
        kind: 'SCMCredential',
      } as Protocol.AuthenticationSCMCredentialMessage;
    case 7:
      return {
        kind: 'GSS',
      } as Protocol.AuthenticationGSSMessage;
    case 9:
      return {
        kind: 'SSPI',
      } as Protocol.AuthenticationSSPIMessage;
    case 8:
      return {
        kind: 'GSSContinue',
        data: io.readBuffer(len - 8),
      } as Protocol.AuthenticationGSSContinueMessage;
    case 10: {
      const out = {
        kind: 'SASL',
        mechanisms: [],
      } as Protocol.AuthenticationSASLMessage;
      let mechanism;
      while ((mechanism = io.readCString())) {
        out.mechanisms.push(mechanism);
      }
      return out;
    }
    case 11:
      return {
        kind: 'SASLContinue',
        data: io.readLString(len - 8, 'utf8'),
      } as Protocol.AuthenticationSASLContinueMessage;
    case 12:
      return {
        kind: 'SASLFinal',
        data: io.readLString(len - 8, 'utf8'),
      } as Protocol.AuthenticationSASLFinalMessage;
    default:
      throw new Error(`Unknown authentication kind (${kind})`);
  }
}

function parseBackendKeyData(io: BufferReader): Protocol.BackendKeyDataMessage {
  return {
    processID: io.readUInt32BE(),
    secretKey: io.readUInt32BE(),
  } as Protocol.BackendKeyDataMessage;
}

function parseCommandComplete(
  io: BufferReader,
): Protocol.CommandCompleteMessage {
  return {
    command: io.readCString('utf8'),
  } as Protocol.CommandCompleteMessage;
}

function parseCopyData(
  io: BufferReader,
  code: Protocol.BackendMessageCode,
  len: number,
): Protocol.CopyDataMessage {
  return {
    data: io.readBuffer(len - 4),
  } as Protocol.CopyDataMessage;
}

function parseCopyResponse(io: BufferReader): Protocol.CopyResponseMessage {
  const out = {
    overallFormat:
      io.readUInt8() === 0
        ? Protocol.DataFormat.text
        : Protocol.DataFormat.binary,
    columnCount: io.readUInt16BE(),
  } as Protocol.CopyResponseMessage;

  if (out.columnCount) {
    out.columnFormats = [];
    const l = out.columnCount;
    let i: number;
    for (i = 0; i < l; i++) {
      out.columnFormats.push(
        io.readUInt16BE() === 0
          ? Protocol.DataFormat.text
          : Protocol.DataFormat.binary,
      );
    }
  }
  return out;
}

function parseDataRow(io: BufferReader): Protocol.DataRowMessage {
  const out = {
    columnCount: io.readUInt16BE(),
  } as Protocol.DataRowMessage;

  if (out.columnCount) {
    out.columns = [];
    for (let i = 0; i < out.columnCount; i++) {
      // The length of the column value, in bytes (this count does not include itself).
      // Can be zero. As a special case, -1 indicates a NULL column value.
      // No value bytes follow in the NULL case.
      const l = io.readInt32BE();
      if (l < 0) out.columns.push(null);
      else out.columns.push(io.readBuffer(l));
    }
  }
  return out;
}

function parseErrorResponse(io: BufferReader): Protocol.ErrorResponseMessage {
  const out: Record<string, string> = {};

  let fieldType;
  while ((fieldType = io.readLString(1)) !== '\0') {
    const value = io.readCString('utf8');
    const key = ErrorFieldTypes[fieldType!];
    if (key) out[key] = value;
  }
  return out as Protocol.ErrorResponseMessage;
}

function parseNotificationResponse(
  io: BufferReader,
): Protocol.NotificationResponseMessage {
  return {
    processId: io.readUInt32BE(),
    channel: io.readCString(),
    payload: io.readCString(),
  };
}

function parseFunctionCallResponse(
  io: BufferReader,
  code: Protocol.BackendMessageCode,
  len: number,
): Protocol.FunctionCallResponseMessage {
  return {
    result: io.readBuffer(len - 4),
  } as Protocol.FunctionCallResponseMessage;
}

function parseNegotiateProtocolVersion(
  io: BufferReader,
): Protocol.NegotiateProtocolVersionMessage {
  return {
    supportedVersionMinor: io.readUInt32BE(),
    numberOfNotSupportedVersions: io.readUInt32BE(),
    option: io.readCString('utf8'),
  } as Protocol.NegotiateProtocolVersionMessage;
}

function parseParameterDescription(
  io: BufferReader,
): Protocol.ParameterDescriptionMessage {
  const out = {
    // Int16 per the PostgreSQL wire protocol (ParameterDescription's
    // parameter count field, unlike RowDescription's Int16 field count or
    // this same message's own per-parameter Int32 OIDs below) - reading
    // this as UInt32BE shifted every subsequent read 2 bytes into the
    // wrong place, eventually running past the buffer ("Eof in buffer
    // detected"). Apparently never exercised before: postgrejs only ever
    // Describe()'d already-bound portals (type 'P'), whose response never
    // includes a ParameterDescription - this path (Describe(type:'S'),
    // used by the new PreparedStatement.prepare() fast path) is its first
    // real caller.
    parameterCount: io.readUInt16BE(),
    parameterIds: [],
  } as Protocol.ParameterDescriptionMessage;

  const l = out.parameterCount;
  let i: number;
  for (i = 0; i < l; i++) {
    out.parameterIds.push(io.readUInt32BE());
  }

  return out;
}

function parseParameterStatus(
  io: BufferReader,
): Protocol.ParameterStatusMessage {
  return {
    name: io.readCString('utf8'),
    value: io.readCString('utf8'),
  } as Protocol.ParameterStatusMessage;
}

function parseReadyForQuery(io: BufferReader): Protocol.ReadyForQueryMessage {
  return {
    status: io.readLString(1),
  } as Protocol.ReadyForQueryMessage;
}

function parseRowDescription(io: BufferReader): Protocol.RowDescriptionMessage {
  const fieldCount = io.readUInt16BE();
  const out: Protocol.RowDescriptionMessage = {
    fields: [],
  };

  for (let i = 0; i < fieldCount; i++) {
    const field: Protocol.RowDescription = {
      fieldName: io.readCString('utf8'),
      tableId: io.readInt32BE(),
      columnId: io.readInt16BE(),
      dataTypeId: io.readInt32BE(),
      fixedSize: io.readInt16BE(),
      modifier: io.readInt32BE(),
      format:
        io.readInt16BE() === 0
          ? Protocol.DataFormat.text
          : Protocol.DataFormat.binary,
    };
    out.fields.push(field);
  }

  return out;
}
