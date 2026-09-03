import { expect } from 'expect';
import { escapeLiteral } from 'postgrejs';

describe('Escape literal', () => {
  function testLiteral(str: string, required: string): void {
    expect(escapeLiteral(str)).toStrictEqual(required);
  }

  it('No special characters', () => {
    testLiteral('hello world', "'hello world'");
  });

  it('Contains double quotes only', () => {
    testLiteral('hello " world', "'hello \" world'");
  });

  it('Contains single quotes only', () => {
    testLiteral("hello ' world", "'hello '' world'");
  });

  it('Contains backslashes only', () => {
    testLiteral('hello \\ world', " E'hello \\\\ world'");
  });

  it('Contains single quotes and double quotes', () => {
    testLiteral('hello \' " world', "'hello '' \" world'");
  });

  it('Contains double quotes and backslashes', () => {
    testLiteral('hello \\ " world', " E'hello \\\\ \" world'");
  });

  it('Contains single quotes and backslashes', () => {
    testLiteral("hello \\ ' world", " E'hello \\\\ '' world'");
  });

  it('Contains single quotes, double quotes, and backslashes', () => {
    testLiteral('hello \\ \' " world', " E'hello \\\\ '' \" world'");
  });

  it('Throws on embedded NUL byte', () => {
    // Regression test: PostgreSQL's simple-query protocol frames the SQL
    // text as a C-string, so an embedded \0 can never be represented in a
    // literal - it must fail fast here instead of producing a malformed
    // message that the server rejects with a cryptic protocol error.
    expect(() => escapeLiteral('hello \0 world')).toThrow(/NUL/);
  });
});
