/**
 * The wire protocol itself: the message codes, the shapes each message
 * carries, and the version numbers the handshake negotiates.
 *
 * These are PostgreSQL's own definitions, named as the documentation
 * names them - nothing here is this client's invention, and a reader
 * comparing it against the protocol pages should find the two line up.
 */
export namespace Protocol {
  /** The protocol major version, which has been 3 since PostgreSQL 7.4. */
  export const VERSION_MAJOR = 3;
  /** The minor version a connection asks for by default. */
  export const VERSION_MINOR = 0;
  /**
   * Minor version 3.2 (PostgreSQL 18+) differs from 3.0 only in that
   * BackendKeyData's secret key - and so CancelRequest's - can be up to
   * 256 bytes instead of always exactly 4. A server that doesn't support
   * 3.2 replies with NegotiateProtocolVersion naming the highest minor
   * version it does support (see `PgSocket.protocolNegotiation`) and the
   * session simply proceeds at that version instead - requesting 3.2 is
   * never a connection-breaking choice, only ever a possible no-op.
   */
  export const VERSION_MINOR_LONG_CANCEL_KEY = 2;

  /** The first byte of each message the server sends. */
  /* https://www.postgresql.org/docs/9.3/protocol-message-formats.html */
  export enum BackendMessageCode {
    Authentication = 0x52, // R
    BackendKeyData = 0x4b, // K
    BindComplete = 0x32, // 2
    CloseComplete = 0x33, // 3
    CommandComplete = 0x43, // C
    CopyData = 0x64, // d
    CopyDone = 0x63, // c
    CopyInResponse = 0x47, // G
    CopyOutResponse = 0x48, // H
    CopyBothResponse = 0x57, // W
    DataRow = 0x44, // D
    EmptyQueryResponse = 0x49, // I
    ErrorResponse = 0x45, // E
    FunctionCallResponse = 0x56, // V
    NegotiateProtocolVersion = 0x76, // v
    NoData = 0x6e, // n
    NoticeResponse = 0x4e, // N
    NotificationResponse = 0x41, // A
    ParameterDescription = 0x74, // t
    ParameterStatus = 0x53, // S
    ParseComplete = 0x31, // 1
    PortalSuspended = 0x73, // s
    ReadyForQuery = 0x5a, // Z
    RowDescription = 0x54, // T
  }

  /** The first byte of each message the client sends. */
  export enum FrontendMessageCode {
    Bind = 0x42, // B
    Close = 0x43, // C
    CopyData = 0x64, // d
    CopyDone = 0x63, // c
    CopyFail = 0x66, // f
    Describe = 0x44, // D
    Execute = 0x45, // E
    Flush = 0x48, // H
    FunctionCall = 0x46, // F
    Parse = 0x50, // P
    PasswordMessage = 0x70, // p
    Query = 0x51, // Q
    Sync = 0x53, // S
    Terminate = 0x58, // X
  }

  /** Which authentication the server asked for, by name rather than by its number. */
  export enum AuthenticationMessageKind {
    KerberosV5 = 'KerberosV5',
    CleartextPassword = 'CleartextPassword',
    MD5Password = 'MD5Password',
    SCMCredential = 'SCMCredential',
    GSS = 'GSS',
    SSPI = 'SSPI',
    GSSContinue = 'GSSContinue',
    SASL = 'SASL',
    SASLContinue = 'SASLContinue',
    SASLFinal = 'SASLFinal',
  }

  /** How a value travels: as the text the server prints, or in its binary form. */
  export enum DataFormat {
    /** The type's own text, as `::text` would render it. */
    text = 0,
    /** The type's binary form - fewer bytes, and no text to parse. */
    binary = 1,
  }

  /** What every Authentication message carries: which kind it is. */
  export interface AuthenticationRequiredMessage {
    /** The authentication the server is asking for. */
    kind: AuthenticationMessageKind;
  }

