import { BindParam } from '../connection/bind-param.js';
import { DataTypeMap, GlobalTypeMap } from '../data-type-map.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { escapeIdentifier } from './escape-identifier.js';
import { escapeLiteral } from './escape-literal.js';

/**
 * A statement built by the `sql` tag: its text with the values pulled out.
 *
 * The same object serves both protocols, which is the point of building it
 * rather than a string. query() takes `sql` and `params` and lets the server
 * receive the values out of band, where they can never be read as SQL.
 * execute() has no such option - the Simple Query protocol carries no
 * parameters at all - so it takes stringify(), which writes the values into
 * the statement as properly encoded literals.
 *
 * Those two are not equally strong. Parameters are safe by construction;
 * literals are only as safe as the encoder, which is why stringify() refuses
 * to guess (see below) instead of producing something that looks plausible.
 */
export class QueryRequest {
  readonly sql: string;
  readonly params: any[];

  constructor(text: string, params: any[]) {
    this.sql = text;
    this.params = params;
  }

  /**
   * The statement with its values written in as literals, for the Simple
   * Query protocol.
   *
   * Every value is encoded by its own data type and given an explicit cast:
   * a parameter carries its OID in the Bind message, but a literal carries
   * nothing, so without the cast the server would infer a type from context
   * and the same statement could mean different things through query() and
   * execute(). A value whose type has no text encoding throws rather than
   * falling back to a generic conversion.
   */
  stringify(options?: DataMappingOptions & { typeMap?: DataTypeMap }): string {
    const typeMap = options?.typeMap || GlobalTypeMap;
    const params = this.params;
    if (!params.length) return this.sql;
    // $1..$n, longest first so $10 is not matched as $1 followed by "0".
    return this.sql.replace(/\$(\d+)/g, (match, n) => {
      const i = +n - 1;
      if (i < 0 || i >= params.length) return match;
      return encodeLiteral(params[i], typeMap, options);
    });
  }
}

/**
 * Builds a QueryRequest from a template literal, turning every interpolated
 * value into a bind parameter.
 *
 * ```ts
 * await connection.query(sql`select * from t where id = any(${[1, 3]})`);
 * ```
 *
 * A nested QueryRequest is spliced in as a fragment with its parameters
 * renumbered, so a statement can be assembled from pieces:
 *
 * ```ts
 * const filter = city ? sql`where city = ${city}` : sql``;
 * await connection.query(sql`select * from t ${filter} order by id`);
 * ```
 *
 * Interpolated values are never written into the text, so this is not string
 * building with extra steps - there is no way for a value to be read as SQL.
 */
export function sql(
  strings: TemplateStringsArray,
  ...values: any[]
): QueryRequest {
  const params: any[] = [];
  let text = '';
  const l = strings.length;
  let i: number;
  for (i = 0; i < l; i++) {
    text += strings[i];
    if (i >= values.length) continue;
    const v = values[i];
    if (v instanceof QueryRequest) {
      // Renumber the fragment's placeholders onto this statement's params.
      const offset = params.length;
      text += v.sql.replace(/\$(\d+)/g, (_m, n) => '$' + (+n + offset));
      params.push(...v.params);
      continue;
    }
    params.push(v);
    text += '$' + params.length;
  }
  return new QueryRequest(text, params);
}

/**
 * Quotes a table, column or schema name for use inside a `sql` template.
 *
 * Values become parameters, but names cannot: `$1` is always a value, so
 * `sql`select ${col} from t`` selects the string, not the column. This
 * writes the name into the statement instead, quoted the way PostgreSQL's
 * own `quote_ident()` does.
 *
 * ```ts
 * await connection.query(sql`select ${sql.ident(col)} from ${sql.ident(table)}`);
 * ```
 */
sql.ident = function ident(name: string): QueryRequest {
  return new QueryRequest(escapeIdentifier(name), []);
};

/**
 * Builds the column list and VALUES clause of an INSERT from an object, or
 * from an array of objects for a multi-row insert.
 *
 * ```ts
 * await connection.query(sql`insert into users ${sql.values(user)}`);
 * // insert into users ("id","name") values ($1,$2)
 * ```
 *
 * `columns` restricts and orders what is written. Pass it whenever the
 * object comes from outside - a request body, say. Without it the columns
 * are whatever keys the object happens to carry, so a caller could add one
 * you did not intend to accept. The values are always parameters, so this
 * is not an SQL injection either way; it is the column list that needs
 * deciding by you rather than by the input.
 */
sql.values = function values(
  data: Record<string, any> | Record<string, any>[],
  columns?: string[],
): QueryRequest {
  const rows = Array.isArray(data) ? data : [data];
  if (!rows.length) throw new TypeError('sql.values() needs at least one row');
  const cols = columns ?? Object.keys(rows[0]);
  if (!cols.length)
    throw new TypeError('sql.values() needs at least one column');
  const params: any[] = [];
  const tuples = rows.map(row => {
    const placeholders = cols.map(c => {
      params.push(row[c]);
      return '$' + params.length;
    });
    return `(${placeholders.join(',')})`;
  });
  const names = cols.map(escapeIdentifier).join(',');
  return new QueryRequest(`(${names}) values ${tuples.join(',')}`, params);
};

/**
 * Builds the assignment list of an UPDATE from an object.
 *
 * ```ts
 * await connection.query(
 *   sql`update users set ${sql.set({ city })} where id = ${id}`,
 * );
 * // update users set "city" = $1 where id = $2
 * ```
 *
 * `columns` restricts what is written, for the same reason as in
 * sql.values().
 */
sql.set = function set(
  data: Record<string, any>,
  columns?: string[],
): QueryRequest {
  const cols = columns ?? Object.keys(data);
  if (!cols.length) throw new TypeError('sql.set() needs at least one column');
  const params: any[] = [];
  const assignments = cols.map(c => {
    params.push(data[c]);
    return `${escapeIdentifier(c)} = $${params.length}`;
  });
  return new QueryRequest(assignments.join(', '), params);
};

function encodeLiteral(
  value: any,
  typeMap: DataTypeMap,
  options?: DataMappingOptions,
): string {
  let v = value;
  let oid: number | undefined;
  if (v instanceof BindParam) {
    oid = v.oid;
    v = v.value;
  }
  if (v == null) return 'null';
  oid = oid ?? typeMap.determine(v);
  if (oid == null)
    throw new TypeError(
      `Cannot write ${describe(v)} into a statement as a literal: no data type matches it. ` +
        `Use query() instead, which sends it as a parameter.`,
    );
  const dataType = typeMap.get(oid);
  if (!dataType?.encodeText)
    throw new TypeError(
      `Cannot write ${describe(v)} into a statement as a literal: ` +
        `data type "${dataType?.name ?? oid}" has no text encoding. ` +
        `Use query() instead, which sends it as a parameter.`,
    );
  const cast = dataType.name;
  if (dataType.elementsOID) {
    const elementType = typeMap.get(dataType.elementsOID);
    const arr = (Array.isArray(v) ? v : [v]).map(x =>
      x == null
        ? 'null'
        : escapeLiteral(elementType!.encodeText!(x, options || {})),
    );
    return `ARRAY[${arr.join(',')}]::${cast}`;
  }
  return `${escapeLiteral(dataType.encodeText(v, options || {}))}::${cast}`;
}

function describe(v: any): string {
  const t = typeof v;
  if (t === 'object') return v.constructor?.name || 'object';
  return t;
}
