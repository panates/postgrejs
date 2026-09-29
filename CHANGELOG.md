# Changelog

<!-- rman:documented-up-to 88f329a0dd21d246bd314f8bf581d6de153aa18d -->

## v3.12.1 (2026-09-29)

### ⚡ Performance and Optimizations

- write an array of integers into the buffer instead of a string (1ddf061)
- read a row as it arrives instead of setting it aside (1db2c02)
- read a row where it lands, without a Buffer of its own (b2eb168)

### 📚 Documentation

- say what the array literal change is worth to a caller (770f6c7)
- document Cursor, and keep the notes out of its TSDoc (3e033b2)
- write down where the TSDoc ends and the notes begin (6298c88)
- document what a Connection and a Pool offer a caller (f12d116)
- document the rest of the public connection classes (ee348bf)
- document the interfaces, the type aliases and the constants (e2f6a97)
- take the measurements out of the util and data-type TSDoc (930489d)
- say what every data type maps, and to what (74c19e2)
- document the util layer's exports (b993f1f)
- document the protocol layer and the type map (ea56cce)
- the last twelve exports, and BindParam most of all (0f0f71d)
- **benchmark:** cut the methodology from 2600 words to 600 (5f6b703)

### 📦 Build System

- move to rman, github-actions@v3 and the shared preset (8d207f9)

---

## v3.12.0 (2026-09-27)

### ✨ Features

- report the parameter types the server resolved (06af711)
- **benchmark:** count the bytes sent, and what a run keeps (9a99a43)

### 🐛 Bug Fixes

- refuse what the server refuses instead of storing another number (59244b9)
- take the value out of a BindParam handed to a prepared statement (1d4a4d7)
- **benchmark:** a figure nobody could measure is not a bar of zero (3c1cb81)

### ⚡ Performance and Optimizations

- stop quoting and re-escaping every element of an array literal (279674c)

### 📚 Documentation

- say what an untyped numeric array actually costs (d169626)
- **benchmark:** say what Peak Heap is not, and what survives a re-run (2a8905c)
- **benchmark:** Retained is a working set, not a permanent footprint (9e9d308)
- **benchmark:** update benchmarks to include new memory and network metrics (de26413)

---

## v3.11.1 (2026-09-24)

### 🐛 Bug Fixes

- **bench:** count off-heap memory in Peak Heap (f074d7a)

### ⚡ Performance and Optimizations

- build uuid and macaddr text in one pass instead of five (0805b4d)
- shift the instant instead of rebuilding a local Date from its parts (5611a89)
- stop asking whether a small money value round-trips (cc79c56)
- write a pg_lsn without four strings a value (1db1a3a)

---

## v3.11.0 (2026-09-23)

### ✨ Features

- add isMultiStatement(), so a caller can tell which of the two to use (0db1d44)

### 🔧 Refactoring

- rename `multi-statement` to `is-multi-statement` for clarity (36b8ab3)

### 🧹 Chores

- update dependencies (fc829b9)

---

## v3.10.1 (2026-09-22)

### ✨ Features

- accept `connectionString`, and answer a key from another client (cbdd635)

---

## v3.10.0 (2026-09-22)

### ✨ Features

- let fetchAsString name an array column by its element type (313c71e)
- name Circle's radius `radius`, as pg does (8d30acc)
- decode the date/time types into Temporal values on request (de11e96)
- let fetchAsString ask for a scalar without its arrays (423977d)
- serialise the value classes as their fields (ac5ba39)
- decode money and numeric as their exact decimal string on request (605e91e)
- report a lost connection on 'error', not only on 'close' (93b07c3)

### 🐛 Bug Fixes

- sign only the interval components that have one, and add toPostgres() (3d84fb5)
- read the database out of a `postgresql://` URL (ffbd971)
- stop declaring an element type for an array of numbers (660aa54)

### 📚 Documentation

- name the migration note after the release it is for (e0caa73)

---

## v3.9.0 (2026-09-22)

### ✨ Features

- pipeline by default, and let a connection opt out of it (4e9a609)
- keep the server's own error text on serverMessage (e413ae9)
- decode money, by asking the server what a minor unit is (285097e)
- let a connection answer the data-mapping options once (ecad270)
- take the transaction's modes on startTransaction() (4703ec4)

### 🐛 Bug Fixes

- answer an empty statement instead of raising (3a60510)
- type an array from the first value inside it, not from value[0] (49c045d)
- keep a pooled connection unshared unless the caller asks (be0ef23)
- let SET TRANSACTION run with rollbackOnError on (a89fcf3)
- ask for money's scale on the two paths that decoded before asking (3ed2812)
- name a statement once, not once per caller in a burst (2c4f52d)
- read a text date in the DateStyle the server said it wrote (4c1154b)

### ⚡ Performance and Optimizations

- stop paying for a text row twice (fe151e4)
- walk fewer types to infer a parameter, and write once per statement (96bc78d)

### 🔧 Refactoring

- let a row decoder declare its own rowType (b4f564b)

### 📚 Documentation

- list the ORM adapters that run on this client (b5465a3)

### 💬 General Changes

- regenerate the reports, and pin the adapter's options (98f08e5)

---

## v3.8.0 (2026-09-21)

### ✨ Features

- deliver server notices to the connection (8ecf16e)

### 🐛 Bug Fixes

- write a lower bound of 1 for an ordinary binary array (1ace8fe)
- send a Date parameter unspecified, so the column decides (1c3891a)
- send a string parameter unspecified, so the column decides (cd52507)

### 🧪 Tests

- skip the types PostgreSQL 12 does not have (35aeca7)

---

## v3.7.0 (2026-09-20)

### ✨ Features

