import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

/**
 * A jsonpath decodes to a string, and there is nothing else it could
 * sensibly be: the binary form is the text form with one byte in front
 * of it. Parsing the expression into a tree would be inventing an API
 * for something the server already understands and this client never
 * evaluates. `pg` leaves it a string too.
 *
 * The string that comes back is PostgreSQL's normalized spelling, not
 * what was written - `$.a[*].b` is stored and printed as `$."a"[*]."b"`.
 */

/** The only format the server has ever written, and the one it reads. */
const JSONPATH_VERSION = 1;

export const JsonPathType: DataType = {
  name: 'jsonpath',
  oid: DataTypeOIDs.jsonpath,
  jsType: 'string',

  // A jsonpath is a string, and inferring this type from one would send
  // `jsonpath` where `text` was meant. See inet-type.ts.
  inferrable: false,

  encodeText(v: any): string {
    return '' + v;
  },

  /** A version byte, then the expression as UTF-8 - no length prefix. */
  encodeBinary(buf: SmartBuffer, v: any): void {
    if (typeof v !== 'string')
      throw new Error(`"${v}" is not a valid jsonpath value`);
    buf.writeUInt8(JSONPATH_VERSION);
    buf.writeString(v, 'utf8');
  },

  decodeBinary(v: Buffer, offset: number = 0, len: number): string {
    const version = v[offset];
    if (version !== JSONPATH_VERSION)
      throw new Error(`Unsupported jsonpath version ${version}`);
    return v.toString('utf8', offset + 1, offset + len);
  },

  decodeText(v: string): string {
    return v;
  },

  isType(v: any): boolean {
    // Every jsonpath begins with a variable or a mode word, and `$` is
    // the only variable an expression can start with once `strict` or
    // `lax` is allowed for - enough to tell a path from ordinary text
    // without parsing one.
    return typeof v === 'string' && /^\s*(?:(?:strict|lax)\s+)?[$@]/.test(v);
  },
};

export const ArrayJsonPathType: DataType = {
  ...JsonPathType,
  name: '_jsonpath',
  oid: DataTypeOIDs._jsonpath,
  elementsOID: DataTypeOIDs.jsonpath,
};
