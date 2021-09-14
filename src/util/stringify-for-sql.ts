import {EncodeTextFunction, DataMappingOptions} from '../definitions';
import {escapeLiteral} from './escape-literal';
import {UuidType} from '../data-types/UuidType';

export function stringifyArrayForSQL(v: any[], options?: DataMappingOptions, encode?: EncodeTextFunction): string {
    const arr = v.map(x => stringifyValueForSQL(x, options, encode));
    return 'ARRAY[' + arr.join(',') + ']';
}

export function stringifyValueForSQL(v: any, options?: DataMappingOptions, encode?: EncodeTextFunction): string {
    if (v == null)
        return 'null';
    if (typeof v === 'boolean')
        return v ? 'true' : 'false';
    if (Array.isArray(v))
        return stringifyArrayForSQL(v, options, encode);
    if (encode)
        v = encode(v, options || {});
    if (typeof v === 'number')
        return '' + v;
    if (typeof v === 'bigint')
        return v.toString();
    if (typeof v === 'string' && UuidType.isType(v))
        return escapeLiteral('' + v) + '::uuid';
    if (typeof v === 'object')
        return escapeLiteral(JSON.stringify(v));
    return escapeLiteral('' + v);
}