- add unknownTypesAsString (3a05c68)
- reject the in-flight query with ConnectionLostError too (b8a8a42)
- decode interval (0278099)
- decode the range and multirange types (2478a3a)
- let a decoded value carry the type it came from (e867eba)
- decode the geometric types into classes of their own (d3465de)
- decode the network types (3964092)
- decode timetz (7b0d63b)
- decode bit, varbit and jsonpath (25b7806)
- decode tsvector and tsquery (318d846)
- decode line, path and polygon (37e3607)
- decode the system columns, and name the types that cannot be (d8d8431)
- decode a numeric that a double cannot hold into a Numeric (42ad546)
- decode refcursor, pg_node_tree and the snapshot types (244e9b8)

### 🐛 Bug Fixes

- keep a quoted empty element when parsing an array literal (a87afb7)
- recover when a recreated type invalidates a cached statement (4eb2de7)
- write an object as its own SQL literal, not as json (6a7d354)
- complete the type OID table, and check it against the catalog (ce83df0)

### ⚡ Performance and Optimizations

- build a numeric's digits without a concatenation per digit (be0f26c)

### 📚 Documentation

- bring the data type counts up to what is registered (2426563)
- cut the Features list back down (370f8b8)
- drop the Features section (bc277fe)
- give the documentation link its own heading (9996dce)

### 📦 Build System

- let the changelog template see a breaking change (475e92f)

### 🧹 Chores

- regenerate the changelog for the moved tag (538dbb3)

---

## v3.6.1 (2026-09-20)

### ✨ Features

- report a pooled connection that dies (5e5efc3)

### 🔧 Refactoring

- give a lost connection its own error type (a619e1c)

### 🤖 Continuous Integration

- pin the runner image and stop naming the PostgreSQL it ships (805667b)

---

## v3.6.0 (2026-09-20)

### ✨ Features

- make fetchAsString request text from the server (4ae2c92)
- fetch every row by default instead of the first 100 (f806b58)

### 🐛 Bug Fixes

- copy both indexes when a DataTypeMap is built from another (cb564c9)
- accept single-character savepoint names (2c78ff2)
- stop inferring "char" for one-character strings (aa64ff1)
- decode float4 as the number the server would print (1113f06)
- report rowsAffected for MERGE (bb8590f)
- stop a pooled cursor's connection going back into the pool (32a3020)
- emit 'notification' once per NOTIFY (efee7fd)
- quote LISTEN channel names instead of restricting them (d05813c)

### 📚 Documentation

- record what 3.6 changes for existing code (28478e9)

---

## v3.5.0 (2026-09-16)

### ✨ Features

- add transaction(fn) and let a Cursor be iterated with for await (220c547)

### ⚡ Performance and Optimizations

- let pipeline() bind to the connection's cached statements (3ef598b)

### 📚 Documentation

- note that pipeline() reuses cached prepared statements (1176a0b)
- stop signing commits on the assistant's behalf (8150e98)
- record scoped transactions and cursor iteration in the README (74f2d3b)
- refresh Unit of Work after pipeline() started reusing statements (45535c2)

---

## v3.4.0 (2026-09-16)

### ✨ Features

- add PreparedStatement.executeBatch() for multi-set execution (c41a9d7)
- add copyFromRows() for binary COPY bulk loading (cbee65c)
- add Connection.pipeline() for many statements in one round trip (5b1a0ba)
- reuse prepared statements for repeated queries (96f55ed)

### 🐛 Bug Fixes

- refuse values that have no numeric reading instead of storing zero (7cd60a5)

### ⚡ Performance and Optimizations

- carry the rollbackOnError savepoint in the statement's own round trip (eb58a04)
- let the prepared statement cache serve queries inside a transaction (cae0ccf)

### 📚 Documentation

- list batch execution in the feature list and comparison table (62faa88)
- list binary COPY in the feature list and comparison table (ab7c4b7)
- list pipeline() in the feature list and comparison table (e976836)
- record the prepared statement cache in the README (1f8d114)
- refresh the Node report and correct a stale asymmetry note (376bf61)
- regenerate both benchmark reports from an interleaved run (a483ddd)
- record statement-level rollback in the README (753e58f)

### 🤖 Continuous Integration

- pin GITHUB_TOKEN to read-only in the test and qc workflows (bfed005)

### 🧹 Chores

- add contributors to package.json (9dface6)
- regenerate the 3.4.0 changelog at the release tip (dfea0a4)
- move the 3.4.0 changelog forward to the benchmark work (dd22acf)
- move the 3.4.0 changelog forward to the transaction work (3354444)

### 💬 General Changes

- add Bulk Load scenarios for text and binary COPY (bfc33f9)
- add Unit of Work scenario for pipeline() (08a23a9)
- stop measuring postgres.js on an unprepared path (050c422)
- interleave repeats instead of running them back to back (0cf94b5)

---

## v3.3.0 (2026-09-14)

### ✨ Features

- add first-class Bun support with dedicated benchmark suite (8291ff6)
- add pluggable RowDecoder for custom row decoding (900e3ec)
- give decodeBinary the value's length, not a slice of it (e98b9aa)

### 🐛 Bug Fixes

- point coverage badge at dev instead of the abandoned master branch (ba742bf)
- return the actual instant when decoding timestamptz from binary (65f2cb6)

### ⚡ Performance and Optimizations

- decode PostgreSQL's own timestamp text shape without the engine parser (9f162da)
- build object rows from a compiled literal instead of per-column assignment (7e4a042)
- decode float and numeric text without materialising a string (7668938)
- decode timestamps from the wire bytes instead of a string (b2ab630)
- write protocol messages immediately instead of deferring a tick (7847ba7)

### 📚 Documentation

- document RowDecoder's data-immutability contract (1bb5a0e)
- document Bun support and the Bun benchmark report in the README (ba2df21)
- cover the Bun benchmarks in the README's speed section too (a1f0ca9)
- refresh both benchmark reports on 3.3.0 (0534765)

