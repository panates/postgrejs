import process from 'node:process';
import { expect } from 'expect';
import { getConnectionConfig, parseConnectionString } from 'postgrejs';

describe('Parse connection string', () => {
  const oldEnv = { ...process.env };

  after(() => {
    // Key by key, and never `process.env = oldEnv`: assigning a plain
    // object over it leaves Node writing to something it does not watch,
    // so a later `process.env.TZ = ...` stops reaching the date cache -
    // which is how a whole spec's worth of time-zone sweeps silently ran
    // in the machine's own zone instead of the ones they named.
    for (const k of Object.keys(process.env))
      if (!(k in oldEnv)) delete process.env[k];
    for (const [k, v] of Object.entries(oldEnv)) process.env[k] = v as string;
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

    describe('connectionString', () => {
      // `pg`'s spelling of the bare string this already took, and what
      // drizzle-orm's first example writes. Ignored, it did not fail -
      // it connected to whatever the environment defaults to, which in
      // development usually exists.
      const CS = 'postgres://me:pw@h:5433/mydb';

      it('should be read as the connection string it is', () => {
        const cfg = parseConnectionString(CS);
        const viaOption = getConnectionConfig({ connectionString: CS });
        expect(viaOption.host).toStrictEqual(cfg.host);
        expect(viaOption.port).toStrictEqual(cfg.port);
        expect(viaOption.database).toStrictEqual(cfg.database);
        expect(viaOption.user).toStrictEqual(cfg.user);
        expect(viaOption.password).toStrictEqual(cfg.password);
      });

      it('should win over a field of the same name beside it', () => {
        // What `pg` does: a value the string carries is not quietly
        // overridden by one that was left in the object.
        const cfg = getConnectionConfig({
          connectionString: CS,
          database: 'ignored',
          host: 'ignored',
        });
        expect(cfg.database).toStrictEqual('mydb');
        expect(cfg.host).toStrictEqual('h');
      });

      it('should leave the fields the string does not name', () => {
        const cfg = getConnectionConfig({
          connectionString: CS,
          applicationName: 'app',
          schema: 'myschema',
        });
        expect(cfg.applicationName).toStrictEqual('app');
        expect(cfg.schema).toStrictEqual('myschema');
        expect(cfg.database).toStrictEqual('mydb');
      });

      it('should not leave itself in the configuration', () => {
        expect(
          (getConnectionConfig({ connectionString: CS }) as any)
            .connectionString,
        ).toStrictEqual(undefined);
        expect(
          (getConnectionConfig({ connectionString: undefined }) as any)
            .connectionString,
        ).toStrictEqual(undefined);
      });
    });

    describe('a key from another client', () => {
      // Nothing checks that a configuration's keys are keys this client
      // knows, and that stays: a PoolConfiguration carries
      // lightning-pool's own options and callers pass objects carrying
      // their own fields. What is caught is the short list of names that
      // are the right idea under another client's spelling.
      const CASES: [string, any, string][] = [
        ['dbname', { dbname: 'x' }, 'database'],
        ['db', { db: 'x' }, 'database'],
        ['username', { username: 'x' }, 'user'],
        ['pass', { pass: 'x' }, 'password'],
        ['hostname', { hostname: 'x' }, 'host'],
        ['url', { url: 'postgres://h/db' }, 'connectionString'],
        ['connection_string', { connection_string: 'x' }, 'connectionString'],
        ['application_name', { application_name: 'x' }, 'applicationName'],
        [
          'connectionTimeoutMillis',
          { connectionTimeoutMillis: 1 },
          'connectTimeoutMs',
        ],
      ];

      for (const [name, config, meant] of CASES)
        it(`should answer "${name}" with the name that works`, () => {
          expect(() => getConnectionConfig(config)).toThrow(
            new RegExp(`"${name}" is not a connection option here.+"${meant}"`),
          );
        });

      it('should leave a configuration carrying its own fields alone', () => {
        // The reason there is no allowlist: rejecting an unknown key
        // would reject these, and the list would have to be kept current
        // forever.
        const cfg = getConnectionConfig({
          host: 'h',
          max: 5,
          idleTimeoutMillis: 1000,
          ownField: { anything: true },
        } as any);
        expect(cfg.host).toStrictEqual('h');
      });

      it('should ignore one that is only there as undefined', () => {
        expect(() =>
          getConnectionConfig({ dbname: undefined } as any),
        ).not.toThrow();
      });
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
    // Put back key by key, in a finally: the suite-level `after` that
    // replaces `process.env` wholesale does not run until this file is
    // done, and every spec that connects in between reads these - a
    // `PGHOST` of "PGHOST" is not a host anything can resolve.
    const KEYS = [
      'PGHOST',
      'PGPORT',
      'PGDATABASE',
      'PGUSER',
      'PGPASSWORD',
      'PGAPPNAME',
      'PGCONNECT_TIMEOUT',
      'PGMAX_BUFFER_SIZE',
    ];
    const saved: Record<string, string | undefined> = {};
    for (const k of KEYS) saved[k] = process.env[k];
    try {
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
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
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
