import { expect } from 'expect';
import { BindParam } from '../../src/connection/bind-param.js';
import { DataTypeOIDs } from '../../src/constants.js';
import { QueryRequest, sql } from '../../src/util/sql-tag.js';

describe('sql`` tag', () => {
  it('should turn interpolated values into parameters', () => {
    const req = sql`select * from t where a = ${1} and b = ${'x'}`;
    expect(req).toBeInstanceOf(QueryRequest);
    expect(req.sql).toStrictEqual('select * from t where a = $1 and b = $2');
    expect(req.params).toStrictEqual([1, 'x']);
  });

  it('should never write a value into the text', () => {
    // The whole point: a value cannot be read as SQL, whatever it contains.
    const evil = `x'; drop table t; --`;
    const req = sql`select ${evil}`;
    expect(req.sql).toStrictEqual('select $1');
    expect(req.sql).not.toContain('drop table');
  });

  it('should splice a nested fragment and renumber its parameters', () => {
    const filter = sql`where city = ${'izmir'} and age > ${18}`;
    const req = sql`select ${'name'} from t ${filter} limit ${10}`;
    expect(req.sql).toStrictEqual(
      'select $1 from t where city = $2 and age > $3 limit $4',
    );
    expect(req.params).toStrictEqual(['name', 'izmir', 18, 10]);
  });

  it('should treat an empty fragment as nothing', () => {
    const req = sql`select 1 ${sql``}`;
    expect(req.sql).toStrictEqual('select 1 ');
    expect(req.params).toStrictEqual([]);
  });

  it('should renumber past $9 correctly', () => {
    const inner = sql`${1} ${2} ${3} ${4} ${5} ${6} ${7} ${8} ${9} ${10}`;
    const req = sql`select ${0}, ${inner}`;
    expect(req.sql).toStrictEqual('select $1, $2 $3 $4 $5 $6 $7 $8 $9 $10 $11');
    expect(req.params.length).toStrictEqual(11);
  });

  describe('stringify()', () => {
    it('should write values as literals with an explicit cast', () => {
      expect(sql`select ${42}`.stringify()).toStrictEqual("select '42'::int4");
      expect(sql`select ${true}`.stringify()).toStrictEqual("select 't'::bool");
    });

    it('should escape a value that tries to break out', () => {
      const out = sql`select ${`x'; drop table t; --`}`.stringify();
      // Doubled quote keeps it one literal.
      expect(out).toStrictEqual("select 'x''; drop table t; --'::varchar");
    });

    it('should write null without a cast', () => {
      expect(sql`select ${null}`.stringify()).toStrictEqual('select null');
    });

    it('should write an array as an ARRAY literal', () => {
      expect(sql`select ${[1, 2]}`.stringify()).toStrictEqual(
        "select ARRAY['1','2']::_int4",
      );
    });

    it('should leave a parameterless statement untouched', () => {
      expect(sql`select 1`.stringify()).toStrictEqual('select 1');
    });

    it('should leave a $N placeholder untouched when N is out of range', () => {
      const req = new QueryRequest('select $99', [1, 2]);
      expect(req.stringify()).toStrictEqual('select $99');
    });

    it('should refuse a value it cannot encode rather than guess', () => {
      // Silently producing something plausible is how wrong data gets
      // written. A symbol resolves to the `unknown` type, which has no text
      // encoding, so it has to say so.
      expect(() => sql`select ${Symbol('x')}`.stringify()).toThrow(
        /has no text encoding/,
      );
    });

    it('should encode a value the same way the parameter path would', () => {
      // stringify() resolves the type through the same type map query()
      // uses, so neither path can quietly disagree with the other - an
      // object maps to json in both.
      expect(sql`select ${{ a: 1 }}`.stringify()).toStrictEqual(
        `select '{"a":1}'::json`,
      );
    });

    it("should use a BindParam value's own oid instead of inferring one", () => {
      // A plain `true` would infer bool - wrapping it in a BindParam with
      // int4's oid forces the int4 encoding instead.
      const req = sql`select ${new BindParam(DataTypeOIDs.int4, 42)}`;
      expect(req.stringify()).toStrictEqual("select '42'::int4");
    });

    it('should write a null element inside an array literal as null, unescaped', () => {
      expect(sql`select ${[1, null, 3]}`.stringify()).toStrictEqual(
        "select ARRAY['1',null,'3']::_int4",
      );
    });

    it('should wrap a scalar in a single-element array when the oid names an array type', () => {
      const req = sql`select ${new BindParam(DataTypeOIDs._int4, 5)}`;
      expect(req.stringify()).toStrictEqual("select ARRAY['5']::_int4");
    });

    it('should fall back to the oid and describe()\'s own "object" default when nothing else is available', () => {
      // An unregistered oid leaves `dataType` undefined (so its name can't
      // be used in the message - the oid itself is reported instead), and
      // a null-prototype object has no constructor to name either.
      const req = sql`select ${new BindParam(999999, Object.create(null))}`;
      expect(() => req.stringify()).toThrow(
        /Cannot write object into a statement as a literal: data type "999999" has no text encoding/,
      );
    });

    it("should describe() a plain object by its constructor's own name", () => {
      const req = sql`select ${new BindParam(999999, {})}`;
      expect(() => req.stringify()).toThrow(
        /Cannot write Object into a statement as a literal/,
      );
    });
  });

  describe('sql.ident()', () => {
    it('should quote a name so it is written as an identifier', () => {
      const req = sql`select ${sql.ident('name')} from ${sql.ident('t')}`;
      expect(req.sql).toStrictEqual('select "name" from "t"');
      expect(req.params).toStrictEqual([]);
    });

    it('should keep a hostile name as a single identifier', () => {
      // An identifier cannot be a parameter, so quoting is the only thing
      // standing between a dynamic name and an injection.
      const req = sql`select ${sql.ident('a"; drop table u; --')} from u`;
      expect(req.sql).toStrictEqual('select "a""; drop table u; --" from u');
    });

    it('should refuse a NUL byte', () => {
      expect(() => sql.ident('a\0b')).toThrow(/NUL/);
    });
  });

  describe('sql.values()', () => {
    it('should build the column list and VALUES clause', () => {
      const req = sql`insert into u ${sql.values({ id: 1, name: 'ada' })}`;
      expect(req.sql).toStrictEqual(
        'insert into u ("id","name") values ($1,$2)',
      );
      expect(req.params).toStrictEqual([1, 'ada']);
    });

    it('should build a multi-row insert from an array', () => {
      const req = sql`insert into u ${sql.values([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ])}`;
      expect(req.sql).toStrictEqual(
        'insert into u ("id","name") values ($1,$2),($3,$4)',
      );
      expect(req.params).toStrictEqual([1, 'a', 2, 'b']);
    });

    it('should write only the listed columns', () => {
      // Without the list, a request body could add a column of its own.
      const body = { id: 1, name: 'ada', is_admin: true };
      const req = sql`insert into u ${sql.values(body, ['id', 'name'])}`;
      expect(req.sql).toStrictEqual(
        'insert into u ("id","name") values ($1,$2)',
      );
      expect(req.params).toStrictEqual([1, 'ada']);
    });

    it('should renumber correctly after an earlier parameter', () => {
      const req = sql`insert into ${sql.ident('u')} ${sql.values({ id: 1 })} returning ${'x'}`;
      expect(req.sql).toStrictEqual(
        'insert into "u" ("id") values ($1) returning $2',
      );
    });

    it('should refuse empty input', () => {
      expect(() => sql.values([])).toThrow(/at least one row/);
      expect(() => sql.values({})).toThrow(/at least one column/);
    });
  });

  describe('sql.set()', () => {
    it('should build the assignment list', () => {
      const req = sql`update u set ${sql.set({ city: 'izmir' })} where id = ${1}`;
      expect(req.sql).toStrictEqual('update u set "city" = $1 where id = $2');
      expect(req.params).toStrictEqual(['izmir', 1]);
    });

    it('should write only the listed columns', () => {
      const req = sql`update u set ${sql.set({ city: 'x', is_admin: true }, ['city'])}`;
      expect(req.sql).toStrictEqual('update u set "city" = $1');
      expect(req.params).toStrictEqual(['x']);
    });

    it('should refuse empty input', () => {
      expect(() => sql.set({})).toThrow(/at least one column/);
    });
  });
});