### 🧹 Chores

- add differentiator keywords to package.json (3f3ab5a)
- update dependencies and clean up removed transient packages in `package-lock.json` (f5902b0)
- update WebStorm run configs for bench:bun (914b7e4)
- drop the stale local flexy-buffer entry from package-lock.json (d3ea1b7)
- point the bench:bun run config at simple-query-execute (403758e)
- point the benchmark run configs at the scenarios last under study (4e13743)

### 💬 General Changes

- stop measuring type-declaration policy in the Extended Query scenarios (46afe7c)
- document why concurrent Simple Query varies its literal (29ad741)
- report near-ties as ties instead of ranking them (5ae6360)
- stop one stalled repeat from making every result a tie (e4ae975)

---

## v3.2.0 (2026-09-12)

### 🔧 Refactoring

- build SmartBuffer/BufferReader on top of flexy-buffer (60f281d)

---

## v3.1.3 (2026-09-11)

### 🐛 Bug Fixes

- reset transaction depth after prepareTransaction() (45426dc)

---

## v3.1.2 (2026-09-11)

### 💬 General Changes

- adjust README logo image width for consistency (d15bf6c)

---

## v3.1.1 (2026-09-10)

### 🐛 Bug Fixes

- drop the runner's Chrome apt source before installing PostgreSQL in CI (151779f)
- skip long-cancel-key length assertion below PostgreSQL 18 (41fd4cb)

### 📚 Documentation

- update README for protocol 3.2 support and feature comparison (c857d14)

### 💬 General Changes

- change homepage URLs to use the new domain (7c70c14)

---

## v3.1.0 (2026-09-09)

### ✨ Features

- implement the legacy Function Call sub-protocol ('F'/'V') (c39890f)
- support protocol 3.2's longer cancellation key (PostgreSQL 18+) (421aa5c)

### 🐛 Bug Fixes

- correctly parse NegotiateProtocolVersion and expose it on Connection (2c4f6db)

---

## v3.0.4 (2026-09-09)

### 🧹 Chores

- update BENCHMARKS.md for refreshed performance data and adjusted chart dimensions (3006176)
- update run configuration and regenerate BENCHMARKS.md with refreshed performance data (82831e7)
- update dependencies and adjust tsconfig for compatibility (e78d125)

---

## v3.0.3 (2026-09-08)

### 🧹 Chores

- improve chart rendering for better GitHub compatibility and layout responsiveness (2e4f350)

---

## v3.0.2 (2026-09-07)

### ✨ Features

- add Docker setup for PostgreSQL with SSL support notest (b76e6e2)
- make execute()/query() timing an opt-in, default-off option (e710694)
- support nested startTransaction()/commit() and savepoint()/releaseSavepoint() (5513cf0)

### 🐛 Bug Fixes

- enlarge benchmark charts so GitHub's Mermaid overlay doesn't swallow them (e282b79)
- replace deprecated substr() with substring() (3f35396)
- raise warmup for Simple Query benchmark, regenerate BENCHMARKS.md (7aa7ee6)

### ⚡ Performance and Optimizations

- hoist loop-invariant reads in Frontend/numeric encoders (b37e9e4)
- remove needless async wrapping and coercion from execute()/query() hot path (a58e09e)

---

## v3.0.1 (2026-09-07)

### ✨ Features

- exact-match --scenario/--lib by default, glob with a leading/trailing * (c35a53c)
- make async caller-stack capture an opt-out, per-call overridable option (85036c4)

### 🐛 Bug Fixes

- cancel() ignored multi-host failover and direct TLS negotiation (c046941)
- benchmark console summary leaked every scenario ever run (930de06)
- restore execute()'s timing, and switch it to performance.now() (8d92283)
- default omitted day-of-month to 1, not 0, when parsing dates (721cd04)
- LISTEN dropped for extra channels, lost after Pool reconnect, double 'close' emit (ed10a84)
- JsonType.encodeText() throws on a bigint value (bfef8a8)
- avoid a rare race in the cancel() test's own cleanup (87abad3)
- numeric encodeBinary() silently corrupts magnitudes >= 1e21 (20a9c22)
- LogicalReplication.close() never actually drops a permanent slot it created (90955eb)
- header link/image attributes in README (dc8d480)
- correct stale contact and copyright holder in project docs (500f1b5)
- skip direct-negotiation SSL test on PostgreSQL < 17 (a7058e4)
- skip numeric Infinity/-Infinity tests on PostgreSQL < 14 (1a80bdc)

### ⚡ Performance and Optimizations

- skip the instanceof check on plain string SQL in execute() (4c6ca23)

### 🔧 Refactoring

- remove dead Portal/PgSocket message-send methods (6b65637)
- remove dead BufferReader.moveBy()/moveTo(), add full coverage (aa82756)
- remove dead SmartBuffer.fill(), add full coverage (a6c38cf)

### 📚 Documentation

- capitalize PostgreJS consistently, rebuild BENCHMARKS.md for 3.0.0 (040d503)
- rewrite benchmark scenario descriptions as readable paragraphs (c1fc39f)
- document local SCRAM/MD5 test setup in CONTRIBUTING.md (086ec90)
- expand CONTRIBUTING.md with a full contributor workflow (35c83dc)
- tailor issue templates to a PostgreSQL driver (48adbd7)
- add a v2-to-v3 migration guide (ce32dac)
- rewrite README intro to lead with speed, memory, and features (0c6866f)
- expand CLAUDE.md with project orientation and testing techniques (99e2be3)

### 🧪 Tests

