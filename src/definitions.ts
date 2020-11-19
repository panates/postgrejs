import tls from "tls";
import type {Cursor} from './Cursor';
import type {SmartBuffer} from './protocol/SmartBuffer';
import {Protocol} from './protocol/protocol';
import type {PoolConfiguration as LPoolConfiguration} from 'lightning-pool';
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

export interface PoolConfiguration extends ConnectionConfiguration, LPoolConfiguration {
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
     * Name of the data type
     */
    dataTypeName: string;
    /**
     * OID of the elements data type if field is an array
     */
    elementDataTypeId?: number;
    /**
     * Name of the elements data type if field is an array
     */
    elementDataTypeName?: string;
    /**
     * JS type name that data type mapped
     */
    jsType: string;
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
    jsType: string;
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
    bool: 16,
    bytea: 17,
    char: 18,
    name: 19,
    int8: 20,
    int2: 21,
    int2vector: 22,
    int4: 23,
    regproc: 24,
    text: 25,
    oid: 26,
    tid: 27,
    xid: 28,
    cid: 29,
    oidvector: 30,
    json: 114,
    xml: 142,
    point: 600,
    lseg: 601,
    path: 602,
    box: 603,
    polygon: 604,
    line: 628,
    cidr: 650,
    float4: 700,
    float8: 701,
    unknown: 705,
    circle: 718,
    macaddr8: 774,
    money: 790,
    macaddr: 829,
    inet: 869,
    bpchar: 1042,
    varchar: 1043,
    date: 1082,
    time: 1083,
    timestamp: 1114,
    timestamptz: 1184,
    interval: 1186,
    timetz: 1266,
    bit: 1560,
    varbit: 1562,
    numeric: 1700,
    refcursor: 1790,
    regprocedure: 2202,
    regoper: 2203,
    regoperator: 2204,
    regclass: 2205,
    regtype: 2206,
    record: 2249,
    cstring: 2275,
    any: 2276,
    anyarray: 2277,
    void: 2278,
    trigger: 2279,
    language_handler: 2280,
    internal: 2281,
    anyelement: 2283,
    anynonarray: 2776,
    uuid: 2950,
    jsonb: 3802,
    anyrange: 3831,
    int4range: 3904,
    numrange: 3906,
    tsrange: 3908,
    rstzrange: 3910,
    daterange: 3912,
    int8range: 3926,

    _xml: 143,
    _json: 199,
    _xid8: 271,
    _line: 629,
    _cidr: 651,
    _circle: 719,
    _macaddr8: 775,
    _money: 791,
    _bool: 1000,
    _bytea: 1001,
    _char: 1002,
    _name: 1003,
    _int2: 1005,
    _int2vector: 1006,
    _int4: 1007,
    _regproc: 1008,
    _text: 1009,
    _xid: 1011,
    _cid: 1012,
    _oidvector: 1013,
    _bpchar: 1014,
    _varchar: 1015,
    _int8: 1016,
    _point: 1017,
    _lseg: 1018,
    _path: 1019,
    _box: 1020,
    _float4: 1021,
    _float8: 1022,
    _polygon: 1027,
    _oid: 1028,
    _macaddr: 1040,
    _inet: 1041,
    _timestamp: 1115,
    _date: 1182,
    _time: 1183,
    _timestamptz: 1185,
    _interval: 1187,
    _numeric: 1231,
    _cstring: 1263,
    _timetz: 1270,
    _bit: 1561,
    _varbit: 1563,
    _uuid: 2951,
    _jsonb: 3807,
}

