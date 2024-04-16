import { getConnectionConfig, parseConnectionString } from 'postgresql-client';

describe('Parse connection string', function () {
  const oldEnv = { ...process.env };

  afterAll(() => {
    process.env = oldEnv;
  });

  describe('Parse connection string', function () {
    it('should parse local unix path ', function () {
      const cfg = parseConnectionString('/var/run');
      expect(cfg.host).toStrictEqual('/var/run');
    });

    it('should parse local unix path with query', function () {
      const cfg = parseConnectionString('/var/run?db=mydb');
      expect(cfg.host).toStrictEqual('/var/run');
      expect(cfg.database).toStrictEqual('mydb');
    });

    it('should parse unix sockets uri', function () {
      const cfg = parseConnectionString('socket://somepath/?db=any%2bdb');
      expect(cfg.host).toStrictEqual('/somepath/');
      expect(cfg.database).toStrictEqual('any+db');
    });

    it('should parse unix with auth', function () {
      const cfg = parseConnectionString('socket://me:1234@somepath/?db=any db');
      expect(cfg.host).toStrictEqual('/somepath/');
      expect(cfg.database).toStrictEqual('any db');
      expect(cfg.password).toStrictEqual('1234');
      expect(cfg.user).toStrictEqual('me');
    });

    it('should parse url', function () {
      const cfg = parseConnectionString('postgres://me:1234@localhost/any db');
      expect(cfg.host).toStrictEqual('localhost');
      expect(cfg.database).toStrictEqual('any db');
      expect(cfg.password).toStrictEqual('1234');
      expect(cfg.user).toStrictEqual('me');
    });

    it('should get host from query', function () {
      const cfg = parseConnectionString('postgres://me:1234@127.0.0.1:5555/any db?host=127.0.0.1');
      expect(cfg.host).toStrictEqual('127.0.0.1');
      expect(cfg.port).toStrictEqual(5555);
      expect(cfg.database).toStrictEqual('any db');
      expect(cfg.password).toStrictEqual('1234');
      expect(cfg.user).toStrictEqual('me');
    });
  });

  describe('Get connection config from environment variables', function () {
    process.env.PGHOST = 'PGHOST';
    process.env.PGPORT = '1234';
    process.env.PGDATABASE = 'PGDATABASE';
    process.env.PGUSER = 'PGUSER';
    process.env.PGPASSWORD = 'PGPASSWORD';
    process.env.PGAPPNAME = 'PGAPPNAME';
    process.env.PGCONNECT_TIMEOUT = '32000';
    process.env.PGMAX_BUFFER_SIZE = '4096';
    const cfg = getConnectionConfig();
    expect(cfg.host).toStrictEqual('PGHOST');
    expect(cfg.port).toStrictEqual(1234);
    expect(cfg.database).toStrictEqual('PGDATABASE');
    expect(cfg.user).toStrictEqual('PGUSER');
    expect(cfg.password).toStrictEqual('PGPASSWORD');
    expect(cfg.applicationName).toStrictEqual('PGAPPNAME');
    expect(cfg.connectTimeoutMs).toStrictEqual(32000);
    expect(cfg.buffer?.maxLength).toStrictEqual(4096);
  });
});
