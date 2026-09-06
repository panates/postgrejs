import process from 'node:process';
import { expect } from 'expect';
import { getConnectionConfig, parseConnectionString } from 'postgrejs';

describe('Parse connection string', () => {
  const oldEnv = { ...process.env };

  after(() => {
    process.env = oldEnv;
  });

  describe('Parse connection string', () => {
    it('should parse local unix path ', () => {
      const cfg = parseConnectionString('/var/run');
      expect(cfg.host).toStrictEqual('/var/run');
    });

    it('should parse local unix path with query', () => {
      const cfg = parseConnectionString('/var/run?db=mydb');
      expect(cfg.host).toStrictEqual('/var/run');
      expect(cfg.database).toStrictEqual('mydb');
    });

    it('should parse unix sockets uri', () => {
      const cfg = parseConnectionString('socket://somepath/?db=any%2bdb');
      expect(cfg.host).toStrictEqual('/somepath/');
      expect(cfg.database).toStrictEqual('any+db');
    });

    it('should parse unix with auth', () => {
      const cfg = parseConnectionString('socket://me:1234@somepath/?db=any db');
      expect(cfg.host).toStrictEqual('/somepath/');
      expect(cfg.database).toStrictEqual('any db');
      expect(cfg.password).toStrictEqual('1234');
      expect(cfg.user).toStrictEqual('me');
    });

    it('should parse url', () => {
      const cfg = parseConnectionString('postgres://me:1234@localhost/any db');
      expect(cfg.host).toStrictEqual('localhost');
      expect(cfg.database).toStrictEqual('any db');
      expect(cfg.password).toStrictEqual('1234');
      expect(cfg.user).toStrictEqual('me');
    });

    it('should get host from query', () => {
      const cfg = parseConnectionString(
        'postgres://me:1234@127.0.0.1:5555/any db?host=127.0.0.1',
      );
      expect(cfg.host).toStrictEqual('127.0.0.1');
      expect(cfg.port).toStrictEqual(5555);
      expect(cfg.database).toStrictEqual('any db');
      expect(cfg.password).toStrictEqual('1234');
      expect(cfg.user).toStrictEqual('me');
    });
  });

  it('Get connection config from environment variables', () => {
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

  describe('multiple hosts', () => {
    it('should parse a comma-separated host list from a connection string', () => {
      const cfg = getConnectionConfig('postgres://a:5432,b:5433,c/db');
      expect(cfg.hosts).toStrictEqual([
        { host: 'a', port: 5432 },
        { host: 'b', port: 5433 },
        { host: 'c', port: 5432 },
      ]);
      // host/port keep pointing at the first candidate.
      expect(cfg.host).toStrictEqual('a');
      expect(cfg.port).toStrictEqual(5432);
    });

    it('should parse a comma-separated host given on its own', () => {
      const cfg = getConnectionConfig({ host: 'h1:1234,h2' });
      expect(cfg.hosts).toStrictEqual([
        { host: 'h1', port: 1234 },
        { host: 'h2', port: 1234 },
      ]);
    });

    it('should leave a single host without a list', () => {
      expect(getConnectionConfig('postgres://h1/db').hosts).toStrictEqual(
        undefined,
      );
    });

    it('should keep credentials out of the host list', () => {
      const cfg = getConnectionConfig('postgres://user:pass@a,b/db');
      expect(cfg.hosts?.map(x => x.host)).toStrictEqual(['a', 'b']);
      expect(cfg.user).toStrictEqual('user');
    });

    it('should read target_session_attrs', () => {
      expect(
        getConnectionConfig('postgres://a,b/db?target_session_attrs=read-write')
          .targetSessionAttrs,
      ).toStrictEqual('read-write');
    });

    it('should refuse an unknown target_session_attrs', () => {
      expect(() =>
        getConnectionConfig('postgres://a/db?target_session_attrs=sideways'),
      ).toThrow(/is not supported/);
    });
  });
});
