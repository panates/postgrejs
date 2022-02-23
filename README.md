## postgresql-client
  
[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]


Professional PostgreSQL client written in TypeScript.

## Features

- Pure JavaScript library completely written in TypeScript
- Both single connection and advanced pooling support
- Both CommonJS and ESM modules
- Named Prepared Statements
- Extended cursor support with fast double-link cache
- Extensible data-types and type mapping
- Extended bind parameters
- Multidimensional arrays with fast binary encoding/decoding
- Low memory utilization and boosted performance with Shared Buffers
- Full binary and text wire protocol support for all data types
- Supports Clear text, MD5 and SASL password algorithms
- Can return both array and object rows
- Asynchronous Promise based api
- Strictly typed

## Installation

```bash
$ npm install postgresql-client --save
```

## Documentation
Please read [DOCUMENTATION](DOCUMENTATION.md) for detailed usage.

```ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
const result = await connection.query(
    'select * from cities where name like $1',
    {params: ['%york%']});
const rows = result.rows;
await connection.close(); // Disconnect
```

```ts
import {Pool} from 'postgresql-client';

const db = new Pool({
    host: 'postgres://localhost',
    pool: {
       min: 1,
       max: 10,
       idleTimeoutMillis: 5000
    }
});

const result = await db.query(
    'select * from cities where name like $1',
    {params: ['%york%'], cursor: true});
const cursor = result.cursor;
let row;
while ((row = cursor.next())) {
  console.log(row);
}

await db.close(); // Disconnect all connections and shutdown pool
```


## Support
You can report bugs and discuss features on the [GitHub issues](https://github.com/panates/postgresql-client/issues) page
When you open an issue please provide version of NodeJS and PostgreSQL server.


## Node Compatibility

- node >= 10.x
 
  
### License
postgresql-client is available under [MIT](LICENSE) license.

[npm-image]: https://img.shields.io/npm/v/postgresql-client.svg
[npm-url]: https://npmjs.org/package/postgresql-client
[travis-image]: https://img.shields.io/travis/panates/postgresql-client/master.svg
[travis-url]: https://travis-ci.com/panates/postgresql-client
[coveralls-image]: https://img.shields.io/coveralls/panates/postgresql-client/master.svg
[coveralls-url]: https://coveralls.io/r/panates/postgresql-client
[downloads-image]: https://img.shields.io/npm/dm/postgresql-client.svg
[downloads-url]: https://npmjs.org/package/postgresql-client
[gitter-image]: https://badges.gitter.im/panates/postgresql-client.svg
[gitter-url]: https://gitter.im/panates/postgresql-client?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[dependencies-image]: https://david-dm.org/panates/postgresql-client/status.svg
[dependencies-url]:https://david-dm.org/panates/postgresql-client
[devdependencies-image]: https://david-dm.org/panates/postgresql-client/dev-status.svg
[devdependencies-url]:https://david-dm.org/panates/postgresql-client?type=dev
[quality-image]: http://npm.packagequality.com/shield/postgresql-client.png
[quality-url]: http://packagequality.com/#?package=postgresql-client
