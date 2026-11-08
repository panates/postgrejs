import { expect } from 'expect';
import { DataTypeOIDs, GlobalTypeMap } from 'postgrejs';

/**
 * float4 decoding shortens the double back to the decimal PostgreSQL would
 * print. The arithmetic route that makes it affordable has two edges the
 * plain string route does not: powers of ten stop being exact in a double
 * past 1e22, and a value sitting exactly halfway rounds one way through
 * Math.round() and the other through dtoa. Both hand off to the string
 * route, and these pin that they do.
 */
describe('float4 shortest form', () => {
  const reg: any = GlobalTypeMap.get(DataTypeOIDs.float4);
  const buf = Buffer.alloc(4);

  const decode = (v: number): number => {
    buf.writeFloatBE(v, 0);
    return reg.decodeBinary(buf, 0, 4, {});
  };
  /** What the value would be through toPrecision() alone. */
  const viaString = (v: number): number => {
    buf.writeFloatBE(v, 0);
    const raw = buf.readFloatBE(0);
    if (!Number.isFinite(raw)) return raw;
    for (let p = 7; p <= 9; p++) {
      const r = Number(raw.toPrecision(p));
      if (Math.fround(r) === raw) return r;
    }
    return raw;
  };

  it('should shorten to what the server would print', () => {
    expect(decode(1.1)).toStrictEqual(1.1);
    expect(decode(0.1)).toStrictEqual(0.1);
    expect(decode(3.14159)).toStrictEqual(3.14159);
    expect(decode(12345.678)).toStrictEqual(12345.678);
    expect(decode(1e-7)).toStrictEqual(1e-7);
    expect(decode(-2.5)).toStrictEqual(-2.5);
  });

  it('should agree with the string route on exact halves', () => {
    // Scaled by its power of ten these land on .5, where Math.round()
    // breaks the tie away from zero and dtoa breaks it to even.
    for (const v of [
      -2439344.25, -1841795.75, -237109.875, -3986469.25, -3715221.75,
    ]) {
      expect(decode(v)).toStrictEqual(viaString(v));
    }
  });

  it('should agree with the string route past the exact power-of-ten range', () => {
    // 1e22 is the last power of ten a double holds exactly, so anything
    // needing a larger one takes the string route instead.
    for (const v of [1e20, 3.4e38, 1.2345678e30, 1e-40, 1.401298e-45]) {
      expect(decode(v)).toStrictEqual(viaString(v));
    }
  });

  it('should agree with the string route around the magnitude cutoffs', () => {
    for (const v of [1e-14, 9e-15, 1e28, 9e27, 1e-13, 1e27]) {
      expect(decode(v)).toStrictEqual(viaString(v));
    }
  });

  it('should keep integers, infinities and NaN as they are', () => {
    expect(decode(7)).toStrictEqual(7);
    expect(decode(16777216)).toStrictEqual(16777216);
    expect(decode(-16777216)).toStrictEqual(-16777216);
    expect(decode(Infinity)).toStrictEqual(Infinity);
    expect(decode(-Infinity)).toStrictEqual(-Infinity);
    expect(decode(NaN)).toStrictEqual(NaN);
  });

  it('should keep negative zero negative', () => {
    // toPrecision() drops the sign of -0, so the string route alone would
    // turn it into +0; the integer shortcut returns it untouched instead.
    expect(Object.is(decode(-0), -0)).toStrictEqual(true);
    expect(Object.is(decode(0), 0)).toStrictEqual(true);
  });

  it('should read back as the same float4 for every bit pattern it meets', () => {
    // The property that matters, over a sweep of exponents and mantissas:
    // whatever decimal comes out has to be the same float4 going back in.
    let checked = 0;
    for (let exp = 1; exp < 255; exp += 3) {
      for (const m of [0, 1, 0x400000, 0x7fffff, 0x123456, 0x2aaaaa]) {
        for (const sign of [0, 1]) {
          buf.writeUInt32BE(((sign << 31) | (exp << 23) | m) >>> 0, 0);
          const raw = buf.readFloatBE(0);
          if (!Number.isFinite(raw)) continue;
          const out = reg.decodeBinary(buf, 0, 4, {});
          expect(Math.fround(out)).toStrictEqual(raw);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(900);
  });
});
