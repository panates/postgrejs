## Changelog

### [v2.22.7](https://github.com/panates/postgrejs/compare/v2.22.6...v2.22.7) - 

#### 💬 General Changes

- dev: Removed path filter @Eray Hanoğlu 

### [v2.22.6](https://github.com/panates/postgrejs/compare/v2.22.5...v2.22.6) -  12 August 2025 

- fix: Fixed applicationName connection option has no effect issue. closes #51

### [v2.22.5](https://github.com/panates/postgrejs/compare/v2.22.4...v2.22.5) -  6 August 2025 

#### 🪲 Fixes

- fix: Fixed global setup issue @Eray Hanoğlu 
- fix: Fixed node version in "if" condition @Eray Hanoğlu 

#### 💬 General Changes

- dev: Updated workflows @Eray Hanoğlu 
- dev: Typing fixes and script fix @Eray Hanoğlu 
- dev: Added "paths" filter @Eray Hanoğlu 
- dev: Typing fixes and script fix @Eray Hanoğlu 
- dev: Added publishConfig @Eray Hanoğlu 

### [v2.22.4](https://github.com/panates/postgrejs/compare/v2.22.3...v2.22.4) -  8 April 2025 

#### 💬 General Changes

- dev: Moved from jest to mocha/c8 @Eray Hanoğlu 

### [v2.22.3](https://github.com/panates/postgrejs/compare/v2.22.2...v2.22.3) -  22 January 2025 

#### 🛠 Refactoring and Updates

- refactor: Updated dependencies @Eray Hanoğlu 
- refactor: Fixed typescript check @Eray Hanoğlu 

#### 💬 General Changes

- dev: Moved to ESLing 9 @Eray Hanoğlu 
- ci: Fix purge pg error @Eray Hanoğlu 
- ci: Fix purge pg error @Eray Hanoğlu 
- ci: Fix purge pg error @Eray Hanoğlu 
- ci: Fix purge pg error @Eray Hanoğlu 

### [v2.22.2](https://github.com/panates/postgrejs/compare/v2.22.1...v2.22.2) -  4 November 2024 

#### 🚀 New Features

- refactor: Improved displaying error line @Eray Hanoğlu 

#### 🛠 Refactoring and Updates

- refactor: Improved displaying error line @Eray Hanoğlu 

### [v2.22.1](https://github.com/panates/postgrejs/compare/v2.22.0...v2.22.1) -  16 October 2024 

### [v2.22.0](https://github.com/panates/postgrejs/compare/v2.21.1...v2.22.0) -  15 October 2024 

### [v2.21.1](https://github.com/panates/postgrejs/compare/v2.21.0...v2.21.1) -  20 September 2024 

#### 🪲 Fixes

- fix: Fixed error messages not showing issue @Eray Hanoğlu 
- fix: unix socket connection issue @Eray Hanoğlu 

### [v2.21.0](https://github.com/panates/postgrejs/compare/v2.20.0...v2.21.0) -  14 September 2024 

- Abort connections/queries on close

#### 💬 General Changes

- Abort pending operations when the socket closes @Rob Hulswit 
- Throw exception when trying to run query on a connection that is not yeat ready or closing/closed @Rob Hulswit 

### [v2.20.0](https://github.com/panates/postgrejs/compare/v2.19.0...v2.20.0) -  14 September 2024 

- Add encodeAsNull
- Adds enough type information to be compatible with noImplicitAny: true

### [v2.19.0](https://github.com/panates/postgrejs/compare/v2.18.1...v2.19.0) -  20 August 2024 

#### 💬 General Changes

- Fixed compatibility for "Node16" and "NodeNext" moduleResolution options @Eray Hanoğlu 
- Fixed compatibility for "Node16" and "NodeNext" moduleResolution options @Eray Hanoğlu 

### [v2.18.1](https://github.com/panates/postgrejs/compare/v2.18.0...v2.18.1) -  12 August 2024 

#### 💬 General Changes

- Applied publint to check package.json @Eray Hanoğlu 

### [v2.18.0](https://github.com/panates/postgrejs/compare/v2.17.1...v2.18.0) -  12 August 2024 

#### 🪲 Fixes

