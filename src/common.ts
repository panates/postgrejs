import {DataTypeMap} from './DataTypeMap';
import {Protocol} from './protocol/protocol';
import type {AnyParseFunction, DataMappingOptions, FieldInfo,} from './definitions';
import {Connection} from './Connection';
import TaskQueue from 'putil-taskqueue';
import {PgSocket} from './protocol/PgSocket';
import {parsePostgresArray} from './helpers/parse-array';
import {decodeBinaryArray} from './helpers/decode-binaryarray';

const DefaultColumnParser = (v: any) => v;

export function getParsers(typeMap: DataTypeMap, fields: Protocol.RowDescription[]): AnyParseFunction[] {
    const parsers = new Array(fields.length);
    const l = fields.length;
    let f: Protocol.RowDescription;
    let i;
    for (i = 0; i < l; i++) {
        f = fields[i];
        const dataTypeReg = typeMap.get(f.dataTypeId);
        if (dataTypeReg) {
            const isArray = !!dataTypeReg.elementsOID;
            if (f.format === Protocol.DataFormat.binary) {
                const decode = dataTypeReg.parseBinary;
                if (decode) {
                    parsers[i] = !isArray ? decode :
                        (v: Buffer, options: DataMappingOptions) => decodeBinaryArray(v, decode, options);
                }
            } else if (f.format === Protocol.DataFormat.text) {
                const parse = dataTypeReg.parseText;
                if (parse) {
                    parsers[i] = !isArray ? parse :
                        (v: string, options: DataMappingOptions) =>
                            parsePostgresArray(v, {
                                transform: (x => parse(x, options)),
                                separator: dataTypeReg.arraySeparator,
                            });
                }
            }
        }
        parsers[i] = parsers[i] || DefaultColumnParser;
    }
    return parsers;
}

export function parseRow(parsers: AnyParseFunction[], row: any[], options: DataMappingOptions): void {
    const l = row.length;
    let i;
    for (i = 0; i < l; i++) {
        row[i] = row[i] == null ? null :
            parsers[i].call(undefined, row[i], options);
    }
}

export function convertRowToObject(fields: FieldInfo[], row: any[]): any {
    const out = {};
    const l = row.length;
    let i;
    for (i = 0; i < l; i++) {
        out[fields[i].fieldName] = row[i];
    }
    return out;
}

export function getStatementQueue(connection: Connection): TaskQueue {
    return connection['_statementQueue'] as TaskQueue;
}

export function getSocket(connection: Connection): PgSocket {
    return connection['_socket'] as PgSocket;
}

export function wrapRowDescription(typeMap: DataTypeMap, fields: Protocol.RowDescription[]): FieldInfo[] {
    return fields.map(f => {
        const x: FieldInfo = {
            fieldName: f.fieldName,
            tableId: f.tableId,
            columnId: f.columnId,
            dataTypeId: f.dataTypeId
        };
        if (f.fixedSize && f.fixedSize > 0)
            x.fixedSize = f.fixedSize;
        if (f.modifier && f.modifier > 0)
            x.modifier = f.modifier;
        const reg = typeMap.get(x.dataTypeId);
        if (reg && reg.elementsOID)
            x.isArray = true;
        return x;
    });
}
