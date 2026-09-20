import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';

/**
 * `inet` and `cidr` share a file because they share everything that
 * matters: one wire format, one JavaScript shape, and one pair of
 * conversions. A single flag byte tells them apart on the wire, and on
 * output the only difference is whether the netmask is always printed.
 *
 * Both decode to a string. JavaScript has no address type, and every Node
 * API that takes an address - `net`, `dns`, `http` - takes a string, so an
 * object of parts would be something every caller has to join back
 * together before using. `pg` answers with a string too.
 */

/**
 * PostgreSQL's own address-family numbers, deliberately not the
 * platform's: they are written into the stored value, so they cannot
 * depend on how a particular `<sys/socket.h>` happens to number `AF_INET6`.
 */
const PGSQL_AF_INET = 2;
const PGSQL_AF_INET6 = 3;

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){0,3}$/;
const IPV6_GROUP_PATTERN = /^[0-9a-fA-F]{1,4}$/;

/**
 * Writes the four octets of an IPv4 address.
 *
 * Fewer than four is allowed, the rest reading as zero - `10/8` for
 * `10.0.0.0/8`. That is PostgreSQL's own rule for both types, confirmed
 * against the server rather than assumed: `inet '10.0/16'` is accepted
 * and stored as `10.0.0.0/16`.
 */
function writeIPv4(out: Buffer, offset: number, v: string): boolean {
  if (!IPV4_PATTERN.test(v)) return false;
  const parts = v.split('.');
  const l = parts.length;
  let i: number;
  let n: number;
  for (i = 0; i < l; i++) {
    n = +parts[i];
    if (n > 255) return false;
    out[offset + i] = n;
  }
  return true;
}

/**
 * Writes the sixteen bytes of an IPv6 address, accepting the two
 * shorthands the server does: a single `::` standing for at least one
 * all-zero group, and a trailing dotted-quad for the last two groups.
 */
function writeIPv6(out: Buffer, offset: number, v: string): boolean {
  const dot = v.indexOf('.');
  if (dot >= 0) {
    // An embedded IPv4 tail occupies the last two groups. Rewritten into
    // hex here so the group walk below does not have to know about it.
    const i = v.lastIndexOf(':', dot);
    if (i < 0) return false;
    const quad = Buffer.alloc(4);
    const tail = v.slice(i + 1);
    // Unlike a bare IPv4 address, the embedded form has no abbreviated
    // spelling - `::1.2` is not an address.
    if (tail.split('.').length !== 4 || !writeIPv4(quad, 0, tail)) return false;
    v =
      v.slice(0, i + 1) +
      quad.readUInt16BE(0).toString(16) +
      ':' +
      quad.readUInt16BE(2).toString(16);
  }
  const halves = v.split('::');
  if (halves.length > 2) return false;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const given = head.length + tail.length;
  // Without `::` every group must be written out; with it, at least one
  // must be left for the `::` itself to stand for.
  if (halves.length === 2 ? given > 7 : given !== 8) return false;
  out.fill(0, offset, offset + 16);
  let p = offset;
  let g: string;
  for (g of head) {
    if (!IPV6_GROUP_PATTERN.test(g)) return false;
    out.writeUInt16BE(parseInt(g, 16), p);
    p += 2;
  }
  p = offset + 16 - tail.length * 2;
  for (g of tail) {
    if (!IPV6_GROUP_PATTERN.test(g)) return false;
    out.writeUInt16BE(parseInt(g, 16), p);
    p += 2;
  }
  return true;
}

/**
 * Renders sixteen bytes the way `inet_net_ntop()` does, which is what
 * this has to match - not any general IPv6 convention - because the
 * point is to hand back the string the server itself would have printed.
 *
 * The longest run of zero groups collapses to `::`, but only when it
 * covers at least two of them (`::2:3:4:5:6:7:8` comes back from the
 * server as `0:2:3:4:5:6:7:8`), and the earliest run wins a tie. An
 * address whose last four bytes are really an IPv4 one is printed in
 * dotted form.
 */
function formatIPv6(buf: Buffer, offset: number): string {
  const words = new Array<number>(8);
  let i: number;
  for (i = 0; i < 8; i++) words[i] = buf.readUInt16BE(offset + i * 2);
  let bestBase = -1;
  let bestLen = 0;
  let curBase = -1;
  let curLen = 0;
  for (i = 0; i < 8; i++) {
    if (words[i] !== 0) {
      curBase = -1;
      continue;
    }
    if (curBase === -1) {
      curBase = i;
      curLen = 1;
    } else curLen++;
    if (curLen > bestLen) {
      bestBase = curBase;
      bestLen = curLen;
    }
  }
  if (bestLen < 2) bestBase = -1;
  let out = '';
  for (i = 0; i < 8; i++) {
    if (bestBase !== -1 && i >= bestBase && i < bestBase + bestLen) {
      if (i === bestBase) out += ':';
      continue;
    }
    if (i !== 0) out += ':';
    // `::a.b.c.d` and `::ffff:a.b.c.d` - the two prefixes that mean the
    // tail is an IPv4 address. Nothing else qualifies, so `::1:1.2.3.4`
    // prints as `::1:102:304`.
    if (
      i === 6 &&
      bestBase === 0 &&
      (bestLen === 6 || (bestLen === 5 && words[5] === 0xffff))
    ) {
      out +=
        buf[offset + 12] +
        '.' +
        buf[offset + 13] +
        '.' +
        buf[offset + 14] +
        '.' +
        buf[offset + 15];
      break;
    }
    out += words[i].toString(16);
  }
  // A run that reaches the end leaves only one colon behind.
  if (bestBase !== -1 && bestBase + bestLen === 8) out += ':';
  return out;
}