- Fix: Added package.json in esm directory which overwrite "type" property to "module" @Eray Hanoğlu 

### [v2.17.1](https://github.com/panates/postgrejs/compare/v2.17.0...v2.17.1) -  12 August 2024 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.17.0](https://github.com/panates/postgrejs/compare/v2.16.0...v2.17.0) -  12 August 2024 

#### 💬 General Changes

- Rollback to ES2020 @Eray Hanoğlu 
- Rollback to ES2020 @Eray Hanoğlu 

### [v2.16.0](https://github.com/panates/postgrejs/compare/v2.15.4...v2.16.0) -  9 August 2024 

#### 💬 General Changes

- Made ready for Node16 moduleResolution @Eray Hanoğlu 

### [v2.15.4](https://github.com/panates/postgrejs/compare/v2.15.3...v2.15.4) -  3 August 2024 

#### 💬 General Changes

- Added "tslib" to dependencies @Eray Hanoğlu 

### [v2.15.3](https://github.com/panates/postgrejs/compare/v2.15.2...v2.15.3) -  3 August 2024 

#### 💬 General Changes

- Added "tslib" to dependencies @Eray Hanoğlu 

### [v2.15.2](https://github.com/panates/postgrejs/compare/v2.15.1...v2.15.2) -  28 July 2024 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.15.1](https://github.com/panates/postgrejs/compare/v2.12.0...v2.15.1) -  22 July 2024 

#### 💬 General Changes

- Changed package name to `postgrejs` @Eray Hanoğlu 
- Updated readme @Eray Hanoğlu 
- Implemented `sqlmode` query parameter for connection string and added `requireSSL` option to connection options. Now the driver tries SSL connection as a first choice. @Eray Hanoğlu 
- Updated readme @Eray Hanoğlu 

### [v2.12.0](https://github.com/panates/postgrejs/compare/v2.11.2...v2.12.0) -  12 July 2024 

#### 💬 General Changes

- Update dependencies @Eray Hanoğlu 
- Implemented `sqlmode` query parameter for connection string and added `requireSSL` option to connection options. Now the driver tries SSL connection as a first choice. @Eray Hanoğlu 
- Update dependencies @Eray Hanoğlu 
- Update dependencies @Eray Hanoğlu 
- Added executor: node/default @Eray Hanoğlu 
- Added root @Eray Hanoğlu 

### [v2.11.2](https://github.com/panates/postgrejs/compare/v2.11.1...v2.11.2) -  29 June 2024 

### [v2.11.1](https://github.com/panates/postgrejs/compare/v2.11.0...v2.11.1) -  29 June 2024 

#### 💬 General Changes

- Migrated eslint config to @panates/eslint-config @Eray Hanoğlu 
- Migrated eslint config to @panates/eslint-config @Eray Hanoğlu 
- Updated Node version @Eray Hanoğlu 

### [v2.11.0](https://github.com/panates/postgrejs/compare/v2.10.7...v2.11.0) -  23 April 2024 

- Implement js disposal

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Implement TC39 Explicit Resource Management proposal @Eray Hanoğlu 
- Implement TC39 Explicit Resource Management proposal @Eray Hanoğlu 

### [v2.10.7](https://github.com/panates/postgrejs/compare/v2.10.6...v2.10.7) -  22 April 2024 

- Prepare for formatting application + minor docs updates

#### 💬 General Changes

- Added prettier formatting @Eray Hanoğlu 
- Remove developer content from the README and into CONTRIBUTING.md @Jacob Roberts 
- Add basic documentation on running the test suite. Add rimraf as dependency since its referenced by the scripts. Update the lockfile. Start to prepare for proper prettier formatting @Jacob Roberts 
- Added prettier formatting @Eray Hanoğlu 
- Added prettier formatting @Eray Hanoğlu 
- Added prettier formatting @Eray Hanoğlu 
- Expose DatabaseError @Eray Hanoğlu 
- Remove duplicated root in .editorconfig @Jacob Roberts 
- Use the README.md from master @Jacob Roberts 
- Added prettier formatting @Eray Hanoğlu 

### [v2.10.6](https://github.com/panates/postgrejs/compare/v2.10.5...v2.10.6) -  14 March 2024 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Updated dependencies @Eray Hanoğlu 

