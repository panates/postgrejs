import assert from "assert";
import "../_support/env";
import { getConnectionConfig, parseConnectionString } from "../../src";

describe("Parse connection string", function () {
  const oldEnv = { ...process.env };

  afterAll(() => {
    process.env = oldEnv;
  });

  describe("Parse connection string", function () {
    it("should parse local unix path ", function () {
      const cfg = parseConnectionString("/var/run");
      assert.deepStrictEqual(cfg.host, "/var/run");
    });

    it("should parse local unix path with query", function () {
      const cfg = parseConnectionString("/var/run?db=mydb");
      assert.deepStrictEqual(cfg.host, "/var/run");
      assert.deepStrictEqual(cfg.database, "mydb");
    });

    it("should parse unix sockets uri", function () {
      const cfg = parseConnectionString("socket://some path/?db=any%2bdb");
      assert.deepStrictEqual(cfg.host, "/some path/");
      assert.deepStrictEqual(cfg.database, "any+db");
    });

    it("should parse unix with auth", function () {
      let cfg = parseConnectionString("socket://me:1234@some path/?db=any db");
      assert.deepStrictEqual(cfg.host, "/some path/");
      assert.deepStrictEqual(cfg.database, "any db");
      assert.deepStrictEqual(cfg.password, "1234");
      assert.deepStrictEqual(cfg.user, "me");
    });

    it("should parse url", function () {
      let cfg = parseConnectionString("postgres://me:1234@localhost/any db");
      assert.deepStrictEqual(cfg.host, "localhost");
      assert.deepStrictEqual(cfg.database, "any db");
      assert.deepStrictEqual(cfg.password, "1234");
      assert.deepStrictEqual(cfg.user, "me");
    });

    it("should get host from query", function () {
      let cfg = parseConnectionString("postgres://me:1234@:5555/any db?host=127.0.0.1");
      assert.deepStrictEqual(cfg.host, "127.0.0.1");
      assert.deepStrictEqual(cfg.port, 5555);
      assert.deepStrictEqual(cfg.database, "any db");
      assert.deepStrictEqual(cfg.password, "1234");
      assert.deepStrictEqual(cfg.user, "me");
    });
  });

  describe("Get connection config from environment variables", function () {
    process.env.PGHOST = "PGHOST";
    process.env.PGPORT = "1234";
    process.env.PGDATABASE = "PGDATABASE";
    process.env.PGUSER = "PGUSER";
    process.env.PGPASSWORD = "PGPASSWORD";
    process.env.PGAPPNAME = "PGAPPNAME";
    process.env.PGCONNECT_TIMEOUT = "32000";
    const cfg = getConnectionConfig();
    assert.strictEqual(cfg.host, "pghost");
    assert.strictEqual(cfg.port, 1234);
    assert.strictEqual(cfg.database, "PGDATABASE");
    assert.strictEqual(cfg.user, "PGUSER");
    assert.strictEqual(cfg.password, "PGPASSWORD");
    assert.strictEqual(cfg.applicationName, "PGAPPNAME");
    assert.strictEqual(cfg.connectTimeoutMs, 32000);
  });
});
