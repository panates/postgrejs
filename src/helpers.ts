import {Circle, ConnectionConfiguration, FiniteLine, Nullable, Point} from './definitions';
import url from "url";
import {Protocol} from './protocol/protocol';
import {dataTypeRegistry} from './datatype-registry';
import RowDescription = Protocol.RowDescription;

export function fastParseInt(str: string | number): number {
    /* istanbul ignore next */
    if (typeof str === 'number')
        return Math.floor(str);
    const strLength = str.length;
    let res = 0;
    let i = 0;
    do {
        const charCode = str.charCodeAt(i);
        /* istanbul ignore next */
        if (charCode === 46)
            return res;
        /* istanbul ignore next */
        if (charCode < 48 || charCode > 57)
            return NaN;
        res *= 10;
        res += (charCode - 48);
    } while (++i < strLength);
    return res;
}

export function parseConnectionString(str: string): ConnectionConfiguration {

    if (str.startsWith('unix:///') || str.startsWith('/')) {
        const arr = str.split(' ');
        return {host: arr[0], database: arr[1]} as ConnectionConfiguration;
    }

    const parsed = url.parse(str, true);
    const getFirst = (v: string | string[] | null) => {
        return typeof v === 'string' ? v :
            (Array.isArray(v) ? v[0] : '');
    }

    const cfg: ConnectionConfiguration = {};
    cfg.host = decodeURI(parsed.hostname || '');
    if (parsed.port)
        cfg.port = parseInt(parsed.port, 10);

    if (parsed.protocol == 'socket:') {
        if (!cfg.host.startsWith('/'))
            cfg.host = '/' + cfg.host;
        cfg.host += decodeURI(parsed.pathname || '');
        if (parsed.query.db)
            cfg.database = decodeURI(getFirst(parsed.query.db));
    } else if (parsed.protocol == 'pg:' || parsed.protocol == 'postgres:') {
        if (parsed.pathname)
            cfg.database = decodeURI(parsed.pathname.substring(1));
    }

    if (parsed.query.host)
        cfg.host = decodeURI(getFirst(parsed.query.host));

    if (parsed.query.schema)
        cfg.schema = decodeURI(getFirst(parsed.query.schema));

    if (parsed.query.application_name)
        cfg.applicationName = decodeURI(getFirst(parsed.query.application_name));

    if (parsed.query.fallback_application_name)
        cfg.fallbackApplicationName = decodeURI(getFirst(parsed.query.fallback_application_name));

    if (parsed.auth) {
        const a = parsed.auth.split(':');
        if (a[0])
            cfg.user = a[0];
        if (a[1])
            cfg.password = a[1];
    }
    return cfg;
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
export function escapeLiteral(str: string): string {
    let backSlash = false
    let out = '\'';
    let i;
    let c;
    const l = str.length;

    for (i = 0; i < l; i++) {
        c = str[i];
        if (c === '\'')
            out += c + c;
        else if (c === '\\') {
            out += c + c;
            backSlash = true;
        } else
            out += c;
    }
    out += '\'';

    if (backSlash)
        out = ' E' + out;

    return out
}

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
export function escapeIdentifier(str: string): string {
    return '"' + str.replace(/"/g, '""') + '"';
}

const TIMESTAMP_PATTERN = /^(\d{4})-?(0[1-9]|1[012])?-?([123]0|[012][1-9]|31)?(?:[T ]?([01][0-9]|2[0-3]):?([0-5][0-9]):?([0-5][0-9])?(?:\.(\d+))?(?:(Z)|(?:([+-])([01]?[0-9]|2[0-3]):?([0-5][0-9])?))?)?$/;
const INFINITY_PATTERN = /^-?infinity$/;

export function parseDate(str: string): Nullable<Date | Number> {
    return _parseDate(str);
}

export function parseTimestamp(str: string): Nullable<Date | Number> {
    return _parseDate(str, true);
}

export function parseTimestampTz(str: string): Nullable<Date | Number> {
    return _parseDate(str, true, true);
}

function _parseDate(str: string, hasTime?: boolean, hasTimestamp?: boolean): Nullable<Date | Number> {
    let m = str.match(TIMESTAMP_PATTERN);
    if (!m) {
        m = str.match(INFINITY_PATTERN);
        if (m)
            return Number(str.replace('i', 'I'))
        return null;
    }

    const args: any[] = [];
    const l = hasTime ? (hasTimestamp ? m.length : 7) : 3;
    for (let i = 0; i < l; i++) {
        const s = m[i + 1];
        args[i] = s ? parseInt(s[0] === '0' ? s[1] : s, 10) || 0 : 0;
    }
    if (args[1] > 0)
        args[1]--;
    if (hasTimestamp) {
        if (args[9])
            args[3] -= args[9];
        if (args[10])
            args[4] -= args[10];
    }
    // @ts-ignore
    return new Date(Date.UTC(...args.splice(0, 8)));
}

const CIRCLE_PATTERN1 = /^< *\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\) *, *(\d+\.?\d*) *>$/;
const CIRCLE_PATTERN2 = /^\( *\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\) *, *(\d+\.?\d*) *\)$/;
const CIRCLE_PATTERN3 = /^\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\) *, *(\d+\.?\d*)$/;
const CIRCLE_PATTERN4 = /^(\d+\.?\d*) *, *(\d+\.?\d*) *, *(\d+\.?\d*)$/