- cover pure utility functions, wire-protocol messages, and SASL/cert parsing (23ee21b)
- raise sql-tag.ts branch coverage, mark one path unreachable (72984b8)
- add full coverage for SafeEventEmitter (603aa92)
- add full coverage for the pgoutput logical-replication decoder (1bc9e6c)
- add full coverage for Int2VectorType (f3db0ec)
- add full coverage for OidVectorType (0835b57)
- add full coverage for LsegType (8ccfa19)
- add full coverage for CharType (069ecf1)
- raise connection-config.ts branch coverage (c56310f)
- raise prepared-statement.ts coverage (aea3be9)
- add full coverage for get-parsers.ts (f414562)
- add full coverage for CircleType (723a050)
- add full coverage for the remaining small scalar data types (a78120f)
- add coverage for the encodeText() pass-throughs on temporal types (021e400)
- add full coverage for parse-row.ts (1dbf82d)
- raise large-object.ts coverage (18c78a6)
- add full coverage for frontend.ts wire-message builders (e1a097b)
- raise cursor.ts coverage (63caed8)
- add full coverage for BoolType.encodeText() (91868a7)
- add full coverage for copy-stream.ts (91070bc)
- add direct unit coverage for LogicalReplication's pure logic (473d582)

### 🧹 Chores

- default the benchmark run config to the simple-query scenario (6ac84ea)
- relicense from MIT to BSD 3-Clause (5e2b453)
- strip explanatory comments from the row-buffer decode change (82e8c6d)
- use the new glob syntax in the benchmark run config (9515a88)
- fix istanbul-ignore comments this project's c8 doesn't honor (3b2ec4c)
- mark stringifyArrayLiteral's leaf-level array branch unreachable (6335e50)
- remove docker-compose setup, update benchmark paths and regenerate numbers (da41a91)

### 💬 General Changes

- Merge remote-tracking branch 'origin/main' into dev (f88c6cc)

---

## v3.0.0 (2026-09-06)

### ✨ Features

- opt-in query pipelining for Pool.query() and Pool.execute() (41d98ff)
- bulk import and export with COPY TO STDOUT / COPY FROM STDIN (89cd28a)
- cancel queries and time them out with an AbortSignal (12e84f1)
- build statements with the sql tag (1c6dfb4)
- two-phase commit with prepareTransaction and commitPrepared (1aa7095)
- try several hosts and pick one by role (3ec07fe)
- direct TLS negotiation, and only negotiate TLS when asked (a3b6544)
- SCRAM channel binding, and report what the server says when auth fails (fb69574)
- stream row changes with LogicalReplication (2146275)
- large object API (94fc89b)

### 🐛 Bug Fixes

- TLS downgrade, credential decoding, and data-corruption bugs found in audit (b1f8f1c)
- float4 precision loss and sslmode=prefer incorrectly requiring SSL (8b5aa9d)
- array literal parser treats apostrophe as a quote character (9fd6d9a)
- int4 OID auto-detection accepts values outside the 32-bit range (18e63bd)
- char OID auto-detection matches multi-byte characters, crashing bind (7609bff)
- midnight timestamps mis-detected as date instead of timestamp (e449395)
- numeric NaN/Infinity/-Infinity decode as 0 in binary format (4670fa4)
- prototype pollution via a query result column named "__proto__" (c85d76e)
- escapeLiteral silently passes through embedded NUL bytes (ffade2b)
- PreparedStatement.close() not idempotent, re-sends CLOSE+SYNC (b83349a)
- ParameterDescription parameter count read as Int32 instead of Int16 (299d8d4)
- CopyInResponse message code is 'g' rather than 'G' (ce611d2)
- jsonb text encoder wrote the binary version header, and add the last binary encoders (c99af41)
- oidvector was registered as a second array type of oid (af1f672)
- hang instead of an error when the server asks for GSSAPI or SSPI (ed2fc63)
- preserve caller stack traces in async error handling (95ef02e)

### ⚡ Performance and Optimizations

- reassemble backend messages in one allocation instead of concatenating every chunk (25465c8)
- rewrite the request/response pipeline and decode rows without per-column slices (fabbe36)

### 🔧 Refactoring

- name data type methods decode* to pair with encode* (c0d65a3)

### 📚 Documentation

- record class member order and loop-hoisting conventions (a65bfeb)
- add a feature comparison table and correct stale claims (1bb3919)
- record two-phase commit and drop the callback API row (ccf9a0a)
- record multi-host connections in the comparison (1106831)
- correct two names in the comparison table (0068377)
- record direct TLS negotiation, and drop the example section (a41046c)
- count encoder and decoder coverage per wire format (90e4c31)
- native bindings are partial, not a plain yes (eaae3f7)

### 🧹 Chores

- Updated dependencies (9d401d6)
- ignore benchmark output and correct the CI path filter (0c74ae4)
- add a benchmark suite comparing postgrejs, pg and postgres.js (affab97)

### 🎨 Code Style

- sort imports and align a comment left over from the decode* rename (983255f)

### 💬 General Changes

- Broadened eslint disable rule in bigint-methods.ts (d7ef074)
- Merge pull request #62 from panates/dev (7beff66)
- Changed import extension for `env.js` in init-pg.ts (78118b9)
- Removed unused `init-pg.ts`, adjusted imports, and updated path in tsconfig (87adb5d)
- Updated test matrix to include Node 26 and Postgres 18 (99f4802)
- Added CLAUDE.md with graphify usage rules (5c80923)
- correct grammar in connection.ts method comments (a0a0580)
- Updated gitignore to include claude and graphify (e2b392c)
- Remove outdated and unused badges from README.md (af9b312)
- Rebuild BENCHMARKS.md (a97b02f)
- Updated README.md (de2ea31)

---

## v2.23.1 (2026-07-07)

### 💬 General Changes

- Set min node test version to 20 (f727b24)
- Minor lint issue (2663cd1)
- Updated action/chechout version (32978d3)
- Merge pull request #61 from panates/dev (ef16733)
- Updated dependencies and switched to `import type` for cleaner type imports (91d3c1e)

