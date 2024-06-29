import { escapeLiteral } from 'postgresql-client';

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
});