### [v2.10.5](https://github.com/panates/postgrejs/compare/v2.10.4...v2.10.5) -  15 January 2024 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.10.4](https://github.com/panates/postgrejs/compare/v2.10.3...v2.10.4) -  12 January 2024 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.10.3](https://github.com/panates/postgrejs/compare/v2.10.2...v2.10.3) -  12 January 2024 

- Update database-connection-params.ts

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Minor typing change @Eray Hanoğlu 

### [v2.10.2](https://github.com/panates/postgrejs/compare/v2.10.1...v2.10.2) -  8 January 2024 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.10.1](https://github.com/panates/postgrejs/compare/v2.10.0...v2.10.1) -  9 November 2023 

#### 💬 General Changes

- Fixed: Some times server response invalid message to prepare statement message. @Eray Hanoğlu 

### [v2.10.0](https://github.com/panates/postgrejs/compare/v2.9.1...v2.10.0) -  9 November 2023 

#### 💬 General Changes

- Fixed: Error stack do not show caller function. @Eray Hanoğlu 
- Improved error message handling for more understandable to humans. @Eray Hanoğlu 

### [v2.9.1](https://github.com/panates/postgrejs/compare/v2.9.0...v2.9.1) -  3 October 2023 

- export numberBytesToString

#### 💬 General Changes

- Added int2Vector data type with binary protocol @Eray Hanoğlu 

### [v2.9.0](https://github.com/panates/postgrejs/compare/v2.8.1...v2.9.0) -  3 October 2023 

- Feature/add types

#### 💬 General Changes

- Added int2Vector data type with binary protocol @Eray Hanoğlu 
- Support int2 and oid vector types @Arnold Hendriks 
- Add OID for tid array @Rob Hulswit 

### [v2.8.1](https://github.com/panates/postgrejs/compare/v2.8.0...v2.8.1) -  3 October 2023 

- Support 'debug' events on pgSocket

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Updated dependencies @Eray Hanoğlu 
- Add ability to configure buffer size @Eray Hanoğlu 
- Minor fix for logging @Eray Hanoğlu 

### [v2.8.0](https://github.com/panates/postgrejs/compare/v2.7.2...v2.8.0) -  24 September 2023 

#### 💬 General Changes

- Add ability to configure buffer size @Eray Hanoğlu 
- Updated config @Eray Hanoğlu 
- Updated node versions @Eray Hanoğlu 
- Updated config @Eray Hanoğlu 
- Updated node versions @Eray Hanoğlu 
- Updated config @Eray Hanoğlu 
- Updated node versions @Eray Hanoğlu 

### [v2.7.2](https://github.com/panates/postgrejs/compare/v2.7.1...v2.7.2) -  10 September 2023 

#### 🪲 Fixes

- Fix: Make concurrency explicit, prevents power-tasks from invoking os.cpus @Eray Hanoğlu 

#### 💬 General Changes

- Updated badge url @Eray Hanoğlu 

### [v2.7.1](https://github.com/panates/postgrejs/compare/v2.7.0...v2.7.1) -  3 August 2023 

- export SmartBuffer

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Fallback to "unknown" IOD, if can't determine data type @Eray Hanoğlu 
- Export SmartBuffer fully @Eray Hanoğlu 

### [v2.7.0](https://github.com/panates/postgrejs/compare/v2.6.1...v2.7.0) -  1 August 2023 

#### 💬 General Changes

- Restructure files according to current Panates standards @Eray Hanoğlu 
- Renames DatabaseConnectionParams.onErrorRollback to rollbackOnError @Eray Hanoğlu 

### [v2.6.1](https://github.com/panates/postgrejs/compare/v2.6.0...v2.6.1) -  1 August 2023 

- START is also a transaction command (equivalent to BEGIN)

#### 💬 General Changes

- Now DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. @Eray Hanoğlu 
- Now DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. @Eray Hanoğlu 
- Now DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. @Eray Hanoğlu 

### [v2.6.0](https://github.com/panates/postgrejs/compare/v2.5.10...v2.6.0) -  1 August 2023 

#### 💬 General Changes