---

## v2.23.0 (2026-04-03)

### 💬 General Changes

- Merge pull request #55 from panates/dev (13ee66c)
- Updated deps to support latest TypeScript and NodeJS. refactor: Removed cjs package support (d6fa916)

---

## v2.22.9 (2025-12-04)

### 🧹 Chores

- Updated deps (7121302)
- Code format (fae4584)

---

## v2.22.8 (2025-10-27)

### 🐛 Bug Fixes

- SmartBuffer grows when offset isn't at last (449cfb9)

### 💬 General Changes

- Merge pull request #54 from panates/dev (3c54434)
- npm Trusted publishing update (838c9d2)

---

## v2.22.7 (2025-10-21)

### 🧹 Chores

- Updated dependencies (6685d23)

### 💬 General Changes

- Merge pull request #52 from panates/dev (ed3d791)
- Removed path filter (d4c0cc0)

---

## v2.22.6 (2025-08-12)

### 🐛 Bug Fixes

- Fixed applicationName connection option has no effect issue. closes #51 (81ccc2e)

### 💬 General Changes

- Merge pull request #50 from panates/dev (79507bd)

---

## v2.22.5 (2025-08-06)

### 🐛 Bug Fixes

- Fixed global setup issue (3add4c4)
- Fixed node version in "if" condition (0734910)

### 🧹 Chores

- Updated dependencies (cbae2ad)

### 💬 General Changes

- Updated workflows (adde40a)
- Typing fixes and script fix (20e96e3)
- Added publishConfig (a88da87)
- Added "paths" filter (fa199ee)
- fix missing quotes in exception (08f44e4)
- Don't fail if husky is not present (306d957)

---

## v2.22.4 (2025-04-08)

### 💬 General Changes

- Moved from jest to mocha/c8 dev: Updated dependencies (9f3e061)

---

## v2.22.3 (2025-01-22)

### 🔧 Refactoring

- Fixed typescript check (8e2b843)
- Updated dependencies (8a1eafc)

### 🤖 Continuous Integration

- Fix purge pg error (0c69a55)

### 🧹 Chores

- Updated test workflow (a8248fe)
- Updated dependencies (89a61c7)

### 💬 General Changes

- Moved to ESLing 9 (ce0306a)

---

## v2.22.2 (2024-11-04)

### 🔧 Refactoring

- Improved displaying error line feat: Added "query" and "execute" events (3a6bbe9)

### 🧹 Chores

- Improved displaying error line (d9145f0)

---

## v2.22.1 (2024-10-16)

### 🧹 Chores

- Updated config (2980be5)

---

## v2.22.0 (2024-10-15)

### 🧹 Chores

- Added test-reporter workflow (ff4b555)
- Updated jest config (7a54fcc)
- Updated dependencies (1c7aac5)

---

## v2.21.1 (2024-09-20)

### 🐛 Bug Fixes

- Fixed error messages not showing issue (b1ac9be)
- unix socket connection issue (1653631)

### 🧹 Chores

- Move CI from circleci to GitHub Actions (e5e6d4d)
- Move CI from circleci to GitHub Actions #3 (187f12f)
- Move CI from circleci to GitHub Actions #4 (6c260f5)
- Move CI from circleci to GitHub Actions #5 (dbe687e)
- Move CI from circleci to GitHub Actions #6 (af38576)
- Move CI from circleci to GitHub Actions #7 (8bacf98)
- Move CI from circleci to GitHub Actions #8 (d5e2af2)
- Move CI from circleci to GitHub Actions #9 (b7211e9)
- Move CI from circleci to GitHub Actions #10 (8144035)
- Move CI from circleci to GitHub Actions #11 (a758c38)
- Move CI from circleci to GitHub Actions #12 (2088d6a)
- Move CI from circleci to GitHub Actions #13 (31e94bb)
- Added coveralls support (9deda5f)
- Added node 16, 20,  pg 16 (7458917)
- updated ci urls (f8ccd6f)
- updated dependencies (0166983)

---

## v2.21.0 (2024-09-14)

### 🧹 Chores

- fixed lint issues (f13dab2)

### 💬 General Changes

- Merge pull request #41 from WebHare/abort-on-close (bf4a487)

---

## v2.20.0 (2024-09-14)

### 🧹 Chores

- Typing improvements (d414463)

### 💬 General Changes

- Adds enough type information to be compatible with noImplicitAny: true (3b7b847)
- Add encodeAsNull (cb4e96b)
- Abort pending operations when the socket closes (705063a)
- Throw exception when trying to run query on a connection that is not yeat ready or closing/closed (96bd55b)

---

## v2.19.0 (2024-08-20)

### 💬 General Changes

- Fixed compatibility for "Node16" and "NodeNext" moduleResolution options (47b8fe6)

---

## v2.18.1 (2024-08-12)

### 💬 General Changes

- Applied publint to check package.json (8ce6bf1)

---

## v2.18.0 (2024-08-12)

### 🐛 Bug Fixes

- Added package.json in esm directory which overwrite "type" property to "module" (831bb08)

### 🧹 Chores

- Updated dependencies (f3cfc97)

---

## v2.17.1 (2024-08-12)

### 💬 General Changes

- Updated dependencies (06fad33)

---

## v2.17.0 (2024-08-12)

### 💬 General Changes

- Rollback to ES2020 (279aed6)

---

## v2.16.0 (2024-08-09)

### 💬 General Changes

- Made ready for Node16 moduleResolution (6632dc0)

---

## v2.15.4 (2024-08-03)

### 💬 General Changes

- Added "tslib" to dependencies Updated dependencies (5ddf563)

---

## v2.15.3 (2024-08-03)

### 💬 General Changes

