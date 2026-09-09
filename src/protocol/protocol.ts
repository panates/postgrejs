export namespace Protocol {
  export const VERSION_MAJOR = 3;
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

  // https://www.postgresql.org/docs/9.3/protocol-message-formats.html
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

  export enum DataFormat {
    text = 0,
    binary = 1,
  }

  export interface AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind;
  }

  export interface AuthenticationKerberosV5Message extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.KerberosV5;
  }

  export interface AuthenticationCleartextPasswordMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.CleartextPassword;
  }

  export interface AuthenticationMD5PasswordMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.MD5Password;
    salt: Buffer;
  }

  export interface AuthenticationSCMCredentialMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SCMCredential;
  }

  export interface AuthenticationGSSMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.GSS;
  }

  export interface AuthenticationSSPIMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SSPI;
  }

  export interface AuthenticationGSSContinueMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.GSSContinue;
    data: Buffer;
  }

  export interface AuthenticationSASLMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SASL;
    mechanisms: string[];
  }

  export interface AuthenticationSASLContinueMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SASLContinue;
    data: string;
  }

  export interface AuthenticationSASLFinalMessage extends AuthenticationRequiredMessage {
    kind: AuthenticationMessageKind.SASLFinal;
    data: string;
  }

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

  export interface CommandCompleteMessage {
    command: string;
    oid?: number;
    rowCount?: number;
  }

  export interface CopyDataMessage {
    data: Buffer;
  }

  export interface CopyResponseMessage {
    overallFormat: DataFormat;
    columnCount: number;
    columnFormats?: DataFormat[];
  }

  export interface DataRow {}

  export interface DataRowMessage {
    columnCount: number;
    data: Buffer;
  }

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

  export interface NotificationResponseMessage {
    processId: number;
    channel: string;
    payload: string;
  }

  export interface FunctionCallResponseMessage {
    /** `null` when the function returned SQL NULL. */
    result: Buffer | null;
  }

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

  export interface ParameterDescriptionMessage {
    parameterCount: number;
    parameterIds: number[];
  }

  export interface ParameterStatusMessage {
    name: string;
    value: string;
  }

  export interface ReadyForQueryMessage {
    status: string;
  }

  export interface RowDescription {
    fieldName: string;
    tableId: number;
    columnId: number;
    dataTypeId: number;
    fixedSize?: number;
    modifier?: number;
    format: DataFormat;
  }

  export interface RowDescriptionMessage {
    fields: RowDescription[];
  }
}