- Not DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. @Eray Hanoğlu 
- Fixed typing for new eslint rules @Eray Hanoğlu 
- Fixed typing for new eslint rules @Eray Hanoğlu 

### [v2.5.10](https://github.com/panates/postgrejs/compare/v2.5.9...v2.5.10) -  26 July 2023 

- Fix 2 typos in DOCUMENTATION.md

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Added code of conduct document @Eray Hanoğlu 
- Updated config @Eray Hanoğlu 

### [v2.5.9](https://github.com/panates/postgrejs/compare/v2.5.8...v2.5.9) -  17 May 2023 

#### 💬 General Changes

- Fixed missing files."typings" @Eray Hanoğlu 

### [v2.5.8](https://github.com/panates/postgrejs/compare/v2.5.7...v2.5.8) -  17 May 2023 

#### 💬 General Changes

- Optimized build @Eray Hanoğlu 

### [v2.5.7](https://github.com/panates/postgrejs/compare/v2.5.6...v2.5.7) -  16 May 2023 

#### 💬 General Changes

- Optimized build @Eray Hanoğlu 

### [v2.5.6](https://github.com/panates/postgrejs/compare/v2.5.5...v2.5.6) -  16 May 2023 

#### 💬 General Changes

- Removed vulnerable "debug" package @Eray Hanoğlu 
- Updated dependencies @Eray Hanoğlu 
- Fixed examples for cursor usage @Eray Hanoğlu 
- Updated config @Eray Hanoğlu 

### [v2.5.5](https://github.com/panates/postgrejs/compare/v2.5.3...v2.5.5) -  22 February 2023 

- Fix dbpool documentation example

#### 💬 General Changes

- Added auto changelog generation @Eray Hanoğlu 
- Updated examples @Eray Hanoğlu 
- Added auto changelog generation @Eray Hanoğlu 

### [v2.5.3](https://github.com/panates/postgrejs/compare/v2.5.2...v2.5.3) -  20 February 2023 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Updated dependencies @Eray Hanoğlu 

### [v2.5.2](https://github.com/panates/postgrejs/compare/v2.5.1...v2.5.2) -  2 December 2022 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.5.1](https://github.com/panates/postgrejs/compare/v2.5.0...v2.5.1) -  5 October 2022 

#### 💬 General Changes

- Updated documentation @Eray Hanoğlu 
- Added LISTEN/NOTIFY feature @Eray Hanoğlu 

### [v2.5.0](https://github.com/panates/postgrejs/compare/v2.4.1...v2.5.0) -  4 October 2022 

#### 💬 General Changes

- Added LISTEN/NOTIFY feature @Eray Hanoğlu 

### [v2.4.1](https://github.com/panates/postgrejs/compare/v2.4.0...v2.4.1) -  23 September 2022 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.4.0](https://github.com/panates/postgrejs/compare/v2.3.0...v2.4.0) -  22 September 2022 

#### 💬 General Changes

- Fixed exports for multi module support @Eray Hanoğlu 

### [v2.3.0](https://github.com/panates/postgrejs/compare/v2.2.0...v2.3.0) -  17 September 2022 

#### 💬 General Changes

- Updated lightning-pool to v4.0 @Eray Hanoğlu 

### [v2.2.0](https://github.com/panates/postgrejs/compare/v2.1.5...v2.2.0) -  17 September 2022 

#### 💬 General Changes

- Updated eslint and jest @Eray Hanoğlu 

### [v2.1.5](https://github.com/panates/postgrejs/compare/v2.1.4...v2.1.5) -  29 August 2022 

#### 💬 General Changes

- Updated eslint config @Eray Hanoğlu 

### [v2.1.4](https://github.com/panates/postgrejs/compare/v2.1.3...v2.1.4) -  6 July 2022 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Updated readme @Eray Hanoğlu 
- Fixed typing @Eray Hanoğlu 

### [v2.1.3](https://github.com/panates/postgrejs/compare/v2.1.2...v2.1.3) -  28 June 2022 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.1.2](https://github.com/panates/postgrejs/compare/v2.1.1...v2.1.2) -  24 June 2022 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v2.1.1](https://github.com/panates/postgrejs/compare/v2.1.0...v2.1.1) -  21 June 2022 

