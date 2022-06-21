import assert from "assert";
import "../_support/env";
import { escapeLiteral } from "../../src";

describe("Escape literal", function () {
  function testLiteral(str: string, required: string): void {
    assert.strictEqual(escapeLiteral(str), required);
  }

  it("No special characters", function () {
    testLiteral("hello world", "'hello world'");
  });

  it("Contains double quotes only", function () {
    testLiteral('hello " world', "'hello \" world'");
  });

  it("Contains single quotes only", function () {
    testLiteral("hello ' world", "'hello '' world'");
  });

  it("Contains backslashes only", function () {
    testLiteral("hello \\ world", " E'hello \\\\ world'");
  });

  it("Contains single quotes and double quotes", function () {
    testLiteral("hello ' \" world", "'hello '' \" world'");
  });

  it("Contains double quotes and backslashes", function () {
    testLiteral('hello \\ " world', " E'hello \\\\ \" world'");
  });

  it("Contains single quotes and backslashes", function () {
    testLiteral("hello \\ ' world", " E'hello \\\\ '' world'");
  });

  it("Contains single quotes, double quotes, and backslashes", function () {
    testLiteral("hello \\ ' \" world", " E'hello \\\\ '' \" world'");
  });
});
