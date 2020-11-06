import {EncodeTextFunction, FetchOptions} from '../definitions';
import {escapeLiteral} from './escape-literal';

export function stringifyArraySQL(v: any[], options: FetchOptions, encode?: EncodeTextFunction): string {
    const arr = v.map(x => {
        if (x == null)
            return 'null';
        if (typeof x === 'boolean')
            return x ? 'true' : 'false';
        if (Array.isArray(x))
            return stringifyArraySQL(x, options, encode);
        if (encode)
            x = encode(x, options);
        if (typeof x === 'number')
            return x;
        if (typeof x === 'bigint')
            return x.toString();
        if (typeof x === 'object')
            return escapeLiteral(JSON.stringify(x));
        return escapeLiteral('' + x);
    });
    return '[' + arr.join(',') + ']';
}
