import { expect } from 'expect';
import { startsTransaction } from '../../src/util/starts-transaction.js';

describe('startsTransaction()', () => {
  const opens = [
    'BEGIN',
    'begin',
    '  begin  ',
    'BEGIN;',
    'BEGIN ISOLATION LEVEL SERIALIZABLE',
    'START TRANSACTION',
    'start   transaction read only',
    'start\n\ttransaction',
    // Not the first statement - execute() runs whole scripts.
    'select 1; begin;',
    'insert into t values (1); START TRANSACTION;',
    // Comments before it must not hide it.
    '/* wrap this */ BEGIN',
    '-- open a transaction\nBEGIN',
    '/* nested /* comment */ still a comment */ begin',
    '\n\n  -- lead\n  /* more */\n  begin',
  ];

  const doesNotOpen = [
    'select 1',
    'commit',
    'rollback',
    'savepoint sp1',
    'release savepoint sp1',
    // The word appears, but only as data or a name.
    "select 'begin'",
    "select 'start transaction' as s",
    "select * from t where note = 'begin'",
    'select begin_at from t',
    'select t.xbegin from t',
    'select "begin" from t',
    // ...or inside a comment.
    '-- begin\nselect 1',
    '/* begin */ select 1',
    // PL/pgSQL block bodies: this BEGIN is a block, not a transaction.
    'DO $$ BEGIN raise notice 3; END $$',
    'DO $tag$ BEGIN perform 1; END $tag$',
    'create function f() returns int as $$ begin return 1; end $$ language plpgsql',
    // 'start' without 'transaction'
    'select start from schedule',
    // The cheap pre-filter rejects these outright.
    'select * from customers where id = $1',
    'update t set a = 1',
  ];

  for (const sql of opens) {
    it(`detects: ${JSON.stringify(sql)}`, () => {
      expect(startsTransaction(sql)).toBe(true);
    });
  }

  for (const sql of doesNotOpen) {
    it(`ignores: ${JSON.stringify(sql)}`, () => {
      expect(startsTransaction(sql)).toBe(false);
    });
  }
});
