import { Connection, Pool } from "postgresql-client";

describe("notification", function () {
  let connection: Connection;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool();
    connection = new Connection();
    await connection.connect();
  });

  afterAll(async () => {
    await connection.close(0);
  });

  describe("notification with Connection class", function () {
    it("should emit 'notification' event emitter", function (done) {
      connection.once('notification', () => {
        done();
      });
      connection.query('LISTEN event1').then(() => {
        connection.query(`NOTIFY event1`).catch(done);
      }).catch(done);
    });

    it("should listen events using 'listen' feature", function (done) {
      connection.listen('event1', () => done())
          .then(() => {
            connection.query(`NOTIFY event1`).catch(done);
          }).catch(done);
    });

    it("should unlisten", function (done) {
      let i = 0;
      connection.listen('event1', () => {
        i++;
        connection.unListen('event1')
            .then(() => {
              connection.query(`NOTIFY event1`).catch(done);
              setTimeout(() => {
                if (i === 1) done(); else done(new Error('Failed'));
              }, 1000);
            })
      }).then(() => {
        connection.query(`NOTIFY event1`).catch(done);
      }).catch(done);
    });
  });

  describe("notification with Pool", function () {

    it("should create new connection and listen for events", function (done) {
      pool.listen('event1', () => {
        pool.unListenAll().then(done);
      }).then(() => {
        connection.query(`NOTIFY event1`).catch(done);
      }).catch(done);
    });

    it("should unlisten", function (done) {
      let i = 0;
      pool.listen('event1', () => {
        i++;
        pool.unListen('event1')
            .then(() => {
              connection.query(`NOTIFY event1`).catch(done);
              setTimeout(() => {
                if (i === 1) done(); else done(new Error('Failed'));
              }, 1000);
            })
      }).then(() => {
        connection.query(`NOTIFY event1`).catch(done);
      }).catch(done);
    });

    it("should unlisten all channels after release pooled connection", function (done) {
      pool.acquire()
          .then(async conn => {
            let i = 0;
            await conn.listen('event1', () => {
              i++;
              conn.close();
              setTimeout(() => {
                connection.query(`NOTIFY event1`).catch();
                setTimeout(() => {
                  if (i === 1) done(); else done(new Error('Failed'));
                }, 500);
              }, 500);
            });
            await connection.query(`NOTIFY event1`);
          });
    });
  });

});