  /** Kerberos V5 authentication is required - not implemented by this client, nor by any modern server. */
  export interface AuthenticationKerberosV5Message extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.KerberosV5;
  }

  /** The server wants the password as it is, which only a trusted transport should be asked for. */
  export interface AuthenticationCleartextPasswordMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.CleartextPassword;
  }

  /** The server wants the password MD5-hashed with the salt it sent. */
  export interface AuthenticationMD5PasswordMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.MD5Password;
    salt: Buffer;
  }

  /** SCM credential authentication, which only ever applied to some unix sockets. */
  export interface AuthenticationSCMCredentialMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SCMCredential;
  }

  /** GSSAPI authentication is required. */
  export interface AuthenticationGSSMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.GSS;
  }

  /** SSPI authentication is required - the Windows spelling of GSSAPI. */
  export interface AuthenticationSSPIMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SSPI;
  }

  /** One more round of GSSAPI/SSPI data. */
  export interface AuthenticationGSSContinueMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.GSSContinue;
    data: Buffer;
  }

  /** SASL authentication is required; the message names which mechanisms the server offers. */
  export interface AuthenticationSASLMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SASL;
    mechanisms: string[];
  }

  /** The server's half of the SCRAM exchange in progress. */
  export interface AuthenticationSASLContinueMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SASLContinue;
    data: string;
  }

  /** The server's final SCRAM message, which proves it knew the password too. */
  export interface AuthenticationSASLFinalMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SASLFinal;
    data: string;
  }

  /** The process id and secret key a cancel request has to carry, sent once at startup. */
  export interface BackendKeyDataMessage {
    processID: number;
    /**
     * Always 4 bytes before protocol 3.2, up to 256 with it - see
     * `VERSION_MINOR_LONG_CANCEL_KEY`. Not a fixed-width int, unlike
     * before: the field carries whatever bytes the server sent, in
     * whatever order it sent them, to be relayed back to CancelRequest
     * unchanged rather than interpreted as a number.
     */
    secretKey: Buffer;
  }

  /** One statement finished: its tag, and what the tag reports. */
  export interface CommandCompleteMessage {
    command: string;
    oid?: number;
    rowCount?: number;
  }

  /** One chunk of a copy in either direction. */
  export interface CopyDataMessage {
    data: Buffer;
  }

  /** A copy is starting: which format it is in, and per column. */
  export interface CopyResponseMessage {
    overallFormat: DataFormat;
    columnCount: number;
    columnFormats?: DataFormat[];
  }

  /** The DataRow message body, kept for its name; `DataRowMessage` is the shape actually used. */
  export interface DataRow {}

  /** One row, still as the bytes it arrived in - the values are read out of `data` by the column parsers. */
  export interface DataRowMessage {
    columnCount: number;
    data: Buffer;
  }

  /** An error or a notice, with every field the server chose to send. `code` is the SQLSTATE and is the part to branch on. */
  export interface ErrorResponseMessage {
    severity?: string;
    code?: string;
    message?: string;
    detail?: string;
    hint?: string;
    position?: string;
    internalPosition?: string;
    internalQuery?: string;
    where?: string;
    schema?: string;
    table?: string;
    column?: string;
    dataType?: string;
    constraint?: string;
    file?: string;
    line?: string;
    routine?: string;
  }

  /** A `NOTIFY` arriving: which channel, what payload, and which backend sent it. */
  export interface NotificationResponseMessage {
    processId: number;
    channel: string;
    payload: string;
  }

  /** A fast-path function's return value, undecoded - the protocol says nothing about its type. */
  export interface FunctionCallResponseMessage {
    /** `null` when the function returned SQL NULL. */
    result: Buffer | null;
  }

  /** The server does not speak the minor version that was asked for, and names the highest it does. */
  export interface NegotiateProtocolVersionMessage {
    /** Newest minor protocol version the server supports. */
    supportedVersionMinor: number;
    /**
     * Startup packet options this client sent that the server didn't
     * recognize - empty when the only mismatch is the protocol minor
     * version itself.
     */
    unrecognizedOptions: string[];
  }

  /** What the server resolved each parameter of a prepared statement to. */
  export interface ParameterDescriptionMessage {
    parameterCount: number;
    parameterIds: number[];
  }

  /** A session setting the server reports, at startup and whenever it changes. */
  export interface ParameterStatusMessage {
    name: string;
    value: string;
  }

  /** The server is ready for the next statement, and says whether a transaction is open. */
  export interface ReadyForQueryMessage {
    status: string;
  }

  /** One column of a result, as the server describes it. */
  export interface RowDescription {
    fieldName: string;
    tableId: number;
    columnId: number;
    dataTypeId: number;
    fixedSize?: number;
    modifier?: number;
    format: DataFormat;
  }

  /** The columns a statement will return, sent before its rows. */
  export interface RowDescriptionMessage {
    fields: RowDescription[];
  }
}