export const DataTypeNames = {
    [DataTypeOIDs.bool]: 'bool',
    [DataTypeOIDs.bytea]: 'bytea',
    [DataTypeOIDs.char]: 'char',
    [DataTypeOIDs.name]: 'name',
    [DataTypeOIDs.int8]: 'int8',
    [DataTypeOIDs.int2]: 'int2',
    [DataTypeOIDs.int2vector]: 'int2vector',
    [DataTypeOIDs.int4]: 'int4',
    [DataTypeOIDs.regproc]: 'regproc',
    [DataTypeOIDs.text]: 'text',
    [DataTypeOIDs.oid]: 'oid',
    [DataTypeOIDs.tid]: 'tid',
    [DataTypeOIDs.xid]: 'xid',
    [DataTypeOIDs.cid]: 'cid',
    [DataTypeOIDs.oidvector]: 'oidvector',
    [DataTypeOIDs.json]: 'json',
    [DataTypeOIDs.xml]: 'xml',
    [DataTypeOIDs.point]: 'point',
    [DataTypeOIDs.lseg]: 'lseg',
    [DataTypeOIDs.path]: 'path',
    [DataTypeOIDs.box]: 'box',
    [DataTypeOIDs.polygon]: 'polygon',
    [DataTypeOIDs.line]: 'line',
    [DataTypeOIDs.cidr]: 'cidr',
    [DataTypeOIDs.float4]: 'float4',
    [DataTypeOIDs.float8]: 'float8',
    [DataTypeOIDs.unknown]: 'unknown',
    [DataTypeOIDs.circle]: 'circle',
    [DataTypeOIDs.macaddr8]: 'macaddr8',
    [DataTypeOIDs.money]: 'money',
    [DataTypeOIDs.macaddr]: 'macaddr',
    [DataTypeOIDs.inet]: 'inet',
    [DataTypeOIDs.bpchar]: 'bpchar',
    [DataTypeOIDs.varchar]: 'varchar',
    [DataTypeOIDs.date]: 'date',
    [DataTypeOIDs.time]: 'time',
    [DataTypeOIDs.timestamp]: 'timestamp',
    [DataTypeOIDs.timestamptz]: 'timestamptz',
    [DataTypeOIDs.interval]: 'interval',
    [DataTypeOIDs.timetz]: 'timetz',
    [DataTypeOIDs.bit]: 'bit',
    [DataTypeOIDs.varbit]: 'varbit',
    [DataTypeOIDs.numeric]: 'numeric',
    [DataTypeOIDs.refcursor]: 'refcursor',
    [DataTypeOIDs.regprocedure]: 'regprocedure',
    [DataTypeOIDs.regoper]: 'regoper',
    [DataTypeOIDs.regoperator]: 'regoperator',
    [DataTypeOIDs.regclass]: 'regclass',
    [DataTypeOIDs.regtype]: 'regtype',
    [DataTypeOIDs.record]: 'record',
    [DataTypeOIDs.cstring]: 'cstring',
    [DataTypeOIDs.any]: 'any',
    [DataTypeOIDs.anyarray]: 'anyarray',
    [DataTypeOIDs.void]: 'void',
    [DataTypeOIDs.trigger]: 'trigger',
    [DataTypeOIDs.language_handler]: 'language_handler',
    [DataTypeOIDs.internal]: 'internal',
    [DataTypeOIDs.anyelement]: 'anyelement',
    [DataTypeOIDs.anynonarray]: 'anynonarray',
    [DataTypeOIDs.uuid]: 'uuid',
    [DataTypeOIDs.jsonb]: 'jsonb',
    [DataTypeOIDs.anyrange]: 'anyrange',
    [DataTypeOIDs.int4range]: 'int4range',
    [DataTypeOIDs.numrange]: 'numrange',
    [DataTypeOIDs.tsrange]: 'tsrange',
    [DataTypeOIDs.rstzrange]: 'rstzrange',
    [DataTypeOIDs.daterange]: 'daterange',
    [DataTypeOIDs.int8range]: 'int8range',
    [DataTypeOIDs._xml]: '_xml',
    [DataTypeOIDs._json]: '_json',
    [DataTypeOIDs._xid8]: '_xid8',
    [DataTypeOIDs._line]: '_line',
    [DataTypeOIDs._cidr]: '_cidr',
    [DataTypeOIDs._circle]: '_circle',
    [DataTypeOIDs._macaddr8]: '_macaddr8',
    [DataTypeOIDs._money]: '_money',
    [DataTypeOIDs._bool]: '_bool',
    [DataTypeOIDs._bytea]: '_bytea',
    [DataTypeOIDs._char]: '_char',
    [DataTypeOIDs._name]: '_name',
    [DataTypeOIDs._int2]: '_int2',
    [DataTypeOIDs._int2vector]: '_int2vector',
    [DataTypeOIDs._int4]: '_int4',
    [DataTypeOIDs._regproc]: '_regproc',
    [DataTypeOIDs._text]: '_text',
    [DataTypeOIDs._xid]: '_xid',
    [DataTypeOIDs._cid]: '_cid',
    [DataTypeOIDs._oidvector]: '_oidvector',
    [DataTypeOIDs._bpchar]: '_bpchar',
    [DataTypeOIDs._varchar]: '_varchar',
    [DataTypeOIDs._int8]: '_int8',
    [DataTypeOIDs._point]: '_point',
    [DataTypeOIDs._lseg]: '_lseg',
    [DataTypeOIDs._path]: '_path',
    [DataTypeOIDs._box]: '_box',
    [DataTypeOIDs._float4]: '_float4',
    [DataTypeOIDs._float8]: '_float8',
    [DataTypeOIDs._polygon]: '_polygon',
    [DataTypeOIDs._oid]: '_oid',
    [DataTypeOIDs._macaddr]: '_macaddr',
    [DataTypeOIDs._inet]: '_inet',
    [DataTypeOIDs._timestamp]: '_timestamp',
    [DataTypeOIDs._date]: '_date',
    [DataTypeOIDs._time]: '_time',
    [DataTypeOIDs._timestamptz]: '_timestamptz',
    [DataTypeOIDs._interval]: '_interval',
    [DataTypeOIDs._numeric]: '_numeric',
    [DataTypeOIDs._cstring]: '_cstring',
    [DataTypeOIDs._timetz]: '_timetz',
    [DataTypeOIDs._bit]: '_bit',
    [DataTypeOIDs._varbit]: '_varbit',
    [DataTypeOIDs._uuid]: '_uuid',
    [DataTypeOIDs._jsonb]: '_jsonb',
}
