## postgresql-client
  
[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CircleCI][circleci-image]][circleci-url]
[![Test Coverage][coveralls-image]][coveralls-url]


Professional PostgreSQL client written in TypeScript.

## Features

- Pure JavaScript library completely written in TypeScript
- Both single connection and advanced pooling support
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
- Supports both CommonJS and ESM module systems

## Installation

```bash
$ npm install postgresql-client --save
```

## Documentation
Please read :small_orange_diamond: [DOCUMENTATION](DOCUMENTATION.md) :small_orange_diamond: for detailed usage.

## Example usage

### Establish a single connection, execute a simple query

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

### Establish a pooled connection, create a cursor
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

### Using prepared statements
```ts
import {DataTypeOIDs} from 'postgresql-client'; 

// .....
const statement = await connection.prepare( 
    'insert into my_table(id, name) values ($1, $2)', {
        paramTypes: [DataTypeOIDs.Int4, DataTypeOIDs.Varchar]
    });

for (let i = 0; i < 100; i++) {
    await statement.execute({params: [i, ('name' + i)]});
}
await statement.close(); // When you done, close the statement to relase resources
```

#### Check [DOCUMENTATION](DOCUMENTATION.md) for other examples.



## Data types mappings
The table below lists builtin data type mappings.

| Posgtres type | JS type     | Receive     | Send     | 
|---------------|:------------| ------------|----------|
| bool          | boolean     | text,binary | binary   | 
| int2          | number      | text,binary | binary   | 
| int4          | number      | text,binary | binary   | 
| int8          | BigInt      | text,binary | binary   | 
| float4        | number      | text,binary | binary   | 
| float8        | number      | text,binary | binary   | 
| char          | string      | text,binary | binary   | 
| bpchar        | string      | text,binary | binary   | 
| varchar       | string      | text,binary | binary   | 
| date          | Date        | text,binary | binary   | 
| time          | Date        | text,binary | binary   | 
| timestamp     | Date        | text,binary | binary   | 
| timestamptz   | Date        | text,binary | binary   | 
| oid           | number      | text,binary | binary   | 
| bytea         | Buffer      | text,binary | binary   | 
| uuid          | string      | text,binary | binary   | 
| json          | object      | text,binary | binary   | 
| jsonb         | object      | text,binary | binary   | 
| xml           | string      | text,binary | binary   | 
| point         | Point       | text,binary | binary   | 
| circle        | Circle      | text,binary | binary   | 
| lseg          | Rectangle   | text,binary | binary   | 
| box           | Rectangle   | text,binary | binary   | 
| _bool         | boolean[]   | text,binary | binary   | 
| _int2         | number[]    | text,binary | binary   | 
| _int4         | number[]    | text,binary | binary   | 
| _int8         | BigInt[]    | text,binary | binary   | 
| _float4       | number[]    | text,binary | binary   | 
| _float8       | number[]    | text,binary | binary   | 
| _char         | string[]    | text,binary | binary   | 
| _bpchar       | string[]    | text,binary | binary   | 
| _varchar      | string[]    | text,binary | binary   | 
| _date         | Date[]      | text,binary | binary   | 
| _time         | Date[]      | text,binary | binary   | 
| _timestamp    | Date[]      | text,binary | binary   | 
| _timestamptz  | Date[]      | text,binary | binary   | 
| _uuid         | string[]    | text,binary | binary   | 
| _oid          | number[]    | text,binary | binary   | 
| _bytea        | Buffer[]    | text,binary | binary   | 
| _json         | object[]    | text,binary | binary   | 
| _jsonb        | object[]    | text,binary | binary   | 
| _xml          | string[]    | text,binary | binary   | 
| _point        | Point[]     | text,binary | binary   | 
| _circle       | Circle[]    | text,binary | binary   | 
| _lseg         | Rectangle[] | text,binary | binary   | 
| _box          | Rectangle[] | text,binary | binary   | 


## Support
You can report bugs and discuss features on the [GitHub issues](https://github.com/panates/postgresql-client/issues) page
When you open an issue please provide version of NodeJS and PostgreSQL server.

## Node Compatibility
- node >= 14.x
 
  
### License
postgresql-client is available under [MIT](LICENSE) license.

[npm-image]: https://img.shields.io/npm/v/postgresql-client.svg
[npm-url]: https://npmjs.org/package/postgresql-client
[circleci-image]: https://circleci.com/gh/panates/postgresql-client/tree/master.svg?style=shield
[circleci-url]: https://circleci.com/gh/panates/postgresql-client/tree/master
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
