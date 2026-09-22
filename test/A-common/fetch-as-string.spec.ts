import { expect } from 'expect';
import { DataTypeMap, DataTypeOIDs, GlobalTypeMap } from 'postgrejs';
import {
  fetchAsStringEqual,
  fetchAsStringNamesElement,
  fetchAsStringNamesOid,
  validateFetchAsString,
} from '../../src/util/fetch-as-string.js';

const D = DataTypeOIDs;

/**
 * `fetchAsString` takes an OID on its own or `{ oid, arrays }`. A bare
 * OID keeps meaning exactly what it did - the type, and columns of
 * arrays of it - and the selector is how a caller asks for the scalar
 * and leaves the arrays alone.
 */
describe('fetchAsString selectors', () => {
  describe('which columns a list names', () => {
    it('should name an OID in either form', () => {
      expect(fetchAsStringNamesOid([D.numeric], D.numeric)).toStrictEqual(true);
      expect(
        fetchAsStringNamesOid([{ oid: D.numeric }], D.numeric),
      ).toStrictEqual(true);
      expect(
        fetchAsStringNamesOid([{ oid: D.numeric, arrays: false }], D.numeric),
      ).toStrictEqual(true);
      expect(fetchAsStringNamesOid([D.int4], D.numeric)).toStrictEqual(false);
      expect(fetchAsStringNamesOid(undefined, D.numeric)).toStrictEqual(false);
    });

    it('should reach an array column through its element by default', () => {
      expect(fetchAsStringNamesElement([D.numeric], D.numeric)).toStrictEqual(
        true,
      );
      expect(
        fetchAsStringNamesElement([{ oid: D.numeric }], D.numeric),
      ).toStrictEqual(true);
      expect(
        fetchAsStringNamesElement(
          [{ oid: D.numeric, arrays: true }],
          D.numeric,
        ),
      ).toStrictEqual(true);
    });

    it('should stop at the scalar when the selector says so', () => {
      expect(
        fetchAsStringNamesElement(
          [{ oid: D.numeric, arrays: false }],
          D.numeric,
        ),
      ).toStrictEqual(false);
      // ...and the array's own OID still selects it, which is a
      // different ask and untouched by the flag.
      expect(
        fetchAsStringNamesOid(
          [{ oid: D.numeric, arrays: false }, D._numeric],
          D._numeric,
        ),
      ).toStrictEqual(true);
    });
  });

  describe('validation', () => {
    it('should refuse ranges: true, which is not honoured yet', () => {
      expect(() =>
        validateFetchAsString([{ oid: D.numeric, ranges: true }]),
      ).toThrow(/does not reach range columns/);
      // false is what happens anyway, so it is not an error.
      expect(() =>
        validateFetchAsString([{ oid: D.numeric, ranges: false }]),
      ).not.toThrow();
    });

    it('should refuse a selector on an array type', () => {
      // The flags describe what happens to a type's array columns, so
      // naming the array type and then talking about its arrays is not
      // an ask anything can honour.
      expect(() =>
        validateFetchAsString(
          [{ oid: D._numeric, arrays: false }],
          GlobalTypeMap,
        ),
      ).toThrow(/is an array type/);
      // Without a type map there is nothing to tell array types apart,
      // and the list is left alone rather than guessed at.
      expect(() =>
        validateFetchAsString([{ oid: D._numeric, arrays: false }]),
      ).not.toThrow();
    });

    it('should name a custom array type by its OID alone', () => {
      const map = new DataTypeMap(GlobalTypeMap);
      map.register({
        ...GlobalTypeMap.get(D._numeric),
        oid: 987654,
        name: 'mine',
        elementsOID: D.numeric,
      });
      expect(() =>
        validateFetchAsString([{ oid: 987654, arrays: false }], map),
      ).toThrow(/987654 is an array type/);
    });

    it('should refuse an entry that is neither an OID nor a selector', () => {
      expect(() => validateFetchAsString(['numeric' as any])).toThrow(
        /takes an OID or/,
      );
      expect(() => validateFetchAsString([null as any])).toThrow(
        /takes an OID or/,
      );
    });

    it('should leave a list of plain OIDs alone', () => {
      expect(() =>
        validateFetchAsString([D.numeric, D._numeric], GlobalTypeMap),
      ).not.toThrow();
      expect(() => validateFetchAsString(undefined)).not.toThrow();
    });
  });
});

describe('fetchAsStringEqual()', () => {
  it('should treat absent and empty as the same list', () => {
    expect(fetchAsStringEqual(undefined, undefined)).toStrictEqual(true);
    expect(fetchAsStringEqual(undefined, [])).toStrictEqual(true);
    expect(fetchAsStringEqual([], undefined)).toStrictEqual(true);
    expect(fetchAsStringEqual(undefined, [25])).toStrictEqual(false);
  });

  it('should compare contents, not identity', () => {
    expect(fetchAsStringEqual([25, 114], [25, 114])).toStrictEqual(true);
    expect(fetchAsStringEqual([25, 114], [114, 25])).toStrictEqual(false);
    expect(fetchAsStringEqual([25], [25, 114])).toStrictEqual(false);
  });

  it('should tell a selector apart from the bare OID it narrows', () => {
    // This is what keeps one query's parsers from being handed to the
    // other: the two lists select different columns, and the format
    // codes alone cannot say so.
    expect(fetchAsStringEqual([D.numeric], [{ oid: D.numeric }])).toStrictEqual(
      true,
    );
    expect(
      fetchAsStringEqual([D.numeric], [{ oid: D.numeric, arrays: true }]),
    ).toStrictEqual(true);
    expect(
      fetchAsStringEqual([D.numeric], [{ oid: D.numeric, arrays: false }]),
    ).toStrictEqual(false);
    expect(
      fetchAsStringEqual([{ oid: D.numeric, arrays: false }], [D.numeric]),
    ).toStrictEqual(false);
    expect(
      fetchAsStringEqual(
        [{ oid: D.numeric, arrays: false }],
        [{ oid: D.numeric, arrays: false }],
      ),
    ).toStrictEqual(true);
    expect(
      fetchAsStringEqual(
        [{ oid: D.numeric, arrays: false }],
        [{ oid: D.int4, arrays: false }],
      ),
    ).toStrictEqual(false);
    // `ranges` is compared as well, though nothing honours `true` yet:
    // the day it does, two different asks must already be telling
    // themselves apart here.
    expect(
      fetchAsStringEqual([{ oid: D.numeric, ranges: true }], [D.numeric]),
    ).toStrictEqual(false);
    expect(
      fetchAsStringEqual(
        [{ oid: D.numeric, ranges: true }],
        [{ oid: D.numeric }],
      ),
    ).toStrictEqual(false);
  });
});
