import { expect } from 'expect';
import {
  isTransactionCommand,
  refusesSavepoint,
} from '../../src/util/transaction-command.js';

describe('transaction command classification', () => {
  it('should recognize the commands that open or close a transaction', () => {
    for (const sql of [
      'BEGIN',
      'begin isolation level serializable',
      'START TRANSACTION',
      'COMMIT',
      'ROLLBACK',
      'ROLLBACK TO SAVEPOINT a',
      'SAVEPOINT a',
      'RELEASE SAVEPOINT a',
    ]) {
      expect([sql, isTransactionCommand(sql)]).toStrictEqual([sql, true]);
    }
    expect(isTransactionCommand('select 1')).toStrictEqual(false);
    expect(isTransactionCommand('SET TRANSACTION READ ONLY')).toStrictEqual(
      false,
    );
  });

  it('should see a command behind a comment a tracer put in front', () => {
    expect(isTransactionCommand("/*app='x'*/ COMMIT")).toStrictEqual(true);
    expect(isTransactionCommand('/* a */ /* b */\nBEGIN')).toStrictEqual(true);
    expect(isTransactionCommand('-- note\nROLLBACK')).toStrictEqual(true);
    expect(isTransactionCommand('  \n\tCOMMIT')).toStrictEqual(true);
    expect(
      refusesSavepoint("/*app='x'*/ SET TRANSACTION READ ONLY"),
    ).toStrictEqual(true);
    expect(isTransactionCommand('/* commit */ select 1')).toStrictEqual(false);
    expect(isTransactionCommand('-- BEGIN')).toStrictEqual(false);
  });

  it('should answer quickly for a long run of whitespace that leads nowhere', () => {
    const sql = ' '.repeat(100_000) + 'x';
    const start = performance.now();
    expect(isTransactionCommand(sql)).toStrictEqual(false);
    expect(refusesSavepoint(sql)).toStrictEqual(false);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
