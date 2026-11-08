import { expect } from 'expect';
import { CidrType, InetType } from '../../src/data-types/inet-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function wire(t: typeof InetType, v: any): string {
  const buf = new SmartBuffer();
  t.encodeBinary!(buf, v, {});
  // `buffer` is the whole allocation, `size` is how much of it was written.
  return buf.buffer.toString('hex', 0, buf.size);
}

function roundTrip(t: typeof InetType, v: any): string {
  const buf = new SmartBuffer();
  t.encodeBinary!(buf, v, {});
  return t.decodeBinary!(buf.buffer, 0, buf.size, {});
}

function decodeHex(hex: string): string {
  const buf = Buffer.from(hex, 'hex');
  return InetType.decodeBinary!(buf, 0, buf.length, {});
}

describe('InetType / CidrType', () => {
  describe('encodeBinary()', () => {
    // Four header bytes - family, netmask bits, cidr flag, address
    // length - then the address. Every expectation below is a string the
    // live server produced for the same literal.
    it('should write the four-byte header and the IPv4 address', () => {
      expect(wire(InetType, '192.168.0.1')).toStrictEqual('02200004c0a80001');
      expect(wire(InetType, '192.168.0.1/24')).toStrictEqual(
        '02180004c0a80001',
      );
    });

    it('should write the four-byte header and the IPv6 address', () => {
      expect(wire(InetType, '2001:4f8:3:ba::/64')).toStrictEqual(
        '03400010200104f8000300ba0000000000000000',
      );
    });

    it('should raise the cidr flag only for cidr', () => {
      expect(wire(InetType, '192.168.1.0/24')).toStrictEqual(
        '02180004c0a80100',
      );
      expect(wire(CidrType, '192.168.1.0/24')).toStrictEqual(
        '02180104c0a80100',
      );
    });

    it('should write a full IPv6 mask, which does not fit a signed byte', () => {
      expect(wire(InetType, '::1').slice(0, 8)).toStrictEqual('03800010');
    });

    it('should fill in the octets an abbreviated IPv4 address leaves out', () => {
      // What the server does with the same literal: `inet '10/8'` is
      // stored as 10.0.0.0/8.
      expect(wire(InetType, '10/8')).toStrictEqual('020800040a000000');
      expect(wire(InetType, '10.0/16')).toStrictEqual('021000040a000000');
    });

    it('should expand "::" wherever it appears', () => {
      expect(roundTrip(InetType, '1::8')).toStrictEqual('1::8');
      expect(roundTrip(InetType, '::')).toStrictEqual('::');
      expect(roundTrip(InetType, 'fe80::1/10')).toStrictEqual('fe80::1/10');
    });

    it('should read a trailing dotted quad as the last two groups', () => {
      expect(wire(InetType, '::ffff:1.2.3.4')).toStrictEqual(
        '0380001000000000000000000000ffff01020304',
      );
    });

    it('should refuse a value that is not an address', () => {
      expect(() => wire(InetType, 'not an address')).toThrow(
        'not a valid inet',
      );
      expect(() => wire(CidrType, 'not an address')).toThrow(
        'not a valid cidr',
      );
      expect(() => wire(InetType, 42)).toThrow('not a valid inet');
    });

    it('should refuse an out-of-range octet, group or mask', () => {
      expect(() => wire(InetType, '192.168.0.256')).toThrow();
      expect(() => wire(InetType, '::fffff')).toThrow();
      expect(() => wire(InetType, '192.168.0.1/33')).toThrow();
      expect(() => wire(InetType, '::1/129')).toThrow();
    });

    it('should refuse an IPv6 address with the wrong number of groups', () => {
      expect(() => wire(InetType, '1:2:3:4:5:6:7')).toThrow();
      expect(() => wire(InetType, '1:2:3:4:5:6:7:8:9')).toThrow();
      // "::" has to stand for at least one group of its own.
      expect(() => wire(InetType, '1:2:3:4:5:6:7:8::')).toThrow();
      expect(() => wire(InetType, '1::2::3')).toThrow();
    });

    it('should refuse an embedded IPv4 address that is abbreviated or misplaced', () => {
      expect(() => wire(InetType, '::1.2')).toThrow();
      expect(() => wire(InetType, '1.2.3.4:5')).toThrow();
    });
  });

  describe('decodeBinary()', () => {
    // Each hex string here is what the live server sent for the literal
    // named in the test, and each expectation is what it printed for it.
    it('should print an IPv4 mask only when it is not the whole address', () => {
      expect(decodeHex('02200004c0a80001')).toStrictEqual('192.168.0.1');
      expect(decodeHex('02180004c0a80001')).toStrictEqual('192.168.0.1/24');
      expect(decodeHex('0200000400000000')).toStrictEqual('0.0.0.0/0');
    });

    it('should always print a cidr mask, whole address or not', () => {
      expect(decodeHex('02200104c0a80101')).toStrictEqual('192.168.1.1/32');
      expect(decodeHex('02180104c0a80100')).toStrictEqual('192.168.1.0/24');
    });

    it('should collapse the longest run of zero groups', () => {
      expect(
        decodeHex('0380001020010db8000000000001000000000001'),
      ).toStrictEqual('2001:db8::1:0:0:1');
      expect(
        decodeHex('0380001000010000000000020000000000000003'),
      ).toStrictEqual('1:0:0:2::3');
    });

    it('should leave a single zero group uncollapsed', () => {
      // `::2:3:4:5:6:7:8` is what goes in; `0:2:3:4:5:6:7:8` is what the
      // server prints back, because one group is not worth a "::".
      expect(
        decodeHex('0380001000000002000300040005000600070008'),
      ).toStrictEqual('0:2:3:4:5:6:7:8');
    });

    it('should close a run that reaches either end', () => {
      expect(
        decodeHex('0380001000000000000000000000000000000000'),
      ).toStrictEqual('::');
      expect(
        decodeHex('0380001000010000000000000000000000000008'),
      ).toStrictEqual('1::8');
      expect(
        decodeHex('03400010200104f8000300ba0000000000000000'),
      ).toStrictEqual('2001:4f8:3:ba::/64');
    });

    it('should print an embedded IPv4 address in dotted form', () => {
      expect(
        decodeHex('0380001000000000000000000000000001020304'),
      ).toStrictEqual('::1.2.3.4');
      expect(
        decodeHex('0380001000000000000000000000ffff00000000'),
      ).toStrictEqual('::ffff:0.0.0.0');
    });

    it('should print anything else as groups, however IPv4 it looks', () => {
      // `0:0:0:0:0:1:1.2.3.4` - the prefix is neither all-zero nor
      // ::ffff, so the server prints hex, and so does this.
      expect(
        decodeHex('0380001000000000000000000000000101020304'),
      ).toStrictEqual('::1:102:304');
    });

    it('should refuse an address family it does not know', () => {
      expect(() => decodeHex('0a200004c0a80001')).toThrow(
        'Unknown address family',
      );
    });
  });

  describe('isType()', () => {
    it('should accept every form it can encode', () => {
      expect(InetType.isType('192.168.0.1')).toStrictEqual(true);
      expect(InetType.isType('192.168.0.1/24')).toStrictEqual(true);
      expect(InetType.isType('::1')).toStrictEqual(true);
      expect(InetType.isType('10/8')).toStrictEqual(true);
    });

    it('should refuse a string that is not an address, and a non-string', () => {
      expect(InetType.isType('hello')).toStrictEqual(false);
      expect(InetType.isType('192.168.0.1/33')).toStrictEqual(false);
      expect(InetType.isType(42)).toStrictEqual(false);
      expect(InetType.isType(null)).toStrictEqual(false);
    });

    it('should not be offered to inference, truthful though it is', () => {
      // Otherwise an ordinary string bound for a text column would go out
      // declared `inet` and be rejected by the server.
      expect(InetType.inferrable).toStrictEqual(false);
      expect(CidrType.inferrable).toStrictEqual(false);
    });
  });

  it('should hand the text path over to the server as written', () => {
    expect(InetType.encodeText!('10/8', {})).toStrictEqual('10/8');
    expect(InetType.decodeText!('192.168.0.1/24', {})).toStrictEqual(
      '192.168.0.1/24',
    );
    const buf = Buffer.from('  192.168.0.1  ');
    expect(InetType.decodeTextBuffer!(buf, 2, 11, {})).toStrictEqual(
      '192.168.0.1',
    );
  });
});