/**
 * The address and its netmask, or undefined if the string is not one.
 * Splitting is done here rather than by the caller because the two types
 * differ only in what they do with the parts.
 */
function parseAddress(
  v: string,
): Maybe<{ family: number; bits: number; bytes: Buffer }> {
  if (typeof v !== 'string') return undefined;
  const slash = v.indexOf('/');
  const addr = slash < 0 ? v : v.slice(0, slash);
  const family = addr.includes(':') ? PGSQL_AF_INET6 : PGSQL_AF_INET;
  const size = family === PGSQL_AF_INET6 ? 16 : 4;
  const bytes = Buffer.alloc(size);
  const ok =
    family === PGSQL_AF_INET6
      ? writeIPv6(bytes, 0, addr)
      : writeIPv4(bytes, 0, addr);
  if (!ok) return undefined;
  let bits = size * 8;
  if (slash >= 0) {
    const s = v.slice(slash + 1);
    if (!/^\d{1,3}$/.test(s)) return undefined;
    bits = +s;
    if (bits > size * 8) return undefined;
  }
  return { family, bits, bytes };
}

function encode(buf: SmartBuffer, v: any, isCidr: boolean): void {
  const a = parseAddress(v);
  if (!a)
    throw new Error(`"${v}" is not a valid ${isCidr ? 'cidr' : 'inet'} value`);
  buf.writeUInt8(a.family);
  // Unsigned: a full IPv6 mask is 128, which does not fit a signed byte.
  buf.writeUInt8(a.bits);
  buf.writeUInt8(isCidr ? 1 : 0);
  buf.writeUInt8(a.bytes.length);
  buf.writeBytes(a.bytes);
}

/**
 * Four header bytes - family, netmask bits, the cidr flag and the
 * address length - then the address itself. The flag is what decides
 * whether the netmask is printed, so one decoder serves both types: a
 * `cidr` always carries its mask, an `inet` only when it is not the whole
 * address.
 */
function decode(v: Buffer, offset: number): string {
  const family = v[offset];
  const bits = v[offset + 1];
  const isCidr = v[offset + 2];
  const size = v[offset + 3];
  if (family !== PGSQL_AF_INET && family !== PGSQL_AF_INET6)
    throw new Error(`Unknown address family ${family} in inet value`);
  const text =
    family === PGSQL_AF_INET6
      ? formatIPv6(v, offset + 4)
      : v[offset + 4] +
        '.' +
        v[offset + 5] +
        '.' +
        v[offset + 6] +
        '.' +
        v[offset + 7];
  return isCidr || bits !== size * 8 ? text + '/' + bits : text;
}

export const InetType: DataType = {
  name: 'inet',
  oid: DataTypeOIDs.inet,
  jsType: 'string',

  // An address is not a shape - it is a string like any other, and an
  // application storing one in a `text` column passes exactly the same
  // value. Inferring this type from a string would send `inet` where
  // `text` was meant and break that query, so the type is reached only by
  // naming it: `new BindParam(DataTypeOIDs.inet, '192.168.0.1')`, or a
  // column whose declared type says so.
  inferrable: false,

  encodeText(v: any): string {
    // Handed to the server as written; it does its own parsing here, and
    // accepts spellings this file's own parser is not asked to know.
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: any): void {
    encode(buf, v, false);
  },

  decodeBinary(v: Buffer, offset: number = 0): string {
    return decode(v, offset);
  },

  decodeText(v: string): string {
    return v;
  },

  // An address is pure ASCII, so 'latin1' decodes identically to 'utf8'
  // while skipping V8's multi-byte-sequence detection.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
    return buf.toString('latin1', offset, offset + len);
  },

  isType(v: any): boolean {
    return !!parseAddress(v);
  },
};

export const ArrayInetType: DataType = {
  ...InetType,
  name: '_inet',
  oid: DataTypeOIDs._inet,
  elementsOID: DataTypeOIDs.inet,
};

export const CidrType: DataType = {
  ...InetType,
  name: 'cidr',
  oid: DataTypeOIDs.cidr,

  encodeBinary(buf: SmartBuffer, v: any): void {
    encode(buf, v, true);
  },
};

export const ArrayCidrType: DataType = {
  ...CidrType,
  name: '_cidr',
  oid: DataTypeOIDs._cidr,
  elementsOID: DataTypeOIDs.cidr,
};
