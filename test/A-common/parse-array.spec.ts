import { parsePostgresArray } from "../../src/util/parse-array.js";

describe("Parse PostgreSQL arrays", function () {
  it("should parse simple array string", async function () {
    const arr = parsePostgresArray("{1,2}");
    expect(arr).toStrictEqual(["1", "2"]);
  });

  it("should keep spaces", async function () {
    const arr = parsePostgresArray("{1 , 2}");
    expect(arr).toStrictEqual(["1 ", " 2"]);
  });

  it("should detect null value", async function () {
    const arr = parsePostgresArray("{1,NULL}");
    expect(arr).toStrictEqual(["1", null]);
  });

  it("should not transform to null if value in double quote", async function () {
    const arr = parsePostgresArray('{1,"NULL"}');
    expect(arr).toStrictEqual(["1", "NULL"]);
  });

  it("should not transform to null if value in single quote", async function () {
    const arr = parsePostgresArray("{1,'NULL'}");
    expect(arr).toStrictEqual(["1", "NULL"]);
  });

  it("should ignore separator and curly brackets characters in a quote", async function () {
    const arr = parsePostgresArray('{1,"{,}"}');
    expect(arr).toStrictEqual(["1", "{,}"]);
  });

  it("should escape with backslash", async function () {
    const arr = parsePostgresArray('{1\\,2,"\\""}');
    expect(arr).toStrictEqual(["1,2", '"']);
  });

  it("should escape with backslash in quote", async function () {
    const arr = parsePostgresArray('{1,"\\"\\\\"}');
    expect(arr).toStrictEqual(["1", '"\\']);
  });

  it("should call transform callback", async function () {
    const arr = parsePostgresArray("{1,2,NULL}", {transform: (s) => parseInt(s, 10)});
    expect(arr).toStrictEqual([1, 2, null]);
  });

  it("should parse multi dimensional array string", async function () {
    const arr = parsePostgresArray("{{{t,f,NULL},{f,t,NULL}},{{t,NULL,f},{NULL,f,NULL}}}");
    expect(arr).toStrictEqual([
      [
        ["t", "f", null],
        ["f", "t", null],
      ],
      [
        ["t", null, "f"],
        [null, "f", null],
      ],
    ]);
  });

  it("should use custom separator", async function () {
    const arr = parsePostgresArray("{1,2;2,5;NULL}", {separator: ";"});
    expect(arr).toStrictEqual(["1,2", "2,5", null]);
  });

});
