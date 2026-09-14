import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { AnyParseFunction } from '../types.js';

export function parseRow(
  parsers: AnyParseFunction[],
  data: Buffer,
  columnCount: number,
  options: DataMappingOptions,
): any[] {
  const row = new Array(columnCount);
  let offset = 0;
  let len: number;
  let i: number;
  for (i = 0; i < columnCount; i++) {
    // The length of the column value, in bytes (this count does not
    // include itself). Can be zero. As a special case, -1 indicates a
    // NULL column value - no value bytes follow in that case.
    len = data.readInt32BE(offset);
    offset += 4;
    if (len < 0) {
      row[i] = null;
    } else {
      // None of the parsers use `this`, so a direct call avoids .call()'s
      // extra indirection (measured ~5.7x slower than invoking directly).
      row[i] = parsers[i](data, offset, len, options);
      offset += len;
    }
  }
  return row;
}

type ObjectRowFactory = (values: any[]) => object;

/**
 * Rows decoded against one `FieldInfo[]` before compiling a factory for it.
 *
 * Compiling costs ~0.8µs when the engine can reuse its own compilation
 * cache for identical source and several µs when it can't, against ~0.1µs
 * saved per row - so a query returning a handful of rows would pay more
 * than it ever got back. Since wrapRowDescription() builds a fresh fields
 * array per query, a single-row query executed in a loop would otherwise
 * recompile on every call. Waiting a few rows keeps that case free while
 * giving up well under 1% of the win on a result worth compiling for.
 */
const OBJECT_ROW_FACTORY_THRESHOLD = 8;

/**
 * Holds only factories that were actually compiled - never the row counts
 * leading up to one. Writing a fresh key here costs ~67ns plus the garbage
 * it leaves behind, which a single-row query (a new fields array every
 * time, never looked up again) would pay on every call for nothing.
 *
 * Keyed weakly, so a finished query's factory goes away with its fields;
 * an entry earns its keep only when the same fields array is decoded
 * against again after something else interrupted it.
 */
const objectRowFactories = new WeakMap<FieldInfo[], ObjectRowFactory>();

// Rows of one result arrive in a run, so a single entry in front of the
// WeakMap answers nearly every lookup with one identity check - and is
// also where the pre-threshold row count lives, keeping it out of the
// WeakMap entirely.
let memoFields: FieldInfo[] | undefined;
let memoFactory: ObjectRowFactory | null = null;
let memoRows = 0;
// Set when this shape can never be compiled, so the attempt isn't
// repeated for every remaining row of the result.
let memoDeclined = false;

/**
 * Compiles a function that builds this query's row object in one shot,
 * from a single object literal with every column name in it.
 *
 * Assigning the columns one at a time instead (`row[name] = value`) walks
 * the object through one hidden-class transition per column, per row -
 * measured at ~6.8x the cost of handing the engine a literal whose shape
 * it can lay out once and reuse for every row of the result.
 *
 * Returns null when that isn't possible, leaving the caller on the
 * assignment path: a column named `__proto__` would set the prototype
 * rather than become an own property if it appeared as a literal key, and
 * Function construction itself can be unavailable (a Content-Security-
 * Policy without 'unsafe-eval').
 */
function buildObjectRowFactory(
  fields: FieldInfo[],
  columnCount: number,
): ObjectRowFactory | null {
  let src = 'return{';
  let name: string;
  let i: number;
  for (i = 0; i < columnCount; i++) {
    name = fields[i].fieldName;
    if (name === '__proto__') return null;
    if (i) src += ',';
    // JSON.stringify() quotes and escapes the name into a string literal,
    // so any column name is embedded safely, whatever it contains.
    src += JSON.stringify(name) + ':v[' + i + ']';
  }
  try {
    return new Function('v', src + '}') as ObjectRowFactory;
    /* c8 ignore next 3 - needs a runtime with Function construction disabled */
  } catch {
    return null;
  }
}

function getObjectRowFactory(
  fields: FieldInfo[],
  columnCount: number,
): ObjectRowFactory | null {
  if (fields !== memoFields) {
    // A different result than the last row belonged to. A hit here means
    // an earlier, long-enough run already paid to compile this exact
    // fields array; otherwise start counting it from scratch.
    memoFields = fields;
    memoRows = 1;
    memoDeclined = false;
    memoFactory = objectRowFactories.get(fields) ?? null;
    return memoFactory;
  }
  if (memoFactory || memoDeclined) return memoFactory;
  if (++memoRows < OBJECT_ROW_FACTORY_THRESHOLD) return null;
  const factory = buildObjectRowFactory(fields, columnCount);
  if (!factory) {
    memoDeclined = true;
    return null;
  }
  memoFactory = factory;
  objectRowFactories.set(fields, factory);
  return factory;
}

export function parseObjectRow(
  parsers: AnyParseFunction[],
  data: Buffer,
  columnCount: number,
  options: DataMappingOptions,
  fields: FieldInfo[],
): object {
  // A compiled factory is built against `fields`, so it can only be used
  // when the row really does have one value per field.
  const factory =
    fields.length === columnCount
      ? getObjectRowFactory(fields, columnCount)
      : null;
  if (factory) {
    const values = new Array(columnCount);
    let offset = 0;
    let len: number;
    let i: number;
    for (i = 0; i < columnCount; i++) {
      len = data.readInt32BE(offset);
      offset += 4;
      if (len < 0) {
        values[i] = null;
      } else {
        values[i] = parsers[i](data, offset, len, options);
        offset += len;
      }
    }
    return factory(values);
  }
  return parseObjectRowByAssignment(
    parsers,
    data,
    columnCount,
    options,
    fields,
  );
}

function parseObjectRowByAssignment(
  parsers: AnyParseFunction[],
  data: Buffer,
  columnCount: number,
  options: DataMappingOptions,
  fields: FieldInfo[],
): object {
  const row = {};
  let offset = 0;
  let len: number;
  let i: number;
  let value: any;
  for (i = 0; i < columnCount; i++) {
    // The length of the column value, in bytes (this count does not
    // include itself). Can be zero. As a special case, -1 indicates a
    // NULL column value - no value bytes follow in that case.
    len = data.readInt32BE(offset);
    offset += 4;
    if (len < 0) {
      value = null;
    } else {
      // None of the parsers use `this`, so a direct call avoids .call()'s
      // extra indirection (measured ~5.7x slower than invoking directly).
      value = parsers[i](data, offset, len, options);
      offset += len;
    }
    const name = fields[i].fieldName;
    if (name === '__proto__') {
      // `value`, not row[i] - nothing is ever assigned by numeric index
      // here (row is a plain object keyed by field name), so reading row[i]
      // handed defineProperty an undefined and silently dropped the
      // column's actual value.
      Object.defineProperty(row, name, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      row[name] = value;
    }
  }
  return row;
}
