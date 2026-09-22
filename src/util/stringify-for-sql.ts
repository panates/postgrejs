import { DataTypeOIDs } from '../constants.js';
import { GlobalTypeMap } from '../data-type-map.js';
import { UuidType } from '../data-types/uuid-type.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { EncodeTextFunction } from '../types.js';
import { escapeLiteral } from './escape-literal.js';
import { formatDateParam } from './format-datetime.js';

export function stringifyArrayForSQL(
  v: any[],
  options?: DataMappingOptions,
  encode?: EncodeTextFunction,
): string {
  const arr = v.map(x => stringifyValueForSQL(x, options, encode));
  return 'ARRAY[' + arr.join(',') + ']';
}

/**
 * Which type an object is is asked rather than assumed.
 *
 * Every geometric class, Interval, Range, Date and Buffer has a
 * registered `encodeText()` that writes exactly the literal PostgreSQL
 * reads back, and `determine()` already knows which type each one is -
 * it is what the same value is sent as when it is bound as a parameter.
 * Without asking, all of them became `::json`: `'{"x":1,"y":2}'::json`
 * where `'(1,2)'::point` was meant - a JSON object that casts to no
 * geometric type at all, and which back when these classes had a
 * `toJSON()` of their own was not even that, but a JSON string holding
 * the literal. A Date became its ISO string and a Buffer leaked its
 * bytes as `{"type":"Buffer",...}`.
 */
function stringifyObjectForSQL(
  v: object,
  options?: DataMappingOptions,
): string {
  // determine() throws for a class that must carry a type OID and does
  // not - a Range built without one - and that throw is deliberate: the
  // alternative is writing a literal for a type nobody chose.
  const oid = GlobalTypeMap.determine(v);
  const dataType = GlobalTypeMap.get(oid);
  // json and jsonb are the fallback below; reaching them through their
  // own encodeText would only add a cast the literal does not need.
  // Anything with no registered text encoder lands there too.
  if (
    dataType?.encodeText &&
    oid !== DataTypeOIDs.json &&
    oid !== DataTypeOIDs.jsonb
  )
    return (
      escapeLiteral(dataType.encodeText(v, options || {})) +
      '::' +
      dataType.name
    );
  return escapeLiteral(JSON.stringify(v)) + '::json';
}

export function stringifyValueForSQL(
  v: any,
  options?: DataMappingOptions,
  encode?: EncodeTextFunction,
): string {
  if (v == null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return stringifyArrayForSQL(v, options, encode);
  if (encode) v = encode(v, options || {});
  if (typeof v === 'number') return '' + v;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'string' && UuidType.isType(v))
    return escapeLiteral('' + v) + '::uuid';
  // A Date is written bare, with its offset and no cast, so that it
  // means the same inlined as it does bound - the server resolves it
  // from the column either way. See format-datetime.ts's
  // formatDateParam().
  if (v instanceof Date) return escapeLiteral(formatDateParam(v, options));
  if (typeof v === 'object') return stringifyObjectForSQL(v, options);
  // A string is deliberately written bare. determine() would answer
  // varchar, but an unadorned literal is `unknown` and takes the type of
  // wherever it lands - `insert into t(n) values('5')` works and
  // `'5'::varchar` would not.
  return escapeLiteral('' + v);
}
