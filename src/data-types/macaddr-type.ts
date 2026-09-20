import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';

/**
 * `macaddr` and `macaddr8` share a file for the same reason `inet` and
 * `cidr` do: one wire format - the address bytes and nothing else - and
 * one JavaScript shape, differing only in length.
 *
 * Both decode to a string, in the `08:00:2b:01:02:03` form the server
 * prints. `pg` answers with a string too.
 */

const SEPARATORS = /[.:-]/g;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * PostgreSQL accepts a MAC address written half a dozen ways -
 * `08:00:2b:01:02:03`, `08-00-2b-01-02-03`, `0800.2b01.0203`,
 * `08002b-010203`, `08002b010203` - which all come to the same thing
 * once the separators are dropped: the right number of hex digits. It is
 * not checked that the separators were placed sensibly, since nothing is
 * gained by rejecting `0:800:2b0:102:03` on the client instead of just
 * reading it.
 */
function parseMacaddr(v: any, size: number): Maybe<Buffer> {
  if (typeof v !== 'string') return undefined;
  const hex = v.replace(SEPARATORS, '');
  if (hex.length !== size * 2 || !HEX_PATTERN.test(hex)) {
    // A six-byte address in a macaddr8 is not an error: the server widens
    // it by inserting ff:fe in the middle, the modified EUI-64 rule, and
    // `macaddr8 '08:00:2b:01:02:03'` is stored as `08:00:2b:ff:fe:01:02:03`.
    if (size !== 8 || hex.length !== 12 || !HEX_PATTERN.test(hex))
      return undefined;
    return Buffer.from(hex.slice(0, 6) + 'fffe' + hex.slice(6), 'hex');
  }
  return Buffer.from(hex, 'hex');
}

function createType(name: string, oid: number, size: number): DataType {
  return {
    name,
    oid,
    jsType: 'string',

    // See inet-type.ts: a MAC address is an ordinary string as far as
    // JavaScript is concerned, and inferring this type from one would
    // send `macaddr` where `text` was meant. Name it to reach it.
    inferrable: false,

    encodeText(v: any): string {
      // Handed over as written - the server parses every spelling.
      return '' + v;
    },

    encodeBinary(buf: SmartBuffer, v: any): void {
      const b = parseMacaddr(v, size);
      if (!b) throw new Error(`"${v}" is not a valid ${name} value`);
      buf.writeBytes(b);
    },

    decodeBinary(v: Buffer, offset: number = 0): string {
      let out = v.toString('hex', offset, offset + 1);
      let i: number;
      for (i = 1; i < size; i++)
        out += ':' + v.toString('hex', offset + i, offset + i + 1);
      return out;
    },

    decodeText(v: string): string {
      return v;
    },

    // Hex and colons - see inet-type.ts for why 'latin1'.
    decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
      return buf.toString('latin1', offset, offset + len);
    },

    isType(v: any): boolean {
      return !!parseMacaddr(v, size);
    },
  };
}

export const MacaddrType: DataType = createType(
  'macaddr',
  DataTypeOIDs.macaddr,
  6,
);

export const ArrayMacaddrType: DataType = {
  ...MacaddrType,
  name: '_macaddr',
  oid: DataTypeOIDs._macaddr,
  elementsOID: DataTypeOIDs.macaddr,
};

export const Macaddr8Type: DataType = createType(
  'macaddr8',
  DataTypeOIDs.macaddr8,
  8,
);

export const ArrayMacaddr8Type: DataType = {
  ...Macaddr8Type,
  name: '_macaddr8',
  oid: DataTypeOIDs._macaddr8,
  elementsOID: DataTypeOIDs.macaddr8,
};
