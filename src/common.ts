import {DataTypeRegistry} from './DataTypeRegistry';
import {Protocol} from './protocol/protocol';
import type {
    AnyParseFunction,
    FetchOptions,
} from './definitions';
import type {Connection} from './Connection';
import TaskQueue from 'putil-taskqueue';
import {PgSocket} from './protocol/PgSocket';
import {parsePostgresArray} from './helpers/parse-array';
import {decodeBinaryArray} from './helpers/decode-binaryarray';

const DefaultColumnParser = (v: any) => v;

export function getParsers(fields: Protocol.RowDescription[]): AnyParseFunction[] {
    const parsers = new Array(fields.length);
    const l = fields.length;
    let f: Protocol.RowDescription;
    let i;
    for (i = 0; i < l; i++) {
        f = fields[i];
        const dataTypeReg = DataTypeRegistry.items[f.dataTypeId];
        if (dataTypeReg) {
            const isArray = dataTypeReg.isArray;
            if (f.format === Protocol.DataFormat.binary) {
                const decode = dataTypeReg.type.parseBinary;
                if (decode) {
                    parsers[i] = !isArray ? decode :
                        (v: Buffer, options: FetchOptions) => decodeBinaryArray(v, decode, options);
                }
            } else if (f.format === Protocol.DataFormat.text) {
                const parse = dataTypeReg.type.parseText;
                if (parse) {
                    parsers[i] = !isArray ? parse :
                        (v: string, options: FetchOptions) =>
                            parsePostgresArray(v, {
                                transform: (x => parse(x, options)),
                                separator: dataTypeReg.type.arraySeparator,
                            });
                }
            }
        }
        parsers[i] = parsers[i] || DefaultColumnParser;
    }
    return parsers;
}

export function parseRow(parsers: AnyParseFunction[], row: any[], options: FetchOptions): void {
    const l = row.length;
    let i;
    for (i = 0; i < l; i++) {
        row[i] = (parsers[i] as Function).call(undefined, row[i], options);
    }
}

export function convertRowToObject(fields: Protocol.RowDescription[], row: any[]): any {
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

export function wrapRowDescription(fields: Protocol.RowDescription[]): any[] {
    return fields.map(f => {
        const x: any = {...f};
        delete x.format;
        if (x.fixedSize < 0)
            delete x.fixedSize;
        if (x.modifier < 0)
            delete x.modifier;
        const reg = DataTypeRegistry.items[x.dataTypeId];
        if (reg && reg.isArray)
            x.isArray = true;
        return x;
    });
}
