import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

/**
 * `bit` and `varbit` are one type on the wire - the length is a property
 * of the column, not of the value - so they share a codec and differ
 * only in which OID they register under.
 *
 * Both decode to a string of `0` and `1`, which is what the type is:
 * PostgreSQL prints it that way, accepts it back that way, and the
 * alternatives are all worse. A number loses leading zeroes and anything
 * past 53 bits; a Buffer loses the bit count, so `1` and `10000000`
 * become the same eight padded bits. `pg` leaves it a string too.
 */

/** Every byte's eight bits, so decoding is one lookup per byte. */
const BYTE_BITS: string[] = new Array(256);
for (let i = 0; i < 256; i++) BYTE_BITS[i] = i.toString(2).padStart(8, '0');

const BIT_PATTERN = /^[01]*$/;

/**
 * An int32 bit count, then the bits themselves packed most-significant
 * first and the last byte zero-padded. A zero-length value is the count
 * and nothing else.
 */
function decode(v: Buffer, offset: number): string {
  const bits = v.readInt32BE(offset);
  const whole = bits >> 3;
  const start = offset + 4;
  let out = '';
  let i: number;
  for (i = 0; i < whole; i++) out += BYTE_BITS[v[start + i]];
  const rest = bits & 7;
  if (rest) out += BYTE_BITS[v[start + whole]].slice(0, rest);
  return out;
}

function encode(buf: SmartBuffer, v: any, name: string): void {
  if (typeof v !== 'string' || !BIT_PATTERN.test(v))
    throw new Error(
      `"${v}" is not a valid ${name} value - a string of 0 and 1 is`,
    );
  const bits = v.length;
  buf.writeInt32BE(bits);
  const bytes = Buffer.alloc((bits + 7) >> 3);
  let i: number;
  for (i = 0; i < bits; i++)
    if (v.charCodeAt(i) === 49) bytes[i >> 3] |= 128 >> (i & 7);
  buf.writeBytes(bytes);
}

function createType(name: string, oid: number): DataType {
  return {
    name,
    oid,
    jsType: 'string',

    // `0` and `1` are ordinary characters, and a string of them is far
    // more often text than a bit string - inferring this type would send
    // `bit` where `text` was meant. See inet-type.ts.
    inferrable: false,

    encodeText(v: any): string {
      return '' + v;
    },

    encodeBinary(buf: SmartBuffer, v: any): void {
      encode(buf, v, name);
    },

    decodeBinary(v: Buffer, offset: number = 0): string {
      return decode(v, offset);
    },

    decodeText(v: string): string {
      return v;
    },

    // Two characters, both ASCII - see inet-type.ts for why 'latin1'.
    decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
      return buf.toString('latin1', offset, offset + len);
    },

    isType(v: any): boolean {
      return typeof v === 'string' && BIT_PATTERN.test(v);
    },
  };
}

export const BitType: DataType = createType('bit', DataTypeOIDs.bit);

export const ArrayBitType: DataType = {
  ...BitType,
  name: '_bit',
  oid: DataTypeOIDs._bit,
  elementsOID: DataTypeOIDs.bit,
};

export const VarbitType: DataType = createType('varbit', DataTypeOIDs.varbit);

export const ArrayVarbitType: DataType = {
  ...VarbitType,
  name: '_varbit',
  oid: DataTypeOIDs._varbit,
  elementsOID: DataTypeOIDs.varbit,
};
