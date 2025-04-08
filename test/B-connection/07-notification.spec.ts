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
  });
});