#### 💬 General Changes

- Added prettier code style @Eray Hanoğlu 
- Moved prettier to devDependencies @Eray Hanoğlu 

### [v2.1.0](https://github.com/panates/postgrejs/compare/v2.0.4...v2.1.0) -  21 June 2022 

#### 💬 General Changes

- Added .js extensions to import statements for esm module support @Eray Hanoğlu 
- Moved from putil-taskqueue to power-tasks @Eray Hanoğlu 
- Added husky git hooks @Eray Hanoğlu 

### [v2.0.4](https://github.com/panates/postgrejs/compare/v2.0.3...v2.0.4) -  17 June 2022 

#### 💬 General Changes

- Update dependencies @Eray Hanoğlu 

### [v2.0.3](https://github.com/panates/postgrejs/compare/v2.0.2...v2.0.3) -  28 May 2022 

#### 💬 General Changes

- Update dependencies @Eray Hanoğlu 

### [v2.0.2](https://github.com/panates/postgrejs/compare/v2.0.1...v2.0.2) -  11 May 2022 

#### 💬 General Changes

- Added json casting for object values @Eray Hanoğlu 

### [v2.0.1](https://github.com/panates/postgrejs/compare/v2.0.0...v2.0.1) -  8 May 2022 

#### 💬 General Changes

- Updated dependencies and documentation @Eray Hanoğlu 
- Updated config @Eray Hanoğlu 
- Updated dependencies and documentation @Eray Hanoğlu 
- Fixed cover script @Eray Hanoğlu 
- Updated config @Eray Hanoğlu 

## [v2.0.0](https://github.com/panates/postgrejs/compare/v1.21.6...v2.0.0) -  3 March 2022 

#### 💬 General Changes

- Added jsonb data type support @Eray Hanoğlu 
- Added ESM module support @Eray Hanoğlu 
- Updated dependencies @Eray Hanoğlu 
- Update issue templates @Eray Hanoglu 
- Updated dependencies @Eray Hanoğlu 
- Added ESM module support @Eray Hanoğlu 

### [v1.21.6](https://github.com/panates/postgrejs/compare/v1.21.5...v1.21.6) -  22 February 2022 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v1.21.5](https://github.com/panates/postgrejs/compare/v1.21.4...v1.21.5) -  3 January 2022 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v1.21.4](https://github.com/panates/postgrejs/compare/v1.21.3...v1.21.4) -  13 December 2021 

#### 💬 General Changes

- Updated readme @Eray Hanoğlu 

### [v1.21.3](https://github.com/panates/postgrejs/compare/v1.21.2...v1.21.3) -  13 December 2021 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v1.21.2](https://github.com/panates/postgrejs/compare/v1.21.1...v1.21.2) -  12 October 2021 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Updated dependencies @Eray Hanoğlu 

### [v1.21.1](https://github.com/panates/postgrejs/compare/v1.21.0...v1.21.1) -  2 October 2021 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Fixed: float numbers are recognized as bigint @Eray Hanoğlu 

### [v1.21.0](https://github.com/panates/postgrejs/compare/v1.20.0...v1.21.0) -  23 September 2021 

#### 💬 General Changes

- + Added releaseSavepoint() method @Eray Hanoğlu 

### [v1.20.0](https://github.com/panates/postgrejs/compare/v1.19.0...v1.20.0) -  21 September 2021 

### [v1.19.0](https://github.com/panates/postgrejs/compare/v1.18.4...v1.19.0) -  21 September 2021 

#### 💬 General Changes

- + Added onErrorRollback functionality for better transaction management @Eray Hanoğlu 

### [v1.18.4](https://github.com/panates/postgrejs/compare/v1.18.3...v1.18.4) -  14 September 2021 

#### 💬 General Changes

- Fixed: Needs type casting of uuid[] types @Eray Hanoğlu 

### [v1.18.3](https://github.com/panates/postgrejs/compare/v1.18.2...v1.18.3) -  8 September 2021 

#### 💬 General Changes

- Fixed invalid constructing of DatabaseError @Eray Hanoğlu 

### [v1.18.2](https://github.com/panates/postgrejs/compare/v1.18.1...v1.18.2) -  7 September 2021 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v1.18.1](https://github.com/panates/postgrejs/compare/v1.18.0...v1.18.1) -  11 August 2021 