export function parseCircle(v: string): Nullable<Circle> {
    const m = v.match(CIRCLE_PATTERN1) || v.match(CIRCLE_PATTERN2) ||
        v.match(CIRCLE_PATTERN3) || v.match(CIRCLE_PATTERN4);
    if (!m)
        return null;
    return {
        x: parseFloat(m[1]),
        y: parseFloat(m[2]),
        r: parseFloat(m[3]),
    };
}

const FINITE_LINE_PATTERN1 = /^\[ *\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\) *, *\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\) *]$/;
const FINITE_LINE_PATTERN2 = /^\( *\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\) *, *\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\) *\)$/;
const FINITE_LINE_PATTERN3 = /^\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\) *, *\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\)$/;
const FINITE_LINE_PATTERN4 = /^(\d+\.?\d*) *, *(\d+\.?\d*) *, *(\d+\.?\d*) *, *(\d+\.?\d*)$/

export function parseFiniteLine(v: string): Nullable<FiniteLine> {
    const m = v.match(FINITE_LINE_PATTERN1) || v.match(FINITE_LINE_PATTERN2) ||
        v.match(FINITE_LINE_PATTERN3) || v.match(FINITE_LINE_PATTERN4);
    if (!m)
        return null;
    return {
        x1: parseFloat(m[1]),
        y1: parseFloat(m[2]),
        x2: parseFloat(m[3]),
        y2: parseFloat(m[4]),
    };
}

const POINT_PATTERN1 = /^\( *(\d+\.?\d*) *, *(\d+\.?\d*) *\)$/;
const POINT_PATTERN2 = /^(\d+\.?\d*) *, *(\d+\.?\d*)$/;

export function parsePoint(v: string): Nullable<Point> {
    const m = v.match(POINT_PATTERN1) || v.match(POINT_PATTERN2);
    if (!m)
        return null;
    return {
        x: parseFloat(m[1]),
        y: parseFloat(m[2])
    };
}

const DefaultColumnParser = (v: any) => v;

export function getParsers(fields: Protocol.RowDescription[]): ((v) => any)[] {
    const parsers = new Array(fields.length);
    const l = fields.length;
    let f: Protocol.RowDescription;
    let i;
    for (i = 0; i < l; i++) {
        f = fields[i];
        const dataTypeReg = dataTypeRegistry[f.dataTypeId];
        const isArray = dataTypeReg && dataTypeReg.isArray;
        if (dataTypeReg) {
            if (f.format === Protocol.DataFormat.binary && dataTypeReg.type.decode != null) {
                const decode = dataTypeReg.type.decode;
                parsers[i] = isArray ? (v) => decode(v, true) : decode
            } else
                parsers[i] = isArray ? (v) => dataTypeReg.type.parse(v, true) : dataTypeReg.type.parse;
        } else
            parsers[i] = DefaultColumnParser;
    }
    return parsers;
}

export function parseRow(parsers: ((v: any) => any)[], row: any[]): void {
    const l = row.length;
    let i;
    for (i = 0; i < l; i++) {
        row[i] = parsers[i].call(undefined, row[i]);
    }
}

export function convertRowToObject(fields: RowDescription[], row: any[]): any {
    const out = {};
    const l = row.length;
    let i;
    for (i = 0; i < l; i++) {
        out[fields[i].fieldName] = row[i];
    }
    return out;
}
