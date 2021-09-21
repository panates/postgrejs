# [postgresql-client](https://github.com/panates/postgresql-client) 

# Contents

- 1\. [Usage](#1-usage)
    - 1.1 [Connecting](#11-connecting)
        - 1.1.1 [Connection strings](#111-connection-strings)
        - 1.1.2 [Environment variables](#112-environment-variables)
    - 1.2 [Pooling](#12-pooling)
        - 1.2.1 [Obtaining a connection](#121-obtaining-a-connection)
        - 1.2.2 [Shutting down the pool](#122-shutting-down-the-pool)
    - 1.3 [Queries](#13-queries)        
        - 1.3.1 [Simple query](#131-simple-query)
        - 1.3.2 [Extended query](#132-extended-query)
        - 1.3.3 [Prepared Statements](#133-prepared-statements)
        - 1.3.4 [Using Cursors](#134-using-cursors)
    - 1.4 [Transaction management](#14-transaction-management)
    - 1.5 [Data types](#15-data-types)
        - 1.5.1 [Type mappings](#151-type-mappings)
        - 1.5.2 [Data transfer formats](#152-data-transfer-formats) 
- 2\. [API](#2-api)
    - 2.1 [Classes](#21-classes)
        - 2.1.1 [Connection](#211-connection)
        - 2.1.2 [Pool](#212-pool)
        - 2.1.3 [Cursor](#213-cursor)
        - 2.1.4 [PreparedStatement](#214-preparedstatement)       
        - 2.1.5 [BindParam](#215-bindparam)
        - 2.1.6 [DataTypeMap](#216-datatypemap)
    - 2.2 [Interfaces](#22-interfaces)
        - 2.2.1 [ConnectionConfiguration](#221-connectionconfiguration)
        - 2.2.2 [PoolConfiguration](#222-poolconfiguration)
        - 2.2.3 [DataMappingOptions](#223-datamappingoptions)
        - 2.2.4 [ScriptExecuteOptions](#224-scriptexecuteoptions)
        - 2.2.5 [ScriptResult](#225-scriptresult)
        - 2.2.6 [CommandResult](#226-commandresult)
        - 2.2.7 [FieldInfo](#227-fieldinfo)
        - 2.2.8 [StatementPrepareOptions](#228-statementprepareoptions)
        - 2.2.9 [QueryOptions](#229-queryoptions)
        - 2.2.10 [QueryResult](#2210-queryresult)
   
# 1. Usage

## 1.1. Connecting
The library supports both single and pooled connections. 
If you want to establish a single session to a PostgreSQL server 
you need to use `Connection` class. If you require a connection pool use `Pool` class instead.

*new Connection([config: String | [ConnectionConfiguration](#221-connectionconfiguration)]);*


```ts
import {Connection} from 'postgresql-client';

const connection = new Connection({
    host: 'localhost',
    port: 5432,
    user: 'user1',
    password: 'mypass',
    database: 'mydb',
    timezone: 'Europe/Amsterdam'
});
await connection.connect();
// Do whatever you need with connection
await conection.close();
```

### 1.1.1. Connection Strings
You can initialize both a `Connection` and `Pool` using a connection string uri.
Unix domain sockets and TCP uri's can be used as connection string.

#### UNIX domain socket

`[unix:// | socket://][<user>][:<password>]@<path>[?query&query...]`

`/var/run/pgsql`

`/var/run/pgsql?db=mydb`

`unix:///var/run/pgsql`

`socket:/var/run/pgsql`

`socket://user:pass@/var/run/pgsql`

`socket://user:pass@/var/run/pgsql?db=mydb`

```ts
const connection = new Connection('postgres://someuser:somepassword@somehost:381/somedatabase');
```

#### TCP connection URI

`[pg:// | postgres://][<user>][:<password>]@<host>[:<port>][/<database>][?query&query...]`

`pg://user:pass@localhost:5432/mydb`

`pg://localhost?db=mydb&user=me`


### 1.1.2. Environment variables
Configuration object and connection strings are optional for both `Connection` and `Pool` classes. 
If no argument given while creating an instance,
same [environment variables](https://www.postgresql.org/docs/9.1/libpq-envars.html) as libpq will be used to establish connection.

Current supported environment variables are [PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, PGAPPNAME, PGTZ, PGCONNECT_TIMEOUT, PGSCHEMA]

```ts
const connection = new Connection(); // Initialize using environment variables
```



## 1.2. Pooling
`Pool` class is used to create a connection pool. Constructor accepts connection string or [PoolConfiguration](#222-poolconfiguration) interface

*new Pool([config: String | [PoolConfiguration](#222-poolconfiguration)]);*

```ts
import {Pool} from 'postgresql-client';

const dbpool = new Pool({
    host: 'postgres://localhost',
    pool: {
       min: 1,
       max: 10,
       idleTimeoutMillis: 5000
    }
});
const qr = await pool.query('select * from my_table where id=1');
// Do whatever you need with pool
await dbpool.close(); // Disconnect all connections and shutdown pool
```

### 1.2.1. Obtaining a connection

The pool returns an idle `Connection` instance when you call `pool.acquire()` function. 
You must call `connection.release()` method when you done with the connection.    

_pool.acquire(): Promise<[Connection](#211-connection)>;_

```ts
  const connection = await dbpool.acquire();
  try {
    const qr = await connection.query('select * from my_table where id=1');
    // ... Do whatever you need with connection
  } finally {
    await connection.release(); // Connection will go back to the pool
  }
```

`Pool` class has `pool.execute()` and `pool.query()` methods which applies "obtain a connection", 
"execute the given query" and "release the connection" sequence. 
This is the comfortable and secure way 
if you don't execute your query in a transaction. 
So you don't need to take care of releasing the connection 
every time.

### 1.2.2. Shutting down the pool
To shut down a pool call `pool.close()` method. 
This will wait for active connections to get idle than will release all resources.
If you define `terminateWait argument, the pool wait until the given period of time in ms, before force connections to close. 

_pool.close(terminateWait?: number): Promise<void>;_


## 1.3. Queries

### 1.3.1 Simple query
PostgreSQL wire protocol has two kind of way to execute SQL scripts. 
Simple query is the mature way.
Simple query supports executing more than one sql scripts in a single command. 
But it does not support *bind parameters* and server transfers data in text format which is slower than binary format. 
So it may cause performance and security problems.
We suggest to use `query()` method which uses *Extended query protocol* if you need bind parameters or need to return rows.

To execute SQL scripts you can create a `ScriptExecutor` instance or just call `connection.execute()` or `pool.execute()` methods. 

*pool.execute(sql: string, options?: [ScriptExecuteOptions](#224-scriptexecuteoptions)]): Promise\<[ScriptResult](#225-scriptresult)>;*

*connection.execute(sql: string, options?: [ScriptExecuteOptions](#224-scriptexecuteoptions)]): Promise\<[ScriptResult](#225-scriptresult)>;*

```ts
const qr = await connection.execute('BEGIN; update my_table set ref = ref+1; END;');
console.log(qr.results[1].rowsAffected + ' rows updated');
```

```ts
const scriptExecutor = new ScriptExecutor(connection);
scriptExecutor.on('start', ()=>console.log('Script execution started'));
scriptExecutor.on('command-complete', (cmd) => console.log(cmd.command + ' complete'));
scriptExecutor.on('row', (row)=>console.log('Row received: ', row));
scriptExecutor.on('finish', ()=>console.log('Script execution complete'));
await scriptExecutor.execute(`
    BEGIN; 
    update my_table set ref = ref+1; 
    select * from my_table where id=1; 
    END;`);
```




## 1.3.2. Extended query

In the extended-query protocol, *prepared statements* and *portals* are used. 
Unlike simple query, extended query protocol supports parameter binding and binary data format.
The only limit is you can execute one command at a time.

*pool.query(sql: string, options?: [QueryOptions](#229-queryoptions)]): Promise\<[QueryResult](#2210-queryresult)>;*

*connection.query(sql: string, options?: [QueryOptions](#229-queryoptions)]): Promise\<[QueryResult](#2210-queryresult)>;*


```ts
const qr = await connection.query('select * from my_table');
console.log(qr.fields);
console.log(qr.rows);
```




## 1.3.3. Prepared Statements

Prepared statements are great when you need executing a script more than once (etc. bulk insert or update).
It dramatically reduces execution time.

To create a [PreparedStatement](#214-preparedstatement) instance or just call `connection.prepare()` or `pool.prepare()` methods. 

*pool.prepare(sql: string, options?: [StatementPrepareOptions](#228-statementprepareoptions)]): Promise\<[PreparedStatement](#214-preparedstatement)>;*

*connection.prepare(sql: string, options?: [StatementPrepareOptions](#228-statementprepareoptions)]): Promise\<[PreparedStatement](#214-preparedstatement)>;*

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



## 1.3.4. Using Cursors
Cursors enable applications to process very large data sets. 
Cursors should also be used where the number of query rows cannot be predicted 
and may be larger than your JavaScript engine can handle in a single array.
A [Cursor](#213-cursor) object is obtained by setting `cursor: true` in the 
[options](#229-queryoptions) parameter of the [Connection](#211-connection).execute() 
method when executing a query. Cursor fetches rows in batches. Cursor.next() method 
returns the next row from the internal cache. When internal cache is empty, 
it fetches next batch of rows from the server. 
`fetchCount` property lets you set the batch size. 
Where there is no more row to fetch, Cursor is closed automatically and next() method returns `undefined`;

```ts
const qr = await connection.query('select * from my_table', 
    {cursor: true, fetchCount: 250});
console.log(qr.fields);
const cursor = qr.cursor;
let row;
while ((row = cursor.next())) {
  console.log(row);
}
await cursor.close(); // When you done, close the cursor to relase resources
```


## 1.4. Transaction management

To start a transaction in PostgreSQL you need to execute 'BEGIN' command. 
'COMMIT' to apply changes and 'ROLLBACK' to revert. `Connection` class has `startTransaction()`, `commit()`, `rollback()`, 
`savepoint()`, `rollbackToSavepoint()` shorthand methods which is typed and more test friendly.

By default, PostgreSQL server executes SQL commands in auto-commit mode.
`postgresql-client` has a high-level implementation to manage this.
You can change this behaviour by setting `autoCommit` property to `false`. 
After that all SQL scripts will be executed in transaction and 
changes will not be applied until you call `commit()` or execute `COMMIT` command.

You can also check transaction status with `connection.inTransaction` getter.


## 1.5. Data types

### 1.5.1 Type mappings
 
The table below lists builtin data type mappings.

| Posgtres type   | JS type             | Receive     | Send     | 
|-----------------|:--------------------| ------------|----------|
| bool            | boolean             | text,binary | binary   | 
| int2            | number              | text,binary | binary   | 
| int4            | number              | text,binary | binary   | 
| int8            | BigInt              | text,binary | binary   | 
| float4          | number              | text,binary | binary   | 
| float8          | number              | text,binary | binary   | 
| char            | string              | text,binary | binary   | 
| bpchar          | string              | text,binary | binary   | 
| varchar         | string              | text,binary | binary   | 
| date            | Date                | text,binary | binary   | 
| time            | Date                | text,binary | binary   | 
| timestamp       | Date                | text,binary | binary   | 
| timestamptz     | Date                | text,binary | binary   | 
| oid             | number              | text,binary | binary   | 
| bytea           | Buffer              | text,binary | binary   | 
| uuid            | string              | text,binary | binary   | 
| json            | string              | text,binary | binary   | 
| xml             | string              | text,binary | binary   | 
| point           | Point               | text,binary | binary   | 
| circle          | Circle              | text,binary | binary   | 
| lseg            | Rectangle           | text,binary | binary   | 
| box             | Rectangle           | text,binary | binary   | 
| _bool           | boolean[]           | text,binary | binary   | 
| _int2           | number[]            | text,binary | binary   | 
| _int4           | number[]            | text,binary | binary   | 
| _int8           | BigInt[]            | text,binary | binary   | 
| _float4         | number[]            | text,binary | binary   | 
| _float8         | number[]            | text,binary | binary   | 
| _char           | string[]            | text,binary | binary   | 
| _bpchar         | string[]            | text,binary | binary   | 
| _varchar        | string[]            | text,binary | binary   | 
| _date           | Date[]              | text,binary | binary   | 
| _time           | Date[]              | text,binary | binary   | 
| _timestamp      | Date[]              | text,binary | binary   | 
| _timestamptz    | Date[]              | text,binary | binary   | 
| _uuid           | string[]            | text,binary | binary   | 
| _oid            | number[]            | text,binary | binary   | 
| _bytea          | Buffer[]            | text,binary | binary   | 
| _json           | string[]            | text,binary | binary   | 
| _xml            | string[]            | text,binary | binary   | 
| _point          | Point[]             | text,binary | binary   | 
| _circle         | Circle[]            | text,binary | binary   | 
| _lseg           | Rectangle[]         | text,binary | binary   | 
| _box            | Rectangle[]         | text,binary | binary   | 

### 1.5.2 Data transfer formats
PostgreSQL wire protocol offers `text` and `binary` data transfer formats.
Most common libraries supports only `text` transfer format which is easy to implement but poses performance and memory problems.
`postgresql-client` has rich data type mappings which supports both `text` and `binary` formats.
The default format is set to `binary`. However, you can set the format to `text` for all columns or per column.

Note that binary format is faster than text format. 
If there is a type mapping for that postgres type, we don't suggest you text format.

```ts
const qr = await connection.query('select id, other_field from my_table',
    {columnFormat: DataFormat.text});
console.log(qr.rows);
```

```ts
const qr = await connection.query('select id, other_field from my_table',
    {columnFormat: [DataFormat.binary, DataFormat.text]});
console.log(qr.rows);
```



# 2. API

## 2.1. Classes


### 2.1.1. Connection

`new Connection([config: String | ConnectionConfiguration)`

#### Properties

| Key             | Type                  | Readonly | Description        | 
|-----------------|:----------------------| ---------|--------------------|
| config          | [ConnectionConfiguration](#221-connectionconfiguration) | true | Returns configuration object | 
| inTransaction   | `boolean`             | true     | Returns true if connection is in a transaction | 
| state           | `ConnectionState`     | true     | Returns current state of the connection | 
| processID       | `number`              | true     | Returns processId of current session | 
| secretKey       | `number`              | true     | Returns secret key of current session | 
| sessionParameters | `object`            | true     | Returns information parameters for current session | 



#### Methods


##### .connect()

Connects to the server

`connect(): Promise<void>`

````ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
// ...
````


##### .close()

For a single connection this call closes connection permanently.
For a pooled connection it sends the connection back to the pool. 

You can define how long time the connection will wait for active queries before closing. 
At the end of time, it forces to close/release and emits `terminate` event.

`close(terminateWait?: number): Promise<void>`

- terminateWait: On the end of the given time, it forces to close the socket and than emits `terminate` event.

| Argument        | Type      | Default | Description                            | 
|-----------------|-----------| --------|--------------------|
| terminateWait   | `number`  | 10000   | Time in ms that the connection will wait for active queries before terminating | 



```ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
connection.on('close', ()=> {
  console.log('Connection closed');
});
connection.on('terminate', ()=> {
  console.warn('Connection forced to terminate!');
});
// ...
await connection.close(30000); // will wait 30 secs before terminate the connection
```


##### .execute()

Executes single or multiple SQL scripts using [Simple Query](https://www.postgresql.org/docs/current/protocol-flow.html#id-1.10.5.7.4) protocol.

`execute(sql: string, options?: ScriptExecuteOptions): Promise<ScriptResult>;`

| Argument     | Type        | Default  | Description                            | 
|--------------|--------------| --------|--------------------|
| sql          | string       |         | SQL script that will be executed | 
| options      | [ScriptExecuteOptions](#224-scriptexecuteoptions) |         | Execute options | 

- Returns [ScriptResult](#225-scriptresult)

```ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
const executeResult = await connection.execute(  
    'BEGIN; update my_table set ref=1 where id=1; END;');
// ...
await connection.close();
```




##### .query()

Executes single SQL script using [Extended Query](https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY) protocol.

`query(sql: string, options?: ScriptExecuteOptions): Promise<ScriptResult>;`

| Argument     | Type        | Default  | Description                            | 
|--------------|--------------| --------|--------------------|
| sql          | string       |         | SQL script that will be executed | 
| options      | [QueryOptions](#229-queryoptions) |         | Execute options | 


- Returns [QueryResult](#2210-queryresult)

```ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
const queryResult = await connection.query(  
    'select * from my_table', {
      cursor: true,
      utcDates: true
    });
  let row;
  while ((row = queryResult.cursor.next())) {
    // ....
  }
await connection.close();
```



##### .prepare()

Creates a [PreparedStatement](#214-preparedstatement) instance

`prepare(sql: string, options?: StatementPrepareOptions): Promise<PreparedStatement>`

| Argument     | Type        | Default  | Description                            | 
|--------------|--------------| --------|--------------------|
| sql          | string       |         | SQL script that will be executed | 
| options      | [StatementPrepareOptions](#228-statementprepareoptions) |         | Options | 

- Returns [PreparedStatement](#214-preparedstatement)


```ts
import {Connection, DataTypeOIDs} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
const statement = await connection.prepare(  
    'insert into my_table (ref_number) ($1)', {
      paramTypes:  [DataTypeOIDs.Int4]
    });
  // Bulk insert 100 rows
  for (let i=0; i<100; i++) {
    await statement.execute({params: [i]});
  }
  await statement.close();
```



##### .startTransaction()

Starts a transaction

`startTransaction(): Promise<void>`

```ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
await connection.startTransaction();
const executeResult = await connection.execute(  
    'update my_table set ref=1 where id=1');
// ...... commit or rollback
await connection.close();
```


##### .commit()

Commits current transaction

`commit(): Promise<void>`

```ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
await connection.startTransaction();
const executeResult = await connection.execute(  
    'update my_table set ref=1 where id=1');
await connection.commit();
await connection.close();
```




##### .rollback()

Rolls back current transaction

`commit(): Promise<void>`

```ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
await connection.startTransaction();
const executeResult = await connection.execute(  
    'update my_table set ref=1 where id=1');
await connection.commit();
await connection.close();
```



##### .savepoint()

Starts transaction and creates a savepoint

`savepoint(name: string): Promise<void>`


| Argument     | Type        | Default  | Description                            | 
|--------------|-------------| ---------|--------------------|
| name         | string      |          | Name of the savepoint | 


##### .rollbackToSavepoint()

Rolls back current transaction to given savepoint

`savepoint(name: string): Promise<void>`


| Argument     | Type        | Default  | Description                            | 
|--------------|-------------| ---------|--------------------|
| name         | string      |          | Name of the savepoint | 


```ts
import {Connection} from 'postgresql-client';

const connection = new Connection('postgres://localhost');
await connection.connect();
await connection.savepoint('my_save_point');
const executeResult = await connection.execute(  
    'update my_table set ref=1 where id=1');
await connection.rollbackToSavepoint('my_save_point');
await connection.close();
```



#### Events

* error
* close
* connecting
* ready
* terminate




### 2.1.2. Pool

`new Pool([config: String | PoolConfiguration)`

#### Properties

| Key                 | Type                 | Readonly | Description        | 
|---------------------|----------------------| ---------|--------------------|
| config              | [PoolConfiguration](#222-poolconfiguration)] | true | Returns configuration object | 
| acquiredConnections | `number`             | true     | Returns number of connections that are currently acquired | 
| idleConnections     | `number`             | true     | Returns number of unused connections in the pool | 
| acquiredConnections | `number`             | true     | Returns number of connections that are currently acquired | 
| totalConnections    | `number`             | true     | Returns total number of connections in the pool regardless of whether they are idle or in use | 


#### Methods


##### .acquire()

Obtains a connection from the connection pool

`acquire(): Promise<PoolConnection>`

- Returns [Connection](#211-connection)

````ts
import {Pool} from 'postgresql-client';

const pool = new Pool('postgres://localhost');
const connection = await pool.acquire();
// ...
await connection.relese();
````



##### .close()

Shuts down the pool and destroys all resources.

`close(terminateWait?: number): Promise<void>`

````ts
import {Pool} from 'postgresql-client';

const pool = new Pool('postgres://localhost');
const connection = await pool.acquire();
// ...
await pool.close(5000);
````



##### .execute()

Acquires a connection from the pool and executes single or multiple SQL scripts using [Simple Query](https://www.postgresql.org/docs/current/protocol-flow.html#id-1.10.5.7.4) protocol.

`execute(sql: string, options?: ScriptExecuteOptions): Promise<ScriptResult>;`

| Argument     | Type        | Default  | Description                            | 
|--------------|--------------| --------|--------------------|
| sql          | string       |         | SQL script that will be executed | 
| options      | [ScriptExecuteOptions](#224-scriptexecuteoptions) |         | Execute options | 

- Returns [ScriptResult](#225-scriptresult)

```ts
import {Pool} from 'postgresql-client';

const pool = new Pool('postgres://localhost');
const executeResult = await pool.execute(  
    'BEGIN; update my_table set ref=1 where id=1; END;');
// ...
await pool.close();
```




##### .query()

Acquires a connection from the pool and executes single SQL script using [Extended Query](https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY) protocol.

`query(sql: string, options?: ScriptExecuteOptions): Promise<ScriptResult>;`

| Argument     | Type        | Default  | Description                            | 
|--------------|--------------| --------|--------------------|
| sql          | string       |         | SQL script that will be executed | 
| options      | [QueryOptions](#229-queryoptions) |         | Execute options | 


- Returns [QueryResult](#2210-queryresult)

```ts
import {Pool} from 'postgresql-client';

const pool = new Pool('postgres://localhost');
const queryResult = await pool.query(  
    'select * from my_table', {
      cursor: true,
      utcDates: true
    });
  let row;
  while ((row = queryResult.cursor.next())) {
    // ....
  }
await pool.close();
```


##### .prepare()

Acquires a connection from the pool and creates a [PreparedStatement](#214-preparedstatement) instance.

`prepare(sql: string, options?: StatementPrepareOptions): Promise<PreparedStatement>`

| Argument     | Type        | Default  | Description                            | 
|--------------|--------------| --------|--------------------|
| sql          | string       |         | SQL script that will be executed | 
| options      | [StatementPrepareOptions](#228-statementprepareoptions) |         | Options | 

- Returns [PreparedStatement](#214-preparedstatement)


```ts
import {Pool, DataTypeOIDs} from 'postgresql-client';

const pool = new Pool('postgres://localhost');
const statement = await pool.prepare(  
    'insert into my_table (ref_number) ($1)', {
      paramTypes:  [DataTypeOIDs.Int4]
    });
  // Bulk insert 100 rows
  for (let i=0; i<100; i++) {
    await statement.execute({params: [i]});
  }
  await statement.close();
```


##### .release()

Releases a connection

`release(connection: Connection): Promise<void>`



### 2.1.3. Cursor


### 2.1.4. PreparedStatement


### 2.1.5. BindParam


### 2.1.6. DataTypeMap



## 2.2. Interfaces

### 2.2.1. ConnectionConfiguration

| Key             | Type                  | Default           | Description                            | 
|-----------------|:----------------------| ---------------------------------------|--------------------|
| host            | `string`              | localhost | Host name or the address of the server | 
| port            | `number`              | 5432      | Server listening port number           | 
| user            | `string`              | postgres  | Authenticating user name               |
| password        | `string`              |           | User password                          |
| database        | `string`              |           | Database name to be connected          |
| applicationName | `string`              |           | The name of your application to attach with your session |
| typesMap        | `DataTypeMap`         | *GlobalTypeMap* |Data type map instance |
| ssl             | `tls.ConnectionOptions`|           | SSL configuration | 
| timezone        | `string`              |           | Timezone to be set on start. (Equivalent to SET timezone TO ....) |
| schema          | `string`              |           | Default schema to be set on start. (Equivalent to SET search_path = ....) |
| connectTimeoutMs| `number`              | 30000     | Connection timeout value in millis | 
| autoCommit      | `boolean`             | false     | Specifies weather execute query in auto-commit mode | 
| onErrorRollback | `boolean`             | true     | When on, if a statement in a transaction block generates an error, the error is ignored and the transaction continues. When off (the default), a statement in a transaction block that generates an error aborts the entire transaction | 


### 2.2.2. PoolConfiguration

Extends [ConnectionConfiguration](#221-connectionconfiguration)

| Key               | Type        | Default |    Description        |
|-------------------|-------------| --------|-----------------------|
| acquireMaxRetries  | `number`   | 0       | Maximum number that Pool will try to create a connection before returning the error |
| acquireRetryWait   | `number`   | 2000    | Time in millis that Pool will wait after each tries | 
| acquireTimeoutMillis | `number` | 0       | Time in millis an acquire call will wait for a connection before timing out |
| fifo              | `boolean`   | true    | Specifies if resources will be allocated first-in-first-out order |
| idleTimeoutMillis | `number`    | 30000   | The minimum amount of time in millis that a connection may sit idle in the Pool |
| houseKeepInterval | `number`    | 1000    | Time period in millis that Pool will make a cleanup |
| min               | `number`    | 0       | Minimum number of connections that Pool will keep |
| minIdle           | `number`    | 0       | Minimum number of connections that Pool will keep in idle state |
| max               | `number`    | 10      | Maximum number of connections that Pool will create |
| maxQueue          | `number`    | 1000    | Maximum number of request that Pool will accept |
| validation        | `boolean`   | false   | If true Pool test connection on acquire |


### 2.2.3. DataMappingOptions

| Key          | Type        | Default |    Description        |
|--------------|-------------| --------|-----------------------|
| utcDates     | `boolean`   | false   | If true UTC time will be used for date decoding, else system time offset will be used |


### 2.2.4. ScriptExecuteOptions

Extends [DataMappingOptions](#223-datamappingoptions)

| Key          | Type        | Default |    Description        |
|--------------|-------------| --------|-----------------------|
| autoCommit   | `boolean`   | false   | Specifies weather execute query in auto-commit mode |
| objectRows   | `boolean`   | false   | Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values |
| typeMap      | `DataTypeMap`| *GlobalTypeMap* |Data type map instance |
| onErrorRollback | `boolean`   | true   | When on, if a statement in a transaction block generates an error, the error is ignored and the transaction continues. When off (the default), a statement in a transaction block that generates an error aborts the entire transaction |


### 2.2.5. ScriptResult

| Key          | Type        | Description        |
|--------------|-------------| -------------------|
| results      | `CommandResult[]` | Array of command result for each sql command in the script |
| totalCommands| `number`    |  Command count in the script |
| totalTime    | `number`   |  Total execution time  |


### 2.2.6. CommandResult
| Key          | Type         | Description        |
|--------------|--------------| -------------------|
| command      | `string`     | Name of the command (INSERT, SELECT, UPDATE, etc.) |
| fields       | `FieldInfo[]`| Contains information about fields in column order |
| rows         | `array`      | Contains array of row data |
| executeTime  | `number`     | Time elapsed to execute command |
| rowsAffected | `number`     | How many rows affected |


### 2.2.7. FieldInfo
| Key           | Type        | Description        |
|---------------|-------------| -------------------|
| fieldName     | `string` | Name of the field |
| tableId       | `number` | OID of the table |
| columnId      | `number` | OID of the column |
| dataTypeId    | `number` | OID of the data type |
| dataTypeName  | `string` | Name of the data type |
| elementDataTypeId    | `number` | OID of the elements data type if field is an array |
| elementDataTypeName  | `string` |  Name of the elements data type if field is an array |
| dataTypeName  | `string` | Name of the data type |
| jsType        | `number` | JS type name that data type mapped |
| modifier      | `number` | Modifier of the data type |
| isArray       | `boolean`| Whether the data type is an array |

### 2.2.8. StatementPrepareOptions

| Key          | Type        | Default |    Description        |
|--------------|-------------| --------|-----------------------|
| paramTypes   | `number[]`  |         | Specifies data type for each parameter |
| typeMap      | `DataTypeMap` | *GlobalTypeMap* | Data type map instance |

### 2.2.9. QueryOptions

Extends [DataMappingOptions](#223-datamappingoptions)

| Key          | Type         | Default |    Description        |
|--------------|--------------| --------|-----------------------|
| objectRows   | `boolean`    | false   | Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values |
| typeMap      | `DataTypeMap`| *GlobalTypeMap* |Data type map instance |
| cursor       | `boolean`    | false   | If true, returns Cursor instance instead of rows |
| params       | `(BindParam  | any)[]` | Query execution parameters |
| columnFormat | `DataFormat` `DataFormat[]`| 1 (binary)  | Specifies transfer format (binary or text) for each column |
| fetchCount   | `number`     | 100     | Specifies how many rows will be fetched. For Cursor, this value specifies how many rows will be fetched in a batch |
| fetchAsString| `OID[]`      |         | Specifies which data types will be fetched as string |
| onErrorRollback | `boolean`   | true   | When on, if a statement in a transaction block generates an error, the error is ignored and the transaction continues. When off (the default), a statement in a transaction block that generates an error aborts the entire transaction |

### 2.2.10. QueryResult

Extends [CommandResult](#226-commandresult)

| Key          | Type         | Default |    Description        |
|--------------|--------------| --------|-----------------------|
| cursor       | `Cursor`     |         | Cursor instance |