#### 💬 General Changes

- Fixed database error properties exists in parent msg object. @Eray Hanoğlu 

### [v1.18.0](https://github.com/panates/postgrejs/compare/v1.17.0...v1.18.0) -  1 August 2021 

### [v1.17.0](https://github.com/panates/postgrejs/compare/v1.16.7...v1.17.0) -  1 August 2021 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Added lineNr, colNr and line properties to DatabaseError @Eray Hanoğlu 

### [v1.16.7](https://github.com/panates/postgrejs/compare/v1.16.6...v1.16.7) -  3 July 2021 

#### 💬 General Changes

- Fixed: throws "operator does not exist: integer = json" if bind param is null or undefined @Eray Hanoğlu 

### [v1.16.6](https://github.com/panates/postgrejs/compare/v1.16.5...v1.16.6) -  3 July 2021 

- Fix simple readme example

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Update README.md @Eray Hanoglu 

### [v1.16.5](https://github.com/panates/postgrejs/compare/v1.16.4...v1.16.5) -  19 April 2021 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Updated readme @Eray Hanoğlu 

### [v1.16.4](https://github.com/panates/postgrejs/compare/v1.16.3...v1.16.4) -  8 April 2021 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Detect time format strings @Eray Hanoğlu 

### [v1.16.3](https://github.com/panates/postgrejs/compare/v1.16.2...v1.16.3) -  7 April 2021 

#### 💬 General Changes

- Updated doc @Eray Hanoğlu 

### [v1.16.2](https://github.com/panates/postgrejs/compare/v1.16.1...v1.16.2) -  7 April 2021 

#### 💬 General Changes

- Fixed time data type issue @Eray Hanoğlu 
- Added missed type mappings @Eray Hanoğlu 

### [v1.16.1](https://github.com/panates/postgrejs/compare/v1.16.0...v1.16.1) -  6 April 2021 

- Fixed unused variable issue

### [v1.16.0](https://github.com/panates/postgrejs/compare/v1.15.1...v1.16.0) -  6 April 2021 

#### 💬 General Changes

- Added Time data type @Eray Hanoğlu 

### [v1.15.1](https://github.com/panates/postgrejs/compare/v1.15.0...v1.15.1) -  19 March 2021 

#### 💬 General Changes

- Use default config @Eray Hanoğlu 

### [v1.15.0](https://github.com/panates/postgrejs/compare/v1.14.2...v1.15.0) -  7 March 2021 

#### 💬 General Changes

- Added "name" (OID:19) data type to data type map @Eray Hanoğlu 

### [v1.14.2](https://github.com/panates/postgrejs/compare/v1.14.1...v1.14.2) -  5 March 2021 

#### 💬 General Changes

- Dont add COMMIT to execute sql if not in transaction. @Eray Hanoğlu 

### [v1.14.1](https://github.com/panates/postgrejs/compare/v1.14.0...v1.14.1) -  16 February 2021 

#### 💬 General Changes

- Now can detect uuid value when binding parameters @Eray Hanoğlu 

### [v1.14.0](https://github.com/panates/postgrejs/compare/v1.13.2...v1.14.0) -  15 February 2021 

#### 💬 General Changes

- Added support for UUID data type @Eray Hanoğlu 

### [v1.13.2](https://github.com/panates/postgrejs/compare/v1.13.1...v1.13.2) -  31 January 2021 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v1.13.1](https://github.com/panates/postgrejs/compare/v1.13.0...v1.13.1) -  30 January 2021 

### [v1.13.0](https://github.com/panates/postgrejs/compare/v1.12.1...v1.13.0) -  28 January 2021 

#### 💬 General Changes

- Added fetchAsString option for Date, Timestamp and TimestampTz @Eray Hanoğlu 

### [v1.12.1](https://github.com/panates/postgrejs/compare/v1.12.0...v1.12.1) -  28 January 2021 

### [v1.12.0](https://github.com/panates/postgrejs/compare/v1.11.4...v1.12.0) -  28 January 2021 

#### 💬 General Changes

