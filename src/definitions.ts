import tls from "tls";
import type {Cursor} from './Cursor';
import type {SmartBuffer} from './protocol/SmartBuffer';
import {Protocol} from './protocol/protocol';
import type {PoolOptions} from 'lightning-pool';
import {DataTypeMap} from './DataTypeMap';
import {BindParam} from './BindParam';

import DataFormat = Protocol.DataFormat;

export type OID = number;
export type Maybe<T> = T | undefined;
export type Nullable<T> = T | null;
export {DataFormat};
export type Row = any;

export const DEFAULT_COLUMN_FORMAT = DataFormat.binary;

export interface DatabaseConnectionParams {
    host?: string;
    port?: number;
    user?: string;
    password?: string | (() => string | Promise<string>);
    database?: string;
    applicationName?: string;
    ssl?: tls.ConnectionOptions;
    timezone?: string;
    searchPath?: string;
    connectTimeoutMs?: number;
    autoCommit?: boolean;
}

export interface SocketOptions {
    keepAlive?: boolean;
}

export type ConnectionConfiguration = DatabaseConnectionParams & SocketOptions;

export interface PoolConfiguration extends ConnectionConfiguration, PoolOptions {
}

export enum ConnectionState {
    CLOSED = 0,
    CONNECTING = 1,
    AUTHORIZING = 3,
    READY = 2,
    CLOSING = 10,
}

export interface DataMappingOptions {
    /**
     * If true UTC time will be used for date decoding, else system time offset will be used
     * @default false
     */
    utcDates?: boolean;
}

export interface ScriptExecuteOptions extends DataMappingOptions {
    /**
     * Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values
     * @default false
     */
    objectRows?: boolean;
    /**
     * Data type map instance
     * @default GlobalTypeMap
     */
    typeMap?: DataTypeMap;
}

export interface StatementPrepareOptions {
    /**
     * Specifies data type for each parameter
     */
    paramTypes?: OID[];
    /**
     * Data type map instance
     * @default GlobalTypeMap
     */
    typeMap?: DataTypeMap;
}

export interface QueryOptions extends DataMappingOptions {
    /**
     * Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values
     * @default false
     */
    objectRows?: boolean;
    /**
     * Data type map instance
     * @default GlobalTypeMap
     */
    typeMap?: DataTypeMap;
    /**
     * If true, returns Cursor instance instead of rows
     */
    cursor?: boolean;
    /**
     * Query execution parameters
     */
    params?: (BindParam | any)[];
    /**
     * Specifies transfer format (binary or text) for each column
     * @default DataFormat.binary
     */
    columnFormat?: DataFormat | DataFormat[];
    /**
     * Specifies how many rows will be fetched. For Cursor, this value specifies how many rows will be fetched in a batch
     * @default 100
     */
    fetchCount?: number;
}

export interface CommandResult {
    /**
     * Name of the command (INSERT, SELECT, UPDATE, etc.)
     */
    command?: string;
    /**
     * Contains information about fields in column order
     */
    fields?: FieldInfo[];
    /**
     * Contains array of row data
     */
    rows?: any[];
    /**
     * Time elapsed to execute command
     */
    executeTime?: number;
    /**
     * How many rows affected
     */
    rowsAffected?: number;
}

export interface ScriptResult {
    /**
     * Array of command result for each sql command in the script
     */
    results: CommandResult[];
    /**
     * Command count in the script
     */
    totalCommands: number;
    /**
     * Total execution time
     */
    totalTime: number;
}

export interface FieldInfo {
    /**
     * Name of the field
     */
    fieldName: string;
    /**
     * OID of the table
     */
    tableId?: number;
    /**
     * OID of the column
     */
    columnId?: number;
    /**
     * OID of the data type
     */
    dataTypeId: number;
    /**
     * OID of the elements data type if field is an array
     */
    elementDataTypeId?: number;
    /**
     * JS type name that data type mapped
     */
    mappedType: string;
    /**
     * Data length if data type has a fixed size
     */
    fixedSize?: number;
    /**
     * Modifier of the data type
     */
    modifier?: number;
    /**
     * Whether the data type is an array
     */
    isArray?: boolean;
}

export interface QueryResult extends CommandResult {
    /**
     * Cursor instance
     */
    cursor?: Cursor;
}

export type DecodeBinaryFunction = (buf: Buffer, options: DataMappingOptions) => any;
export type EncodeBinaryFunction = (buf: SmartBuffer, v: any, options: DataMappingOptions) => void;
export type ParseTextFunction = (v: any, options: DataMappingOptions) => any;
export type EncodeTextFunction = (v: any, options: DataMappingOptions) => string;

export type AnyParseFunction = ParseTextFunction | DecodeBinaryFunction;

export interface DataType {
    oid: OID;
    name: string;
    elementsOID?: OID;
    mappedType: string;
    arraySeparator?: string;
    isType: (v: any) => boolean;
    parseBinary: DecodeBinaryFunction;
    parseText: ParseTextFunction;
    encodeBinary?: EncodeBinaryFunction;
    encodeText?: EncodeTextFunction;
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

export interface Rectangle {
    x1: number,
    y1: number,
    x2: number,
    y2: number,
}

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