- Added "tslib" to dependencies Updated dependencies (6744420)

---

## v2.15.2 (2024-07-28)

### 🧹 Chores

- Updated (526e6be)
- Updated homepage (b4304a7)
- Minor change (76e0d0f)

### 💬 General Changes

- Updated dependencies Updated homepage address in package.json (164644d)

---

## v2.15.1 (2024-07-22)

### 🧹 Chores

- Updated readme (c581284)
- Updated (a90a646)

### 💬 General Changes

- Implemented `sqlmode` query parameter for connection string and added `requireSSL` option to connection options. Now the driver tries SSL connection as a first choice. (3a27e85)
- Changed package name to `postgrejs` (5ec4852)
- Updated readme (72f6a1b)

---

## v2.12.0 (2024-07-12)

### 💬 General Changes

- Added root (81c1028)
- Update dependencies (acdf4dd)
- Added executor: node/default (2932861)
- Implemented `sqlmode` query parameter for connection string and added `requireSSL` option to connection options. Now the driver tries SSL connection as a first choice. (5fc7e31)

---

## v2.11.1 (2024-06-29)

### 💬 General Changes

- Updated Node version (3fde2b9)
- Migrated eslint config to @panates/eslint-config Moved to @panates/tsconfig (718f5fd)

---

## v2.11.0 (2024-04-23)

### 💬 General Changes

- Implement TC39 Explicit Resource Management proposal (cd5efa4)
- Updated dependencies (9dcf2c2)

---

## v2.10.7 (2024-04-22)

### 💬 General Changes

- Added prettier formatting (5e157f5)
- Add basic documentation on running the test suite. Add rimraf as dependency since its referenced by the scripts. Update the lockfile. Start to prepare for proper prettier formatting (4ca7b54)
- Remove developer content from the README and into CONTRIBUTING.md (58c2ce8)
- Use the README.md from master (ac3f7b8)
- Remove duplicated root in .editorconfig (a514ad5)
- Expose DatabaseError (5f1bbd2)

---

## v2.10.6 (2024-03-14)

### 💬 General Changes

- Updated dependencies (e0cf321)

---

## v2.10.5 (2024-01-15)

### 💬 General Changes

- Updated dependencies (f7b0db8)

---

## v2.10.4 (2024-01-12)

### 💬 General Changes

- Updated dependencies (efc17f2)

---

## v2.10.3 (2024-01-12)

### 💬 General Changes

- Update database-connection-params.ts (d3c09dd)
- Minor typing change (f036aa8)
- Updated dependencies (b1ec82a)

---

## v2.10.2 (2024-01-08)

### 💬 General Changes

- Updated dependencies (33a8272)

---

## v2.10.1 (2023-11-09)

### 💬 General Changes

- Some times server response invalid message to prepare statement message. (bb7a0c8)

---

## v2.10.0 (2023-11-09)

### 💬 General Changes

- Improved error message handling for more understandable to humans. (d9bbcb0)
- Error stack do not show caller function. (08a1a8f)

---

## v2.9.1 (2023-10-03)

### 💬 General Changes

- Added int2Vector data type with binary protocol (94a9a3b)

---

## v2.9.0 (2023-10-03)

### 💬 General Changes

- export numberBytesToString (9b28ea5)
- Support int2 and oid vector types (ce27006)
- Add OID for tid array (d99e3ee)
- Added int2Vector data type with binary protocol (55bd87e)

---

## v2.8.1 (2023-10-03)

### 💬 General Changes

- Add ability to configure buffer size (30d18c6)
- Updated dependencies (51998d4)
- Support 'debug' events on pgSocket (99538c7)
- Minor fix for logging (1af9e94)

---

## v2.8.0 (2023-09-24)

### 💬 General Changes

- Updated node versions (49c6eac)
- Updated config (8792c63)
- Add ability to configure buffer size (34d822a)

---

## v2.7.2 (2023-09-10)

### 🐛 Bug Fixes

- Make concurrency explicit, prevents power-tasks from invoking os.cpus (20038b0)

### 💬 General Changes

- Updated badge url (b9335ed)

---

## v2.7.1 (2023-08-03)

### 💬 General Changes

- export SmartBuffer (3ebe0fb)
- Fallback to "unknown" IOD, if can't determine data type (b0807e3)
- Export SmartBuffer fully (8fca283)
- Updated dependencies (114ffb9)

---

## v2.7.0 (2023-08-01)

### 💬 General Changes

- Restructure files according to current Panates standards (58875b3)
- Renames DatabaseConnectionParams.onErrorRollback to rollbackOnError Added "debug" event to Connection and Pool classes (dc50fb1)

---

## v2.6.1 (2023-08-01)

### 💬 General Changes

- Fixed typing for new eslint rules (f6e0d11)
- START is also a transaction command (equivalent to BEGIN) (9424025)
- Now DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. Improved builtin data types .isType methods (f2a20eb)

---

## v2.5.10 (2023-07-26)

### 💬 General Changes

- Added code of conduct document (9a64826)
- Fix 2 typos in DOCUMENTATION.md (af25532)
- Updated config (9655d4f)
- Updated dependencies (2a21190)

---

## v2.5.9 (2023-05-17)

### 💬 General Changes

- Fixed missing files."typings" (eabb616)

---

## v2.5.8 (2023-05-17)

### 💬 General Changes

- Optimized build (e8305f9)

---

## v2.5.7 (2023-05-16)

### 💬 General Changes

- Optimized build (17d029b)

---

## v2.5.6 (2023-05-16)

### 💬 General Changes

- Fixed examples for cursor usage (5971341)
- Removed vulnerable "debug" package (019b3f4)
- Updated config (6edd12e)
- Updated dependencies (afce5f7)

---

## v2.5.5 (2023-02-22)

### 💬 General Changes