- Added fetchAsString option for Date, Timestamp and TimestampTz @Eray Hanoğlu 
- Set test schema @Eray Hanoğlu 
- Set test schema @Eray Hanoğlu 

### [v1.11.4](https://github.com/panates/postgrejs/compare/v1.11.3...v1.11.4) -  24 December 2020 

#### 💬 General Changes

- Check if fetchCount value between unsigned inter range @Eray Hanoğlu 

### [v1.11.3](https://github.com/panates/postgrejs/compare/v1.11.2...v1.11.3) -  24 December 2020 

### [v1.11.2](https://github.com/panates/postgrejs/compare/v1.11.1...v1.11.2) -  24 December 2020 

#### 💬 General Changes

- Fixed: Does not determine data type in register order. @Eray Hanoğlu 

### [v1.11.1](https://github.com/panates/postgrejs/compare/v1.11.0...v1.11.1) -  10 December 2020 

#### 💬 General Changes

- Calling fetch of a closed cursor will not throw anymore @Eray Hanoğlu 

### [v1.11.0](https://github.com/panates/postgrejs/compare/v1.10.1...v1.11.0) -  10 December 2020 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 
- Automatically convert BigInt numbers to formal number if value in safe integer range @Eray Hanoğlu 
- Updated dependencies @Eray Hanoğlu 

### [v1.10.1](https://github.com/panates/postgrejs/compare/v1.10.0...v1.10.1) -  9 December 2020 

#### 💬 General Changes

- Fixed: Wrong message sending when parameters contains null values @Eray Hanoğlu 

### [v1.10.0](https://github.com/panates/postgrejs/compare/v1.9.2...v1.10.0) -  5 December 2020 

#### 💬 General Changes

- Added "numeric" data type @Eray Hanoğlu 
- Added "numeric" data type @Eray Hanoğlu 

### [v1.9.2](https://github.com/panates/postgrejs/compare/v1.9.1...v1.9.2) -  25 November 2020 

#### 💬 General Changes

- Added "debug" package @Eray Hanoğlu 

### [v1.9.1](https://github.com/panates/postgrejs/compare/v1.9.0...v1.9.1) -  24 November 2020 

#### 💬 General Changes

- Added "debug" package @Eray Hanoğlu 
- Added "debug" package @Eray Hanoğlu 

### [v1.9.0](https://github.com/panates/postgrejs/compare/v1.8.1...v1.9.0) -  20 November 2020 

#### 💬 General Changes

- Changed ConnectionConfiguration.searchPath to "schema" @Eray Hanoğlu 
- Changed ConnectionConfiguration.searchPath to "schema" @Eray Hanoğlu 

### [v1.8.1](https://github.com/panates/postgrejs/compare/v1.8.0...v1.8.1) -  20 November 2020 

#### 💬 General Changes

- Added rowType to all result interfaces @Eray Hanoğlu 

### [v1.8.0](https://github.com/panates/postgrejs/compare/v1.7.1...v1.8.0) -  20 November 2020 

#### 💬 General Changes

- Added rowType to all result interfaces @Eray Hanoğlu 

### [v1.7.1](https://github.com/panates/postgrejs/compare/v1.7.0...v1.7.1) -  20 November 2020 

### [v1.7.0](https://github.com/panates/postgrejs/compare/v1.6.0...v1.7.0) -  20 November 2020 

#### 💬 General Changes

- Linted for code quality @Eray Hanoğlu 
- Added rowType getter to Cursor @Eray Hanoğlu 

### [v1.6.0](https://github.com/panates/postgrejs/compare/v1.5.1...v1.6.0) -  20 November 2020 

#### 💬 General Changes

- Improved auto-commit operations by detecting sql is a transaction command @Eray Hanoğlu 

### [v1.5.1](https://github.com/panates/postgrejs/compare/v1.5.0...v1.5.1) -  19 November 2020 

#### 💬 General Changes

- Fixex: query() does not return fields property if cursor option is true @Eray Hanoğlu 

### [v1.5.0](https://github.com/panates/postgrejs/compare/v1.4.0...v1.5.0) -  19 November 2020 

#### 💬 General Changes

- Added autoCommit option for connection.execute() and connection.query() methods. @Eray Hanoğlu 

