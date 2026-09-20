import { expect } from 'expect';
import { Connection, Pool } from 'postgrejs';

describe('notification', () => {
  let connection: Connection;
  let pool: Pool;

  beforeEach(async () => {
    pool = new Pool();
    connection = new Connection();
    await connection.connect();
  });

  afterEach(async () => {
    await connection.close(0);
    await pool.close(0);
  });

  describe('notification with Connection class', () => {
    it("should emit 'notification' event emitter", done => {
      connection.once('notification', () => {
        setTimeout(done, 100);
      });
      connection
        .query('LISTEN event1')
        .then(() => {
          connection.query(`NOTIFY event1`).catch(done);
        })
        .catch(done);
    });

    it("should emit 'notification' once per NOTIFY, not once per path", async () => {
      // IntlConnection.emit() forwards every event to its owner, and
      // listen() used to wire a second forwarder of its own - so the raw
      // event arrived twice, but only after listen() had been called.
      let events = 0;
      let callbacks = 0;
      connection.on('notification', () => events++);
      await connection.listen('event_once', () => callbacks++);
      const other = new Connection();
      await other.connect();
      try {
        await other.query(`NOTIFY event_once, 'x'`);
        await new Promise(resolve => setTimeout(resolve, 300));
      } finally {
        await other.close(0);
      }
      expect(events).toStrictEqual(1);
      expect(callbacks).toStrictEqual(1);
    });

    describe('channel names', () => {
      // The name is an identifier written straight into LISTEN, so it is
      // quoted rather than restricted to a pattern - any name PostgreSQL
      // accepts works, and the quoting is what keeps the injection door
      // shut.
      const notifier = new Connection();
      before(() => notifier.connect());
      after(() => notifier.close(0));

      const roundTrip = async (channel: string, notifySql: string) => {
        const seen: any[] = [];
        await connection.listen(channel, (msg: any) => seen.push(msg));
        try {
          await notifier.query(notifySql);
          await new Promise(resolve => setTimeout(resolve, 300));
        } finally {
          await connection.unListen(channel);
        }
        return seen;
      };

      it('should listen on a one-character channel', async () => {
        const seen = await roundTrip('a', "NOTIFY a, 'p1'");
        expect(seen.length).toStrictEqual(1);
        expect(seen[0].channel).toStrictEqual('a');
        expect(seen[0].payload).toStrictEqual('p1');
      });

      it('should listen on a channel whose name starts with an underscore', async () => {
        const seen = await roundTrip('_private', "NOTIFY _private, 'p2'");
        expect(seen.length).toStrictEqual(1);
        expect(seen[0].payload).toStrictEqual('p2');
      });

      it('should deliver to a mixed-case channel name', async () => {
        // This was silently dead: LISTEN Foo folds to foo on the server,
        // notifications came back as foo, and the callback was registered
        // under Foo - so it never fired at all.
        const seen = await roundTrip('Foo', "NOTIFY Foo, 'p3'");
        expect(seen.length).toStrictEqual(1);
        expect(seen[0].channel).toStrictEqual('foo');
        expect(seen[0].payload).toStrictEqual('p3');
      });

      it('should treat a folded name and its lower case form as one channel', async () => {
        const seen = await roundTrip('Foo', "NOTIFY foo, 'p4'");
        expect(seen.length).toStrictEqual(1);
        expect(seen[0].payload).toStrictEqual('p4');
      });

      it('should listen on a channel whose name needs quoting', async () => {
        const seen = await roundTrip('my chan', `NOTIFY "my chan", 'p5'`);
        expect(seen.length).toStrictEqual(1);
        expect(seen[0].channel).toStrictEqual('my chan');
      });

      it('should refuse a name the server could not round-trip', async () => {
        await expect(connection.listen('', () => {})).rejects.toThrow(
          'non-empty',
        );
        await expect(
          connection.listen('c'.repeat(64), () => {}),
        ).rejects.toThrow('63 bytes');
        await expect(connection.listen('a\0b', () => {})).rejects.toThrow(
          'NUL',
        );
      });
    });

    it("should listen events using 'listen' feature", done => {
      Promise.resolve()
        .then(async () => {
          await connection.listen('event1', () => {
            setTimeout(done, 100);
          });
          await connection.query(`NOTIFY event1`).catch(done);
        })
        .catch(done);
    });

    it('should unlisten', done => {
      let i = 0;
      connection
        .listen('event1', () => {
          i++;
          return connection.unListen('event1').then(() => {
            connection.query(`NOTIFY event1`).catch(done);
            setTimeout(() => {
              if (i === 1) done();
              else done(new Error('Failed'));
            }, 1000);
          });
        })
        .then(() => connection.query(`NOTIFY event1`))
        .catch(done);
    });
  });

  describe('notification with Pool', () => {
    it('should create new connection and listen for events', done => {
      pool
        .listen('event1', () =>
          pool.unListenAll().then(() => {
            setTimeout(done, 100);
          }),
        )
        .then(() => connection.query(`NOTIFY event1`))
        .catch(done);
    });

    it('should unlisten', done => {
      let i = 0;
      pool
        .listen('event1', () => {
          i++;
          pool
            .unListen('event1')
            .then(() => {
              connection.query(`NOTIFY event1`).catch(done);
              setTimeout(() => {
                if (i === 1) done();
                else done(new Error('Failed'));
              }, 1000);
            })
            .catch(() => undefined);
        })
        .then(() => {
          connection.query(`NOTIFY event1`).catch(done);
        })
        .catch(done);
    });

    it('should unlisten one channel while another is still listened on', async () => {
      // With more than one channel still registered, unListen() must not
      // fall back to unListenAll() - it forwards to the still-open
      // notification connection instead, which stays alive for event2.
      let event2Count = 0;
      await pool.listen('event1', () => undefined);
      await pool.listen('event2', () => {
        event2Count++;
      });
      await pool.unListen('event1');
      await connection.query(`NOTIFY event2`);
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(event2Count).toStrictEqual(1);
      await pool.unListenAll();
    });

    it('should unlisten all channels after release pooled connection', done => {
      pool
        .acquire()
        .then(async conn => {
          let i = 0;
          await conn.listen('event1', () => {
            i++;
            conn.close().catch(() => undefined);
            setTimeout(() => {
              connection.query(`NOTIFY event1`).catch(() => undefined);
              setTimeout(() => {
                if (i === 1) done();
                else done(new Error('Failed'));
              }, 500);
            }, 500);
          });
          await connection.query(`NOTIFY event1`);
        })
        .catch(() => undefined);
    });

    it('should re-subscribe every channel after the notification connection drops and reconnects', async function () {
      this.timeout(5000);
      // Regression test for two bugs found together: the shared
      // notification connection's own 'close' used to fire twice per
      // actual close (so a reconnect could double-register every
      // callback), and a *successful* reconnect never re-issued LISTEN
      // for anything at all (so notifications silently stopped forever
      // after any connection drop - the underlying pgbouncer/network
      // hiccup this exists to survive).
      let count = 0;
      await pool.listen('event1', () => {
        count++;
      });
      const notifConn = (pool as any)._notificationConnection as Connection;
      await notifConn.close(0);
      // > the 500ms reconnect delay, plus room for connect() + registerEvents().
      await new Promise(resolve => setTimeout(resolve, 1200));
      await connection.query(`NOTIFY event1`);
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(count).toStrictEqual(1);
    });
  });
});
