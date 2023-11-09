# v2.10.1
[2023-11-09]

### Changes

* Fixed: Some times server response invalid message to prepare statement message. ([`bb7a0c8`](https://github.com/panates/postgresql-client/commit/bb7a0c8e2074120a2062e585183480b52677756e))

# v2.10.0
[2023-11-09]

### Changes

* Fixed: Error stack do not show caller function. ([`08a1a8f`](https://github.com/panates/postgresql-client/commit/08a1a8f4141b0066ae084de4f2a31d9d7e1bd4b9))
* Improved error message handling for more understandable to humans. ([`d9bbcb0`](https://github.com/panates/postgresql-client/commit/d9bbcb0b1c10ab11816bc907d2b62977831d6082))

# v2.9.1
[2023-10-03]

### Changes

* Added int2Vector data type with binary protocol ([`94a9a3b`](https://github.com/panates/postgresql-client/commit/94a9a3b3a9e10ce7bdbce132c9195826ecc7aec1))

# v2.9.0
[2023-10-03]

### Changes

* Added int2Vector data type with binary protocol ([`55bd87e`](https://github.com/panates/postgresql-client/commit/55bd87e38a2ed1787957c1066ba51857d6c97c5d))
* Support int2 and oid vector types ([`ce27006`](https://github.com/panates/postgresql-client/commit/ce27006bb7441d004fd251bd6af29c4e99836b01))
* Add OID for tid array ([`d99e3ee`](https://github.com/panates/postgresql-client/commit/d99e3ee1e7fc768931553240adb556f003428ebd))

# v2.8.1
[2023-10-03]

### Changes

* Updated dependencies ([`51998d4`](https://github.com/panates/postgresql-client/commit/51998d496cc84d721bf267ba29e8dda3c520fea7))
* Updated dependencies ([`7faed1a`](https://github.com/panates/postgresql-client/commit/7faed1a68149b82399d951df6f0e0f1c54cd1798))
* Add ability to configure buffer size ([`30d18c6`](https://github.com/panates/postgresql-client/commit/30d18c6afeb3b973eaa640f772ed791ec0707bb0))
* Minor fix for logging ([`1af9e94`](https://github.com/panates/postgresql-client/commit/1af9e946018e9605882c13a85120793a65c1fada))

# v2.8.0
[2023-09-24]

### Changes

* Add ability to configure buffer size ([`34d822a`](https://github.com/panates/postgresql-client/commit/34d822a7b3a302d3a8b4b406586c3ce123cac97b))
* Updated config ([`8792c63`](https://github.com/panates/postgresql-client/commit/8792c631eff7798edb1a76524acfce49e28d7593))
* Updated node versions ([`7fb18dc`](https://github.com/panates/postgresql-client/commit/7fb18dc0f208ec609ebddd84d0a3ea5db4c8534a))
* Updated config ([`31dab8b`](https://github.com/panates/postgresql-client/commit/31dab8b08ac5b6d5977bb89d47de60e964e09b52))
* Updated node versions ([`17692ca`](https://github.com/panates/postgresql-client/commit/17692ca11cf4e440afe53b8a1bcd96041b36f352))
* Updated config ([`9c5f20c`](https://github.com/panates/postgresql-client/commit/9c5f20c8e0a83633eaa66dd438d4cee3d93846a7))
* Updated node versions ([`49c6eac`](https://github.com/panates/postgresql-client/commit/49c6eacd56815f969f0aabce3b41c67369e10d27))

# v2.7.2
[2023-09-10]

### Fixes

* Fix: Make concurrency explicit, prevents power-tasks from invoking os.cpus ([`20038b0`](https://github.com/panates/postgresql-client/commit/20038b034eabf35cdf57eb0c7c72097f66d6b4c4))

### Changes

* Updated badge url ([`b9335ed`](https://github.com/panates/postgresql-client/commit/b9335ed40a8cc4fadee4fe90e3287a48f0978cf3))

# v2.7.1
[2023-08-03]

### Changes

* Updated dependencies ([`114ffb9`](https://github.com/panates/postgresql-client/commit/114ffb94e38dfc96fcc3c57d95807036f0c50045))
* Fallback to "unknown" IOD, if can't determine data type ([`b0807e3`](https://github.com/panates/postgresql-client/commit/b0807e38af758a29c5a1fb5db4af24dd1f5c9dfb))
* Export SmartBuffer fully ([`8fca283`](https://github.com/panates/postgresql-client/commit/8fca283bc3fa9be0653297f858e1ede652456289))

# v2.7.0
[2023-08-01]

### Changes

* Restructure files according to current Panates standards ([`58875b3`](https://github.com/panates/postgresql-client/commit/58875b364c58b8b5e5ddac55373dd70ad5639bd0))
* Renames DatabaseConnectionParams.onErrorRollback to rollbackOnError ([`dc50fb1`](https://github.com/panates/postgresql-client/commit/dc50fb1ee3b9975f188af60b7f3fed5f8d089fcc))

# v2.6.1
[2023-08-01]

### Changes

* Now DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. ([`f2a20eb`](https://github.com/panates/postgresql-client/commit/f2a20eb9a0eba5ebfd3e8f26d427469d71b1c041))
* Now DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. ([`0f8cbc8`](https://github.com/panates/postgresql-client/commit/0f8cbc809c24ca712e94ab21d2c2624e35a8b059))
* Now DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. ([`e1918c3`](https://github.com/panates/postgresql-client/commit/e1918c3d9bd2cea6a084474d987df18b62b8b239))

# v2.6.0
[2023-08-01]

### Changes

* Not DataTypeMap.determine method lookup for data-types in reverse order. So last registered data-type returns first. ([`759ff85`](https://github.com/panates/postgresql-client/commit/759ff85ceaf0c5d119656b6b61d6450420c19fbc))
* Fixed typing for new eslint rules ([`95f3914`](https://github.com/panates/postgresql-client/commit/95f3914f61d4883b68d4b131f6200b08fc8e2478))
* Fixed typing for new eslint rules ([`f6e0d11`](https://github.com/panates/postgresql-client/commit/f6e0d11041616ee243a95062a4e9d581d5406d62))

# v2.5.10
[2023-07-26]

### Changes

* Updated dependencies ([`2a21190`](https://github.com/panates/postgresql-client/commit/2a21190d2db2f70a1bbffb6cc77a8d9dc62b7636))
* Added code of conduct document ([`9a64826`](https://github.com/panates/postgresql-client/commit/9a6482677ba23fb6ca850f5357a7e169218c7efd))
* Updated config ([`9655d4f`](https://github.com/panates/postgresql-client/commit/9655d4f222af21b889a7a9f5070530f8ea6bcd95))

# v2.5.9
[2023-05-17]

### Changes

* Fixed missing files."typings" ([`eabb616`](https://github.com/panates/postgresql-client/commit/eabb616a54831ca245d6157452737a6484167d0b))

# v2.5.8
[2023-05-17]

### Changes

* Optimized build ([`e8305f9`](https://github.com/panates/postgresql-client/commit/e8305f9da79a64484d5edc2cd0fe43c4ff7b2fa2))

# v2.5.7
[2023-05-16]

### Changes

* Optimized build ([`17d029b`](https://github.com/panates/postgresql-client/commit/17d029be5d799bab2cf49ba5258b978b20c0d52f))

# v2.5.6
[2023-05-16]

### Changes

* Removed vulnerable "debug" package ([`019b3f4`](https://github.com/panates/postgresql-client/commit/019b3f48955c62a9c764462b16cd52be8cf22ae2))
* Updated dependencies ([`afce5f7`](https://github.com/panates/postgresql-client/commit/afce5f735d241869e6ae937cb67b6378e70fb6d0))
* Fixed examples for cursor usage ([`5971341`](https://github.com/panates/postgresql-client/commit/5971341edf1c7ce363ddcb3adb97b2491bf7714d))
* Updated config ([`6edd12e`](https://github.com/panates/postgresql-client/commit/6edd12e902ac3f5f2f4784626edce151bf5eb569))

# v2.5.5
[2023-02-22]

### Changes

* Added auto changelog generation ([`0c7fc22`](https://github.com/panates/postgresql-client/commit/0c7fc22f299363a8425835c11d4f6f4eeb64a9ea))
* Updated examples ([`94e092a`](https://github.com/panates/postgresql-client/commit/94e092ade4e664b040bb85517eac4c61f8baeee4))
* Added auto changelog generation ([`1ed1194`](https://github.com/panates/postgresql-client/commit/1ed119481ee3a5ccdd841691812f6042fab2cb5a))

# v2.5.3
[2023-02-20]

### Changes

* Updated dependencies ([`b278e88`](https://github.com/panates/postgresql-client/commit/b278e88a2cfdcf9467d20b3d9257607eddb731e1))
* Updated dependencies ([`b8501a2`](https://github.com/panates/postgresql-client/commit/b8501a2e5a73f0449de3e5373a1b559455af1051))

# v2.5.2
[2022-12-02]

### Changes

* Updated dependencies ([`20abfde`](https://github.com/panates/postgresql-client/commit/20abfdedb3dd3fa213f6cb66e00c132607deccb9))

# v2.5.1
[2022-10-05]

### Changes

* Updated documentation ([`38093f6`](https://github.com/panates/postgresql-client/commit/38093f67924eaf7a3710e08ed5bc91f84fd3920f))
* Added LISTEN/NOTIFY feature ([`73cb33b`](https://github.com/panates/postgresql-client/commit/73cb33b41d0bc3515e71b5e0ff7ace68b9f4720b))

# v2.5.0
[2022-10-04]

### Changes

* Added LISTEN/NOTIFY feature ([`f0ac754`](https://github.com/panates/postgresql-client/commit/f0ac754657da2f95977da6081f8c4265e83ba1b5))

# v2.4.1
[2022-09-23]

### Changes

* Updated dependencies ([`bebcd28`](https://github.com/panates/postgresql-client/commit/bebcd283a045720f51a74f51e8258492af4c3790))

# v2.4.0
[2022-09-22]

### Changes

* Fixed exports for multi module support ([`e40dabe`](https://github.com/panates/postgresql-client/commit/e40dabe8064dc89f3a468b00e5c623f4277d68c1))

# v2.3.0
[2022-09-17]

### Changes

* Updated lightning-pool to v4.0 ([`4ae3adf`](https://github.com/panates/postgresql-client/commit/4ae3adf1e4600a7977c24c4d6903193b97e908da))

# v2.2.0
[2022-09-17]

### Changes

* Updated eslint and jest ([`229d394`](https://github.com/panates/postgresql-client/commit/229d394b3a956844c0a36665fa44edf3acda9bd3))

# v2.1.5
[2022-08-29]

### Changes

* Updated eslint config ([`5ad54ee`](https://github.com/panates/postgresql-client/commit/5ad54eeea34cb87d744a405afe21d15eb7357bd7))

# v2.1.4
[2022-07-06]

### Changes

* Updated dependencies ([`15ad62c`](https://github.com/panates/postgresql-client/commit/15ad62c53dee3562576537da36325bd7b69ae144))
* Updated readme ([`145afed`](https://github.com/panates/postgresql-client/commit/145afed77f278648d48ca8b0d2aaf44e5887e07a))
* Fixed typing ([`70a7076`](https://github.com/panates/postgresql-client/commit/70a707672caf735d412cb0debe9661a69b8d688f))

# v2.1.3
[2022-06-28]

### Changes

* Updated dependencies ([`8cef3fa`](https://github.com/panates/postgresql-client/commit/8cef3fafce9e4051ebad350494f78417f7846361))

# v2.1.2
[2022-06-24]

### Changes

* Updated dependencies ([`ddeb02c`](https://github.com/panates/postgresql-client/commit/ddeb02c43c12994eab31b100aa8f25c949172565))

# v2.1.1
[2022-06-21]

### Changes

* Added prettier code style ([`c0b732e`](https://github.com/panates/postgresql-client/commit/c0b732e65400e5be844f157f5710694e1d9ebf1b))
* Moved prettier to devDependencies ([`eecec11`](https://github.com/panates/postgresql-client/commit/eecec113f5d0752a90755952ad044b29f6ddbbd8))

# v2.1.0
[2022-06-21]

### Changes

* Added .js extensions to import statements for esm module support ([`dd884f1`](https://github.com/panates/postgresql-client/commit/dd884f1258abb47716a82edf6d2b945b89ef3160))
* Moved from putil-taskqueue to power-tasks ([`7782551`](https://github.com/panates/postgresql-client/commit/7782551725f3441d590c6802c9812d38704d89a6))
* Added husky git hooks ([`d61fc2a`](https://github.com/panates/postgresql-client/commit/d61fc2a0e540aad420f9b5ff4887cb6d0c609596))

# v2.0.4
[2022-06-17]

### Changes

* Update dependencies ([`4b34c8b`](https://github.com/panates/postgresql-client/commit/4b34c8be303062b2ef419bbc77e1d802b34ab4d2))

# v2.0.3
[2022-05-28]

### Changes

* Update dependencies ([`b2ee542`](https://github.com/panates/postgresql-client/commit/b2ee5423c58afd967eb90598977fa3bdc897920b))

# v2.0.2
[2022-05-11]

### Changes

* Added json casting for object values ([`b95766a`](https://github.com/panates/postgresql-client/commit/b95766a3f6362fb7dfa5c453df8fc76bcf46a295))

# v2.0.1
[2022-05-08]

### Changes

* Updated dependencies and documentation ([`f7f93d6`](https://github.com/panates/postgresql-client/commit/f7f93d6b3f869ef9f7517983f5489931c6c9b10d))
* Updated config ([`9fa5d12`](https://github.com/panates/postgresql-client/commit/9fa5d12aac07842f1f9f4f0ff51a31dbe674b423))
* Updated dependencies and documentation ([`120e7b5`](https://github.com/panates/postgresql-client/commit/120e7b505f86c10ede34df1f8291c77b8be66e10))
* Fixed cover script ([`ff3dbef`](https://github.com/panates/postgresql-client/commit/ff3dbef2da974d08558475a9550778d70b8db4cc))
* Updated config ([`a18fe16`](https://github.com/panates/postgresql-client/commit/a18fe169a79544ecb9e00b2186aa7f64b52cdb24))

# v2.0.0
[2022-03-03]

### Changes

* Added jsonb data type support ([`9b77962`](https://github.com/panates/postgresql-client/commit/9b77962d892887798def53f5b58ebb5c9573e0e0))
* Added ESM module support ([`97857e3`](https://github.com/panates/postgresql-client/commit/97857e3925099e62d52d3dd6edf076015579fa95))
* Updated dependencies ([`f8be711`](https://github.com/panates/postgresql-client/commit/f8be711c067233c41bd33d595b8630c6cbda1048))
* Update issue templates ([`f84ec38`](https://github.com/panates/postgresql-client/commit/f84ec389e17925a41c1f70da4aba606173ddd90d))
* Updated dependencies ([`b43ae89`](https://github.com/panates/postgresql-client/commit/b43ae89c616615b622a462d2a0c112001943856a))
* Added ESM module support ([`a710889`](https://github.com/panates/postgresql-client/commit/a7108898204f7f464927ba56a84f590bc42f7fa3))

# v1.21.6
[2022-02-22]

### Changes

* Updated dependencies ([`b8f05e2`](https://github.com/panates/postgresql-client/commit/b8f05e2fd1d1600461373ccc51a131e4ff772b34))

# v1.21.5
[2022-01-03]

### Changes

* Updated dependencies ([`66da42d`](https://github.com/panates/postgresql-client/commit/66da42d1db31aa4009467366c1b7285fbef6cf54))

# v1.21.4
[2021-12-13]

### Changes

* Updated readme ([`d5af7cd`](https://github.com/panates/postgresql-client/commit/d5af7cdf315d9b549df79d05c077a0037b03509a))

# v1.21.3
[2021-12-13]

### Changes

* Updated dependencies ([`20fc14c`](https://github.com/panates/postgresql-client/commit/20fc14ced4e5a3158d91faf7158dc81d7ca650e6))

# v1.21.2
[2021-10-12]

### Changes

* Updated dependencies ([`80474a3`](https://github.com/panates/postgresql-client/commit/80474a397cda00bce583268f05f57bd31ea9c2b2))
* Updated dependencies ([`68cdfed`](https://github.com/panates/postgresql-client/commit/68cdfed3966bdc9d4c88c9cc57053197cfc47cd1))

# v1.21.1
[2021-10-02]

### Changes

* Updated dependencies ([`5b4638b`](https://github.com/panates/postgresql-client/commit/5b4638b198c6d68a1cf8f601c9e15965990bb917))
* Fixed: float numbers are recognized as bigint ([`1c19df4`](https://github.com/panates/postgresql-client/commit/1c19df4a6054af51ac49ce22320167072c81c689))

# v1.21.0
[2021-09-23]

### Changes

* + Added releaseSavepoint() method ([`9fc61c9`](https://github.com/panates/postgresql-client/commit/9fc61c9b5fe5215239bfb6374d7661cb11b7b142))

# v1.20.0
[2021-09-21]

# v1.19.0
[2021-09-21]

### Changes

* + Added onErrorRollback functionality for better transaction management ([`f92b65b`](https://github.com/panates/postgresql-client/commit/f92b65b0422e6861edf728dcbd1504be9bd01e34))

# v1.18.4
[2021-09-14]

### Changes

* Fixed: Needs type casting of uuid[] types ([`b6b1b45`](https://github.com/panates/postgresql-client/commit/b6b1b4578346c49d00922a104ca6c251b0dffed6))

# v1.18.3
[2021-09-08]

### Changes

* Fixed invalid constructing of DatabaseError ([`e904539`](https://github.com/panates/postgresql-client/commit/e90453959b570ad2206415455c8f2b844e69ce85))

# v1.18.2
[2021-09-07]

### Changes

* Updated dependencies ([`27d747f`](https://github.com/panates/postgresql-client/commit/27d747f2f77ec6da677bda3ce2dff362671d985a))

# v1.18.1
[2021-08-11]

### Changes

* Fixed database error properties exists in parent msg object. ([`6d5ad49`](https://github.com/panates/postgresql-client/commit/6d5ad49cea90b272419d532262c8a9e87070ac51))

# v1.18.0
[2021-08-01]

# v1.17.0
[2021-08-01]

### Changes

* Updated dependencies ([`5e6a902`](https://github.com/panates/postgresql-client/commit/5e6a902ae7cac3da89cf887f5b56d4d179504c27))
* Added lineNr, colNr and line properties to DatabaseError ([`950bfb0`](https://github.com/panates/postgresql-client/commit/950bfb0a945a2662150bc2cb4a9be6ead29e2762))

# v1.16.7
[2021-07-03]

### Changes

* Fixed: throws "operator does not exist: integer = json" if bind param is null or undefined ([`f57bd9e`](https://github.com/panates/postgresql-client/commit/f57bd9ec0ec813ac96ef29e51d032cad10113129))

# v1.16.6
[2021-07-03]

### Changes

* Updated dependencies ([`7298b3c`](https://github.com/panates/postgresql-client/commit/7298b3c589257281963c351c5b5d18492fe0eaee))
* Update README.md ([`5bac71d`](https://github.com/panates/postgresql-client/commit/5bac71d5c415128a02c01885fc9e0038ac21d4d5))

# v1.16.5
[2021-04-19]

### Changes

* Updated dependencies ([`c7e0bb0`](https://github.com/panates/postgresql-client/commit/c7e0bb0e33c5b3e09cdf753a5b496833503820ee))
* Updated readme ([`efbc574`](https://github.com/panates/postgresql-client/commit/efbc57427b8d7c67aef412cd2433c660c1dac0a5))

# v1.16.4
[2021-04-08]

### Changes

* Updated dependencies ([`8e916c6`](https://github.com/panates/postgresql-client/commit/8e916c605fc565b89a710d226161af1eeee2be33))
* Detect time format strings ([`14f8871`](https://github.com/panates/postgresql-client/commit/14f88711b29824f720233ae051709e2f3fbabaf8))

# v1.16.3
[2021-04-07]

### Changes

* Updated doc ([`54b72be`](https://github.com/panates/postgresql-client/commit/54b72beb898012daa16c99f60a98fbe98520ed18))

# v1.16.2
[2021-04-07]

### Changes

* Fixed time data type issue ([`bf80893`](https://github.com/panates/postgresql-client/commit/bf80893d628ed9ec14d448b7194ab89028b00463))
* Added missed type mappings ([`f45124a`](https://github.com/panates/postgresql-client/commit/f45124aa900c82318bdd39d1770ddeaa0df62acc))

# v1.16.1
[2021-04-06]

# v1.16.0
[2021-04-06]

### Changes

* Added Time data type ([`127fb81`](https://github.com/panates/postgresql-client/commit/127fb8174c65215738e4450c97dd438f2f4e53a6))

# v1.15.1
[2021-03-19]

### Changes

* Use default config ([`6f3e692`](https://github.com/panates/postgresql-client/commit/6f3e692acf7a3f487e3056bc6a964032b50a0661))

# v1.15.0
[2021-03-07]

### Changes

* Added "name" (OID:19) data type to data type map ([`6f56e2d`](https://github.com/panates/postgresql-client/commit/6f56e2d00446dd9634eb50ff354dae2c983bceda))

# v1.14.2
[2021-03-05]

### Changes

* Dont add COMMIT to execute sql if not in transaction. ([`8f57c30`](https://github.com/panates/postgresql-client/commit/8f57c30ea4e45b014a883644a5d4817bc25485be))

# v1.14.1
[2021-02-16]

### Changes

* Now can detect uuid value when binding parameters ([`72a4ba0`](https://github.com/panates/postgresql-client/commit/72a4ba0e58cdd93ab70cc2d6edf1bfc473225ca3))

# v1.14.0
[2021-02-15]

### Changes

* Added support for UUID data type ([`d3cfbfd`](https://github.com/panates/postgresql-client/commit/d3cfbfd24e4a5b8b1b36f9842d9a9384ee50e58a))

# v1.13.2
[2021-01-31]

### Changes

* Updated dependencies ([`ffddee3`](https://github.com/panates/postgresql-client/commit/ffddee39210236043909485eb478a283441a2702))

# v1.13.1
[2021-01-30]

# v1.13.0
[2021-01-28]

### Changes

* Added fetchAsString option for Date, Timestamp and TimestampTz ([`1d77cd1`](https://github.com/panates/postgresql-client/commit/1d77cd1c9ef04d0fa90b5729e376be4bc5cfe8b6))

# v1.12.1
[2021-01-28]

# v1.12.0
[2021-01-28]

### Changes

* Added fetchAsString option for Date, Timestamp and TimestampTz ([`18fa21c`](https://github.com/panates/postgresql-client/commit/18fa21c9e7885fde570901afbcb9e9d4fffaccb8))
* Set test schema ([`72b3dcc`](https://github.com/panates/postgresql-client/commit/72b3dccbdea0b0352faec20e5581984780567a68))
* Set test schema ([`ec18c02`](https://github.com/panates/postgresql-client/commit/ec18c02bb6964de9a42300002e3af0b6152de466))

# v1.11.4
[2020-12-24]

### Changes

* Check if fetchCount value between unsigned inter range ([`cc35ee3`](https://github.com/panates/postgresql-client/commit/cc35ee368e1a78b16b030ba259f921dca0287f89))

# v1.11.3
[2020-12-24]

# v1.11.2
[2020-12-24]

### Changes

* Fixed: Does not determine data type in register order. ([`e27ea7a`](https://github.com/panates/postgresql-client/commit/e27ea7a372fb5fbf1ccb3ede7b292bd58471d22f))

# v1.11.1
[2020-12-10]

### Changes

* Calling fetch of a closed cursor will not throw anymore ([`bacb630`](https://github.com/panates/postgresql-client/commit/bacb63002121b5e0ee3c3765065f60e4de3496ba))

# v1.11.0
[2020-12-10]

### Changes

* Updated dependencies ([`f1e23d4`](https://github.com/panates/postgresql-client/commit/f1e23d41ce75fb5ebd6ce3fb834df0d2ff5c9e10))
* Automatically convert BigInt numbers to formal number if value in safe integer range ([`110c544`](https://github.com/panates/postgresql-client/commit/110c544809b30f8be83c0893bc58cddce08dbae2))
* Updated dependencies ([`4216ebd`](https://github.com/panates/postgresql-client/commit/4216ebd064b37530a8bb9d8f810c87aadc14b7a6))

# v1.10.1
[2020-12-09]

### Changes

* Fixed: Wrong message sending when parameters contains null values ([`59e5bf4`](https://github.com/panates/postgresql-client/commit/59e5bf4b4084c92dd4dbf8f7fc787f9d11709efa))

# v1.10.0
[2020-12-05]

### Changes

* Added "numeric" data type ([`a0a6068`](https://github.com/panates/postgresql-client/commit/a0a606838a4e3852298cc97c6ee704dd08ec36c6))
* Added "numeric" data type ([`d78a6fe`](https://github.com/panates/postgresql-client/commit/d78a6fe55433aab90e2a00f7bc5f052eca69b2b3))

# v1.9.2
[2020-11-25]

### Changes

* Added "debug" package ([`f365962`](https://github.com/panates/postgresql-client/commit/f36596201bb455e7b6d5ed7460d7c72864b36b0f))

# v1.9.1
[2020-11-24]

### Changes

* Added "debug" package ([`618a239`](https://github.com/panates/postgresql-client/commit/618a239f4e09643460146dbffad77011768f78a9))
* Added "debug" package ([`12c0001`](https://github.com/panates/postgresql-client/commit/12c00012a29f5365472d108e3b83cfdfa128c96b))

# v1.9.0
[2020-11-20]

### Changes

* Changed ConnectionConfiguration.searchPath to "schema" ([`e6df86b`](https://github.com/panates/postgresql-client/commit/e6df86b85384608cbfbb8ab5f96446dbfe5540bf))
* Changed ConnectionConfiguration.searchPath to "schema" ([`1fd8b7a`](https://github.com/panates/postgresql-client/commit/1fd8b7ade85a61f5eb524054cef52d97e70f8635))

# v1.8.1
[2020-11-20]

### Changes

* Added rowType to all result interfaces ([`edfaec6`](https://github.com/panates/postgresql-client/commit/edfaec69751137ab488ac4af2cf97582059b7e45))

# v1.8.0
[2020-11-20]

### Changes

* Added rowType to all result interfaces ([`4bc26a7`](https://github.com/panates/postgresql-client/commit/4bc26a7d1edd9405c1fd5f06eff6e60d4d11631e))

# v1.7.1
[2020-11-20]

# v1.7.0
[2020-11-20]

### Changes

* Linted for code quality ([`73dad79`](https://github.com/panates/postgresql-client/commit/73dad793b7a2dfeed7fcdeeb8d7736ca90247af1))
* Added rowType getter to Cursor ([`045a2a2`](https://github.com/panates/postgresql-client/commit/045a2a22e1c8d0519399c3bf70013adaf2c9e32d))

# v1.6.0
[2020-11-20]

### Changes

* Improved auto-commit operations by detecting sql is a transaction command ([`ab8e698`](https://github.com/panates/postgresql-client/commit/ab8e698f205dfe81b81b30fe7a7520db2430006c))

# v1.5.1
[2020-11-19]

### Changes

* Fixex: query() does not return fields property if cursor option is true ([`6acec29`](https://github.com/panates/postgresql-client/commit/6acec296e846c57cd3a38f1b26f58641ba688d10))

# v1.5.0
[2020-11-19]

### Changes

* Added autoCommit option for connection.execute() and connection.query() methods. ([`d75e939`](https://github.com/panates/postgresql-client/commit/d75e939cf79bc8c82879d3b46585a5d3c81d0391))

# v1.4.0
[2020-11-19]

### Changes

* Fixed: Missed sendSyncMessage after parse query. ([`d8a906e`](https://github.com/panates/postgresql-client/commit/d8a906e385225b76dfec9291584099a1361fd732))
* Fixed: Missed sendSyncMessage ([`356af56`](https://github.com/panates/postgresql-client/commit/356af563c10735a4bcec6651897eadbfa6566314))

# v1.3.1
[2020-11-19]

### Changes

* Updated dependencies ([`c413990`](https://github.com/panates/postgresql-client/commit/c4139903b2d8415a0ed4deb871b820158ab0f923))

# v1.3.0
[2020-11-19]

### Changes

* Updated lightning-pool to new major version 3.0 ([`1ae9f50`](https://github.com/panates/postgresql-client/commit/1ae9f50549ed4863c37b45022962e463a9a69110))
* Updated roadmap ([`b0605e3`](https://github.com/panates/postgresql-client/commit/b0605e3c487c587256991012395c07e7402b32dd))

# v1.2.3
[2020-11-17]

### Changes

* Added sessionParameters getter ([`4599db8`](https://github.com/panates/postgresql-client/commit/4599db832beca8f3a741e1a690932818edd915e9))

# v1.2.2
[2020-11-17]

### Changes

* Added isClosed property ([`c9b54f7`](https://github.com/panates/postgresql-client/commit/c9b54f7b19bf0270beff5947b02efac9ff4a12a9))
* Added isClosed property ([`f2b3791`](https://github.com/panates/postgresql-client/commit/f2b3791464fcc3d3a58fe317955c609aa0d2b1e6))

# v1.2.1
[2020-11-17]

### Changes

* Major changes for FieldInfo ([`32d2e08`](https://github.com/panates/postgresql-client/commit/32d2e0887a9bc49bbf00a91c5f850908dd9ee3a5))
* Expose Cursor class ([`1dc2de1`](https://github.com/panates/postgresql-client/commit/1dc2de192cc02ed5ba392d974066295a7c0f5f2a))

# v1.2.0
[2020-11-17]

### Changes

* Major changes for FieldInfo ([`982d8ec`](https://github.com/panates/postgresql-client/commit/982d8ec35c9f0b9e7a6fda2972d10c6890cfcfb8))

# v1.1.1
[2020-11-16]

### Changes

* Added dataTypeName to FieldInfo ([`6a9227d`](https://github.com/panates/postgresql-client/commit/6a9227de01bf0cccb28f3a8804c5dab526395700))

# v1.1.0
[2020-11-16]

### Changes

* Added elementDataTypeId and mappedType properties to FieldInfo ([`b554f07`](https://github.com/panates/postgresql-client/commit/b554f07421bfd3375aae90ff3212e5c84e93976c))

# v1.0.5
[2020-11-16]

### Changes

* Added fetch() method to cursor ([`4c98b80`](https://github.com/panates/postgresql-client/commit/4c98b807f578bbfc3cff257ebffec86abb67797b))
* Added ability to get processId and secretKey ([`95bc84f`](https://github.com/panates/postgresql-client/commit/95bc84f9a4f3ce3e3c33b09a13cc79ff2f43ff85))

# v1.0.4
[2020-11-16]

### Changes

* Added ability to get processId and secretKey ([`acaf2d5`](https://github.com/panates/postgresql-client/commit/acaf2d55ab5143c9b0f0651118f2806a2c42ab2e))

# v1.0.3
[2020-11-16]

### Changes

* Fixed wrong repository address ([`ae3b149`](https://github.com/panates/postgresql-client/commit/ae3b149c31d35eda8b39fb1428c6cfde752890c9))

# v1.0.2
[2020-11-16]

### Changes

* Test fixed ([`0754ee8`](https://github.com/panates/postgresql-client/commit/0754ee845ef1cb5c61ed10f9f6fd89e9e8f60d14))
* DOCUMENTATION.md is missing in files property ([`2d24c5f`](https://github.com/panates/postgresql-client/commit/2d24c5f4471f5390548d2377d429b9e1ec567032))

# v1.0.1
[2020-11-16]

### Changes

* ScriptExecutor test passing ([`79ee783`](https://github.com/panates/postgresql-client/commit/79ee783d877617713f5689c5b639a90f9bc6e8b5))
* Initial commit ([`66713fe`](https://github.com/panates/postgresql-client/commit/66713fe1f68c32817bc8c0054126a5019ef90ec7))
* Beta 1 commit ([`86195d8`](https://github.com/panates/postgresql-client/commit/86195d8446673be6da4b0706fff70d77bd607d13))
* Data types implementation and tests done ([`6ba0ed5`](https://github.com/panates/postgresql-client/commit/6ba0ed545406d5d680175e9958316b0f1c0bb159))
* Added int64 support for node&lt;12 ([`8637e98`](https://github.com/panates/postgresql-client/commit/8637e983ae3b56202edb12fd896344c0a1186e0d))
* Beta 2 commit ([`17d3eb6`](https://github.com/panates/postgresql-client/commit/17d3eb621529a68fddc981d7b7521df80870d2f1))
* Implemented extended query ([`7dea1f0`](https://github.com/panates/postgresql-client/commit/7dea1f0516a2f64709e9eaa824d8ce5d2593c32a))
* 1.0 stable ([`df5c83e`](https://github.com/panates/postgresql-client/commit/df5c83e4e1d213355a1b0578c201b2992a066192))
* Added house keeping ability to SmartBuffer ([`efc4fff`](https://github.com/panates/postgresql-client/commit/efc4fff19a5cc8b832e4f686d8d60a60531937f2))
* Beta 1 commit ([`d6197dd`](https://github.com/panates/postgresql-client/commit/d6197ddda5c2f53a4c31783ebbd42de09e59a26b))
* Updated travis url ([`3e3b661`](https://github.com/panates/postgresql-client/commit/3e3b66130c522df939dcc267939145ba64bec45c))
* Initial commit ([`441d590`](https://github.com/panates/postgresql-client/commit/441d590b64a69085d792ede37a8d7c79591a29e7))
* Added int64 support for node&lt;12 ([`bbac2f2`](https://github.com/panates/postgresql-client/commit/bbac2f2a0210171028011ce172d5759788fc4fcf))
* Beta 1 commit ([`e68b3d8`](https://github.com/panates/postgresql-client/commit/e68b3d8df2a05bd8efa06975d3d53b9f65e5cd0e))
* Implemented extended query ([`167e989`](https://github.com/panates/postgresql-client/commit/167e9892d105a0f14b41b4ef660d9c72acc4a900))