### [v1.4.0](https://github.com/panates/postgrejs/compare/v1.3.1...v1.4.0) -  19 November 2020 

#### 💬 General Changes

- Fixed: Missed sendSyncMessage after parse query. @Eray Hanoğlu 
- Fixed: Missed sendSyncMessage @Eray Hanoğlu 

### [v1.3.1](https://github.com/panates/postgrejs/compare/v1.3.0...v1.3.1) -  19 November 2020 

#### 💬 General Changes

- Updated dependencies @Eray Hanoğlu 

### [v1.3.0](https://github.com/panates/postgrejs/compare/v1.2.3...v1.3.0) -  19 November 2020 

#### 💬 General Changes

- Updated lightning-pool to new major version 3.0 @Eray Hanoğlu 
- Updated roadmap @Eray Hanoğlu 

### [v1.2.3](https://github.com/panates/postgrejs/compare/v1.2.2...v1.2.3) -  17 November 2020 

#### 💬 General Changes

- Added sessionParameters getter @Eray Hanoğlu 

### [v1.2.2](https://github.com/panates/postgrejs/compare/v1.2.1...v1.2.2) -  17 November 2020 

#### 💬 General Changes

- Added isClosed property @Eray Hanoğlu 
- Added isClosed property @Eray Hanoğlu 

### [v1.2.1](https://github.com/panates/postgrejs/compare/v1.2.0...v1.2.1) -  17 November 2020 

#### 💬 General Changes

- Major changes for FieldInfo @Eray Hanoğlu 
- Expose Cursor class @Eray Hanoğlu 

### [v1.2.0](https://github.com/panates/postgrejs/compare/v1.1.1...v1.2.0) -  17 November 2020 

#### 💬 General Changes

- Major changes for FieldInfo @Eray Hanoğlu 

### [v1.1.1](https://github.com/panates/postgrejs/compare/v1.1.0...v1.1.1) -  16 November 2020 

#### 💬 General Changes

- Added dataTypeName to FieldInfo @Eray Hanoğlu 

### [v1.1.0](https://github.com/panates/postgrejs/compare/v1.0.5...v1.1.0) -  16 November 2020 

#### 💬 General Changes

- Added elementDataTypeId and mappedType properties to FieldInfo @Eray Hanoğlu 

### [v1.0.5](https://github.com/panates/postgrejs/compare/v1.0.4...v1.0.5) -  16 November 2020 

#### 💬 General Changes

- Added fetch() method to cursor @Eray Hanoğlu 
- Added ability to get processId and secretKey @Eray Hanoğlu 

### [v1.0.4](https://github.com/panates/postgrejs/compare/v1.0.3...v1.0.4) -  16 November 2020 

#### 💬 General Changes

- Added ability to get processId and secretKey @Eray Hanoğlu 

### [v1.0.3](https://github.com/panates/postgrejs/compare/v1.0.2...v1.0.3) -  16 November 2020 

#### 💬 General Changes

- Fixed wrong repository address @Eray Hanoğlu 

### [v1.0.2](https://github.com/panates/postgrejs/compare/v1.0.1...v1.0.2) -  16 November 2020 

#### 💬 General Changes

- Test fixed @Eray Hanoğlu 
- DOCUMENTATION.md is missing in files property @Eray Hanoğlu 

### v1.0.1

#### 💬 General Changes

- ScriptExecutor test passing @Eray Hanoğlu 
- Initial commit @Eray Hanoğlu 
- Beta 1 commit @Eray Hanoğlu 
- Data types implementation and tests done @Eray Hanoğlu 
- Added int64 support for node&lt;12 @Eray Hanoğlu 
- Beta 2 commit @Eray Hanoğlu 
- Implemented extended query @Eray Hanoğlu 
- 1.0 stable @Eray Hanoğlu 
- Added house keeping ability to SmartBuffer @Eray Hanoğlu 
- Beta 1 commit @Eray Hanoğlu 
- Updated travis url @Eray Hanoğlu 
- Initial commit @Eray Hanoglu 
- Added int64 support for node&lt;12 @Eray Hanoğlu 
- Beta 1 commit @Eray Hanoğlu 
- Implemented extended query @Eray Hanoğlu 
