# Developer Documentation

## Tests

### Run the test suite

1. You must spin up a postgres database on your local machine that allows for trusted (i.e. passwordless) authentication. The database should be running on localhost at port `5432` (the standard postgres port). 

    You may choose to (but not are not required to) use docker for this purpose by running the below.

    ```bash
    docker compose up
    # or this to run in the background
    docker compose up --detach
    ```

2. Execute the test suite with: `npm test`

### Optional: SCRAM/MD5 login and channel-binding tests

A handful of tests exercise SCRAM-SHA-256, its channel-binding variant, and
the (deprecated but still supported) MD5 auth method - they need a real
non-trust user for each, so they `this.skip()` themselves when the
environment doesn't have one. CI always sets this up (see
`.github/workflows/test.yml`); to get the same coverage locally:

1. Add a rule for each user to your server's `pg_hba.conf` (see
   `test/_support/pg_hba.conf` for a ready-made example) - above the
   blanket `trust` rules, since `pg_hba` takes the first line that
   matches. The channel-binding tests also need `ssl=on` and a server
   certificate (see `docker-compose.yaml`'s own comments for that part).

   ```
   hostssl all  postgrejs_test_scram  all  scram-sha-256
   host    all  postgrejs_test_scram  all  scram-sha-256
   host    all  postgrejs_test_md5    all  md5
   ```

2. Create the two roles, each with its own password (the tests use the
   username as the password too):

   ```sql
   create role postgrejs_test_scram login password 'postgrejs_test_scram';
   set password_encryption = 'md5';
   create role postgrejs_test_md5 login password 'postgrejs_test_md5';
   ```

3. Reload (`select pg_reload_conf();` or restart the server) and run the
   suite with both env vars set:

   ```bash
   LOGIN_SCRAM=postgrejs_test_scram LOGIN_MD5=postgrejs_test_md5 npm test
   ```
