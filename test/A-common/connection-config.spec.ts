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

    describe('the scheme', () => {
      // `postgresql://` was not in the list, so the path - the database
      // name - was dropped for the one scheme PostgreSQL's own
      // documentation leads with and every framework generates. The
      // connection still succeeded, against the default database.
      const SCHEMES = ['postgres', 'postgresql', 'pg'];

      it('should read the same URL the same way under each of them', () => {
        const expected = {
          host: 'h',
          port: 5433,
          database: 'mydb',
          user: 'me',
          password: 'pw',
          schema: 'myschema',
        };
        for (const scheme of SCHEMES) {
          const cfg = parseConnectionString(
            `${scheme}://me:pw@h:5433/mydb?schema=myschema`,
          );
          // The whole config, not only `database`: host, port, user,
          // password and the query parameters were never the problem, so
          // a test watching one field would miss it widening.
          expect({
            host: cfg.host,
            port: cfg.port,
            database: cfg.database,
            user: cfg.user,
            password: cfg.password,
            schema: cfg.schema,
          }).toStrictEqual(expected);
        }
      });

      it('should take the database from the path under each of them', () => {
        for (const scheme of SCHEMES) {
          expect(
            parseConnectionString(`${scheme}://h/mydb`).database,
          ).toStrictEqual('mydb');
          expect(
            parseConnectionString(`${scheme}:///mydb`).database,
          ).toStrictEqual('mydb');
          expect(
            getConnectionConfig(`${scheme}://h/my db`).database,
          ).toStrictEqual('my db');
        }
      });

      it('should still fall back to the same default when the URL names none', () => {
        // Whatever that default is here - PGDATABASE is set for the
        // test run - the point is that the scheme does not change it.
        const [first, ...rest] = SCHEMES.map(
          scheme => getConnectionConfig(`${scheme}://h`).database,
        );
        expect(first).toBeTruthy();
        for (const other of rest) expect(other).toStrictEqual(first);
      });

      it('should leave a socket URL taking its database from ?db=', () => {
        // Out of the list on purpose: its path is the socket directory.
        for (const scheme of ['socket', 'unix']) {
          const cfg = parseConnectionString(`${scheme}://somepath/?db=mydb`);
          expect(cfg.host).toStrictEqual('/somepath/');
          expect(cfg.database).toStrictEqual('mydb');
        }
      });
    });

    it('should default to an empty host when the URL has none', () => {
      const cfg = parseConnectionString('postgres:///mydb');
      expect(cfg.host).toStrictEqual('');
      expect(cfg.database).toStrictEqual('mydb');
    });

    it('should treat a pathless socket URL as the root path', () => {
      const cfg = parseConnectionString('socket://somepath');
      expect(cfg.host).toStrictEqual('/somepath');
    });

    it('should get schema from query', () => {
      const cfg = parseConnectionString('postgres://h/db?schema=myschema');
      expect(cfg.schema).toStrictEqual('myschema');
    });

    it('should get application_name from query', () => {
      const cfg = parseConnectionString(
        'postgres://h/db?application_name=myapp',
      );
      expect(cfg.applicationName).toStrictEqual('myapp');
    });

    it('should read a supported channel_binding value', () => {
      const cfg = parseConnectionString(
        'postgres://h/db?channel_binding=require',
      );
      expect(cfg.channelBinding).toStrictEqual('require');
    });

    it('should refuse an unsupported channel_binding value', () => {
      expect(() =>
        parseConnectionString('postgres://h/db?channel_binding=sideways'),
      ).toThrow(/channel_binding "sideways" is not supported/);
    });

    it('should read a supported sslnegotiation value', () => {
      const cfg = parseConnectionString(
        'postgres://h/db?sslnegotiation=direct',
      );
      expect(cfg.sslNegotiation).toStrictEqual('direct');
    });

    it('should refuse an unsupported sslnegotiation value', () => {
      expect(() =>
        parseConnectionString('postgres://h/db?sslnegotiation=sideways'),
      ).toThrow(/sslnegotiation "sideways" is not supported/);
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

    it('should not treat an already-populated hosts list as a comma-separated host string', () => {
      delete process.env.PGPORT;
      const cfg = getConnectionConfig({
        hosts: [{ host: 'a' }, { host: 'b' }],
      });
      expect(cfg.hosts).toStrictEqual([
        { host: 'a', port: undefined },
        { host: 'b', port: undefined },
      ]);
    });
  });
});
