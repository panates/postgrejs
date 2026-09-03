import { expect } from 'expect';
import type { FieldInfo } from '../../src/interfaces/field-info.js';
import { convertRowToObject } from '../../src/util/convert-row-to-object.js';

function field(fieldName: string): FieldInfo {
  return { fieldName } as FieldInfo;
}

describe('convertRowToObject', () => {
  it('should map fields to row values', () => {
    const row = convertRowToObject([field('a'), field('b')], [1, 2]);
    expect(row).toStrictEqual({ a: 1, b: 2 });
  });

  it('should not pollute Object.prototype for a column named "__proto__"', () => {
    // Regression test: a plain out[fieldName] = value assignment on a
    // column literally named "__proto__" (e.g. `select x as "__proto__"`)
    // reassigns the object's prototype instead of creating an own property.
    const row: any = convertRowToObject(
      [field('__proto__')],
      [{ polluted: true }],
    );
    expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true);
    expect(row.__proto__).toStrictEqual({ polluted: true });
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('should not break for a column named "constructor"', () => {
    const row: any = convertRowToObject([field('constructor')], ['x']);
    expect(row.constructor).toStrictEqual('x');
  });
});