- Updated examples (94e092a)
- Added auto changelog generation (0c7fc22)

---

## v2.5.3 (2023-02-20)

### 💬 General Changes

- Updated dependencies (b8501a2)
- Fix dbpool documentation example (b5ee509)

---

## v2.5.2 (2022-12-02)

### 💬 General Changes

- Updated dependencies (20abfde)

---

## v2.5.1 (2022-10-05)

### 💬 General Changes

- Added LISTEN/NOTIFY feature (73cb33b)
- Updated documentation (38093f6)

---

## v2.5.0 (2022-10-04)

### 💬 General Changes

- Added LISTEN/NOTIFY feature (f0ac754)

---

## v2.4.1 (2022-09-23)

### 💬 General Changes

- Updated dependencies (bebcd28)

---

## v2.4.0 (2022-09-22)

### 💬 General Changes

- Fixed exports for multi module support (e40dabe)

---

## v2.3.0 (2022-09-17)

### 💬 General Changes

- Updated lightning-pool to v4.0 Updated CircleCI config (4ae3adf)

---

## v2.2.0 (2022-09-17)

### 💬 General Changes

- Updated eslint and jest (229d394)

---

## v2.1.5 (2022-08-29)

### 💬 General Changes

- Updated eslint config (5ad54ee)

---

## v2.1.4 (2022-07-06)

### 💬 General Changes

- Fixed typing (70a7076)
- Updated readme (145afed)
- Updated dependencies (15ad62c)

---

## v2.1.3 (2022-06-28)

### 💬 General Changes

- Updated dependencies Updated README (8cef3fa)

---

## v2.1.2 (2022-06-24)

### 💬 General Changes

- Updated dependencies Updated README (ddeb02c)

---

## v2.1.1 (2022-06-21)

### 💬 General Changes

- Added prettier code style (c0b732e)
- Moved prettier to devDependencies (eecec11)

---

## v2.1.0 (2022-06-21)

### 💬 General Changes

- Added husky git hooks (d61fc2a)
- Added .js extensions to import statements for esm module support (dd884f1)
- Moved from putil-taskqueue to power-tasks (7782551)

---

## v2.0.4 (2022-06-17)

### 💬 General Changes

- Update dependencies Added default exports for both commonjs and esm (4b34c8b)

---

## v2.0.3 (2022-05-28)

### 💬 General Changes

- Update dependencies (b2ee542)

---

## v2.0.2 (2022-05-11)

### 💬 General Changes

- Added json casting for object values (b95766a)

---

## v2.0.1 (2022-05-08)

### 💬 General Changes

- Updated config (9fa5d12)
- Fixed cover script (ff3dbef)
- Updated dependencies and documentation (f7f93d6)

---

## v2.0.0 (2022-03-03)

### 💬 General Changes

- Added jsonb data type support Migrated from mocha to jest Migrated from travis to circleci (9b77962)
- Added ESM module support (97857e3)
- Updated dependencies (b43ae89)

---

## v1.21.6 (2022-02-22)

### 💬 General Changes

- Update issue templates (f84ec38)
- Updated dependencies (b8f05e2)

---

## v1.21.5 (2022-01-03)

### 💬 General Changes

- Updated dependencies (66da42d)

---

## v1.21.4 (2021-12-13)

### 💬 General Changes

- Updated readme (d5af7cd)

---

## v1.21.3 (2021-12-13)

### 💬 General Changes

- Updated dependencies (20fc14c)

---

## v1.21.2 (2021-10-12)

### 💬 General Changes

- Updated dependencies (68cdfed)

---

## v1.21.1 (2021-10-02)

### 💬 General Changes

- float numbers are recognized as bigint (1c19df4)
- Updated dependencies (5b4638b)

---

## v1.21.0 (2021-09-23)

### 💬 General Changes

- + Added releaseSavepoint() method (9fc61c9)

---

## v1.19.0 (2021-09-21)

### 💬 General Changes

- + Added onErrorRollback functionality for better transaction management (f92b65b)

---

## v1.18.4 (2021-09-14)

### 💬 General Changes

- Needs type casting of uuid[] types (b6b1b45)

---

## v1.18.3 (2021-09-08)

### 💬 General Changes

- Fixed invalid constructing of DatabaseError (e904539)

---

## v1.18.2 (2021-09-07)

### 💬 General Changes

- Updated dependencies (27d747f)

---

## v1.18.1 (2021-08-11)

### 💬 General Changes

- Fixed database error properties exists in parent msg object. (6d5ad49)

---

## v1.17.0 (2021-08-01)

### 💬 General Changes

- Added lineNr, colNr and line properties to DatabaseError (950bfb0)
- Updated dependencies (5e6a902)

---

## v1.16.7 (2021-07-03)

### 💬 General Changes

- throws "operator does not exist: integer = json" if bind param is null or undefined (f57bd9e)

---

## v1.16.6 (2021-07-03)

### 💬 General Changes

- Fix simple readme example (8c9608d)
- Update README.md (5bac71d)
- Updated dependencies (7298b3c)

---

## v1.16.5 (2021-04-19)

### 💬 General Changes

- Updated readme (efbc574)
- Updated dependencies (c7e0bb0)

---

## v1.16.4 (2021-04-08)

### 💬 General Changes

- Detect time format strings (14f8871)
- Updated dependencies (8e916c6)

---

## v1.16.3 (2021-04-07)

### 💬 General Changes

- Updated doc (54b72be)

---

## v1.16.2 (2021-04-07)

### 💬 General Changes

- Added missed type mappings (f45124a)
- Fixed time data type issue (bf80893)

---

## v1.16.1 (2021-04-06)

### 💬 General Changes

- Fixed unused variable issue (47fcb75)

---

## v1.16.0 (2021-04-06)

### 💬 General Changes

