# Developer Documentation

Thanks for taking the time to contribute to `postgrejs`!

## Getting Started

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/panates/postgrejs.git
   cd postgrejs
   npm install
   ```

2. Node.js `>=20.0` is required (see `engines` in `package.json`).

3. Base your branch on, and open your pull request against, `dev` - `main`
   only receives releases.

## Development Workflow

Before opening a pull request, make sure the following all pass locally
(CI runs the same checks):

```bash
npm run qc       # lint + circular-dependency check
npm run compile  # type-check without emitting
npm test         # test suite
```

## Code Style

Formatting is handled by [Prettier](https://prettier.io) and applied
automatically on commit via a Husky pre-commit hook, so you don't need to
format manually - though you can with `npm run format`. Linting is done
with ESLint (`npm run lint`); the project builds with zero warnings
allowed, so fix anything it flags before pushing.

## Testing

**Every change - a new feature, a bug fix, a refactor - must come with a
test, and the code it touches must be covered.** A pull request that adds
or changes behavior without a corresponding test won't be merged.

### Run the test suite

1. You must spin up a postgres database on your local machine that allows for trusted (i.e. passwordless) authentication. The database should be running on localhost at port `5432` (the standard postgres port).

    You may choose to (but not are not required to) use docker for this purpose by running the below.

    ```bash
    docker compose -f docker/docker-compose.yml up
    # or this to run in the background
    docker compose -f docker/docker-compose.yml up --detach
    ```

2. Execute the test suite with: `npm test`

3. To check code coverage locally the same way CI does, run `npm run citest`.

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
   certificate (see `docker/docker-compose.yml`'s own comments for that
   part).

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

## Commit Messages

Commits follow the `<type>: <description>` convention already used
throughout the project's history (`fix:`, `feat:`, `test:`, `refactor:`,
`chore:`, `docs:`, ...). `CHANGELOG.md` is generated from these on release,
so sticking to the format keeps it meaningful.

## Pull Requests

- Target `dev`.
- CI runs the lint, circular-dependency, compile and test checks across a
  matrix of Node.js and PostgreSQL versions - passing `npm run qc` and
  `npm test` locally first saves a round trip.
- Keep pull requests focused on one change; unrelated cleanups belong in
  their own PR.

## Benchmarks

Benchmark scenarios live under `benchmark/`; see `doc/BENCHMARKS.md` for
the current results and `benchmark/README.md` for how to run a scenario
yourself (`npm run bench -- --scenario=<name> --lib=<name>`). Only run
these if your change could affect performance - they aren't part of the
regular test suite.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you're expected to uphold it.

By contributing, you agree that your contributions will be licensed under
the project's [BSD-3-Clause license](LICENSE).
