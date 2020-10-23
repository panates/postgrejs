import tls from "tls";
import {Cursor} from './Cursor';

export type Maybe<T> = T | undefined;
export type Nullable<T> = T | null;

export const DataTypeOIDs = {
    Bool: 16,
    Bytea: 17,
    Char: 18,
    Name: 19,
    Int8: 20,
    Int2: 21,
    Int4: 23,
    Regproc: 24,
    Text: 25,
    Oid: 26,
    Tid: 27,
    Xid: 28,
    Cid: 29,
    PgDdlCommand: 32,
    Json: 114,
    Xml: 142,
    PgNodeTree: 194,
    ArrayJson: 199,
    Smgr: 210,
    IndexAmHandler: 325,
    Point: 600,
    Lseg: 601,
    Path: 602,
    Box: 603,
    Polygon: 604,
    Line: 628,
    Cidr: 650,
    Float4: 700,
    Float8: 701,
    Abstime: 702,
    Reltime: 703,
    Tinterval: 704,
    Unknown: 705,
    Circle: 718,
    Macaddr8: 774,
    Money: 790,
    Macaddr: 829,
    Inet: 869,
    Aclitem: 1033,
    Bpchar: 1042,
    Varchar: 1043,
    Date: 1082,
    Time: 1083,
    Timestamp: 1114,
    Timestamptz: 1184,
    Interval: 1186,
    Timetz: 1266,
    Bit: 1560,
    Varbit: 1562,
    Numeric: 1700,
    Refcursor: 1790,
    Regprocedure: 2202,
    Regoper: 2203,
    Regoperator: 2204,
    Regclass: 2205,
    Regtype: 2206,
    Record: 2249,
    Cstring: 2275,
    Any: 2276,
    Anyarray: 2277,
    Void: 2278,
    Trigger: 2279,
    LanguageHandler: 2280,
    Internal: 2281,
    Opaque: 2282,
    AnyElement: 2283,
    AnyNonArray: 2776,
    Uuid: 2950,
    TxidSnapshot: 2970,
    FdwHandler: 3115,
    PgLsn: 3220,
    TsmHandler: 3310,
    PgNdistinct: 3361,
    PgDependencies: 3402,
    Anyenum: 3500,
    Tsvector: 3614,
    Tsquery: 3615,
    GtsVector: 3642,
    Regconfig: 3734,
    Regdictionary: 3769,
    Jsonb: 3802,
    Anyrange: 3831,
    EventTrigger: 3838,
    Regnamespace: 4089,
    Regrole: 4096,

    ArrayXml: 143,
    ArrayCircle: 719,
    ArrayBool: 1000,
    ArrayBytea: 1001,
    ArrayChar: 1002,
    ArrayName: 1003,
    ArrayInt2: 1005,
    ArrayInt2Vector: 1006,
    ArrayInt4: 1007,
    ArrayRegprocedure: 1008,
    ArrayText: 1009,
    ArrayBpchar: 1014,
    ArrayVarchar: 1015,
    ArrayInt8: 1016,
    ArrayPoint: 1017,
    ArrayLseg: 1018,
    ArrayBox: 1020,
    ArrayFloat4: 1021,
    ArrayFloat8: 1022,
    ArrayOid: 1028,
    ArrayTimestamp: 1115,
    ArrayDate: 1182,
    ArrayTimestamptz: 1185,
    ArrayUuid: 2951,
    ArrayJsonb: 3807,
}

export interface ConnectionConfiguration {
    host?: string | null;
    port?: number;
    user?: string | null;
    password?: string | (() => string | Promise<string>) | null;
    database?: string | null;
    schema?: string | null;
    applicationName?: string | null;
    fallbackApplicationName?: string | null;
    ssl?: tls.ConnectionOptions;
    /**
     * Connect timeout in milliseconds
     */
    connectTimeoutMs?: number;
    keepAlive?: boolean;
    keepAliveInitialDelayMillis?: number;
}

export enum ConnectionState {
    CLOSED = 0,
    CONNECTING = 1,
    AUTHORIZING = 3,
    READY = 2,
    CLOSING = 10,
}

export enum StatementState {
    IDLE = 0,
    PREPARING = 1,
    EXECUTING = 1
}

export interface ScriptExecuteOptions {
    objectRows?: boolean;
}

export interface CommandResult {
    command?: string;
    fields?: any[];
    rows?: any[];
    executeTime?: number;
    rowsAffected?: number;
}

export interface ScriptResult {
    results: CommandResult[];
    totalCommands: number;
    totalTime: number;
}

export interface QueryOptions {
    bindParams?: BindParam[];
    fetchCount?: number;
    objectRows?: boolean;
    cursor?: boolean;
}

export interface BindParam {
    oid?: number;
    value: any;
}

export interface QueryResult extends CommandResult {
    cursor?: Cursor;
    prepareTime?: number;
    fetchTime?: number;
    totalTime?: number;
}

export interface DataType {

    isType(v: any): boolean;

    decode?: (buf: Buffer, isArray?: boolean) => any;

    encode(v: any): string | Buffer;

    parse(v: string, isArray?: boolean): any;
}

export interface Point {
    x: number,
    y: number
}

export interface Circle {
    x: number,
    y: number,
    r: number
}

export interface FiniteLine {
    x1: number,
    y1: number,
    x2: number,
    y2: number,
}