- Added Time data type (127fb81)

---

## v1.15.1 (2021-03-19)

### 💬 General Changes

- Use default config (6f3e692)

---

## v1.15.0 (2021-03-07)

### 💬 General Changes

- Added "name" (OID:19) data type to data type map (6f56e2d)

---

## v1.14.2 (2021-03-05)

### 💬 General Changes

- Dont add COMMIT to execute sql if not in transaction. (8f57c30)

---

## v1.14.1 (2021-02-16)

### 💬 General Changes

- Now can detect uuid value when binding parameters (72a4ba0)

---

## v1.14.0 (2021-02-15)

### 💬 General Changes

- Added support for UUID data type (d3cfbfd)

---

## v1.13.2 (2021-01-31)

### 💬 General Changes

- Updated dependencies (ffddee3)

---

## v1.13.0 (2021-01-28)

### 💬 General Changes

- Added fetchAsString option for Date, Timestamp and TimestampTz (1d77cd1)

---

## v1.12.0 (2021-01-28)

### 💬 General Changes

- Set test schema (ec18c02)
- Added fetchAsString option for Date, Timestamp and TimestampTz (18fa21c)

---

## v1.11.4 (2020-12-24)

### 💬 General Changes

- Check if fetchCount value between unsigned inter range (cc35ee3)

---

## v1.11.2 (2020-12-24)

### 💬 General Changes

- Does not determine data type in register order. (e27ea7a)

---

## v1.11.1 (2020-12-10)

### 💬 General Changes

- Calling fetch of a closed cursor will not throw anymore (bacb630)

---

## v1.11.0 (2020-12-10)

### 💬 General Changes

- Automatically convert BigInt numbers to formal number if value in safe integer range (110c544)
- Updated dependencies (f1e23d4)

---

## v1.10.1 (2020-12-09)

### 💬 General Changes

- Wrong message sending when parameters contains null values (59e5bf4)

---

## v1.10.0 (2020-12-05)

### 💬 General Changes

- Added "numeric" data type (a0a6068)

---

## v1.9.2 (2020-11-25)

### 💬 General Changes

- Added "debug" package (f365962)

---

## v1.9.1 (2020-11-24)

### 💬 General Changes

- Added "debug" package (618a239)

---

## v1.9.0 (2020-11-20)

### 💬 General Changes

- Changed ConnectionConfiguration.searchPath to "schema" (e6df86b)

---

## v1.8.1 (2020-11-20)

### 💬 General Changes

- Added rowType to all result interfaces (edfaec6)

---

## v1.8.0 (2020-11-20)

### 💬 General Changes

- Added rowType to all result interfaces (4bc26a7)

---

## v1.7.0 (2020-11-20)

### 💬 General Changes

- Added rowType getter to Cursor (045a2a2)
- Linted for code quality (73dad79)

---

## v1.6.0 (2020-11-20)

### 💬 General Changes

- Improved auto-commit operations by detecting sql is a transaction command (ab8e698)

---

## v1.5.1 (2020-11-19)

### 💬 General Changes

- query() does not return fields property if cursor option is true (6acec29)

---

## v1.5.0 (2020-11-19)

### 💬 General Changes

- Added autoCommit option for connection.execute() and connection.query() methods. (d75e939)

---

## v1.4.0 (2020-11-19)

### 💬 General Changes

- Missed sendSyncMessage (356af56)
- Missed sendSyncMessage after parse query. Check in transaction to prevent unnecessary transaction start/commit/rollback queries. (d8a906e)

---

## v1.3.1 (2020-11-19)

### 💬 General Changes

- Updated dependencies (c413990)

---

## v1.3.0 (2020-11-19)

### 💬 General Changes

- Updated roadmap (b0605e3)
- Updated lightning-pool to new major version 3.0 (1ae9f50)

---

## v1.2.3 (2020-11-17)

### 💬 General Changes

- Added sessionParameters getter (4599db8)

---

## v1.2.2 (2020-11-17)

### 💬 General Changes

- Added isClosed property (c9b54f7)

---

## v1.2.1 (2020-11-17)

### 💬 General Changes

- Major changes for FieldInfo (32d2e08)
- Expose Cursor class (1dc2de1)

---

## v1.2.0 (2020-11-17)

### 💬 General Changes

- Major changes for FieldInfo Added DataTypeNames map Changed DataTypeOIDs keys to original postgres names (982d8ec)

---

## v1.1.1 (2020-11-16)

### 💬 General Changes

- Added dataTypeName to FieldInfo (6a9227d)

---

## v1.1.0 (2020-11-16)

### 💬 General Changes

- Added elementDataTypeId and mappedType properties to FieldInfo (b554f07)

---

## v1.0.5 (2020-11-16)

### 💬 General Changes

- Added ability to get processId and secretKey (95bc84f)
- Added fetch() method to cursor (4c98b80)

---

## v1.0.4 (2020-11-16)

### 💬 General Changes

- Added ability to get processId and secretKey (acaf2d5)

---

## v1.0.3 (2020-11-16)

### 💬 General Changes

- Fixed wrong repository address (ae3b149)

---

## v1.0.2 (2020-11-16)

### 💬 General Changes

- Test fixed (0754ee8)
- DOCUMENTATION.md is missing in files property (2d24c5f)

---

## v1.0.1 (2020-11-16)

### 💬 General Changes

- Initial commit (441d590)
- Implemented extended query (7dea1f0)
- Data types implementation and tests done (6ba0ed5)
- ScriptExecutor test passing (79ee783)
- Beta 1 commit (86195d8)
- Added int64 support for node<12 (8637e98)
- Added house keeping ability to SmartBuffer (efc4fff)
- Updated travis url (3e3b661)
- Beta 2 commit (17d3eb6)
- 1.0 stable (df5c83e)
