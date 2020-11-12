# [postgresql-client](https://github.com/panates/postgresql-client) 

# Contents

- 1\. [Usage](#1-usage)
    - 1.1 [Connecting](#1-1-connecting)
        - 1.1.1 [Connection strings](#1-1-1-connection-strings)
        - 1.1.2 [Environment variables](#1-1-2-environmentvariables)
    - 1.2 [Pooling](#12pooling)
        - 1.2.1 [Pool configuration](#1-2-1-poolcon-figuration)
        - 1.2.2 [Obtaining a connection](#1-2-2-obtaining-a-connection)
        - 1.2.3 [Shutting down the pool](#1-2-3-shutting-down-the-pool)
    - 1.3 [Queries](#1-3-queries)        
        - 1.3.1 [Simple query](#1-3-1-simple-query)
        - 1.3.2 [Extended query](#1-3-2-simple-query)
        - 1.3.3 [Prepared Statements](#1-3-3-prepared-statements)
        - 1.3.4 [Using Cursors](#1-3-4-using-cursors)
    - 1.4 [Transactions](#1-4-transactions)
    - 1.5 [Registering data types](#1-5-registering-datatypes)
- 2\. [API](#2-api)
    - 2.1 [Classes](#2-1-classes)
        - 2.1.1 [Connection](#2-1-1-connection)
        - 2.1.2 [Pool](#2-1-2-pool)
        - 2.1.3 [Cursor](#2-1-3-cursor)
        - 2.1.4 [PreparedStatement](#2-1-4-prepared-statement)
        - 2.1.5 [ScriptExecutor](#2-1-5-script-executor)
        - 2.1.6 [BindParam](#2-1-6-bindparam)
        - 2.1.7 [DataTypeMap](#2-1-7-datatypemap)
    - 2.2 [Interfaces](#2-2-interfaces)
        - 2.2.1 [ConnectionConfiguration](#2-2-1-connection-configuration)
        - 2.2.2 [PoolConfiguration](#2-2-2-pool-configuration)
        - 2.2.3 [DataMappingOptions](#2-2-3-datamappingoptions)
        - 2.2.4 [ScriptExecuteOptions](#2-2-4-scriptexecuteoptions)
        - 2.2.5 [ScriptResult](#2-2-5-scriptresult)
        - 2.2.6 [CommandResult](#2-2-6-commandresult)
        - 2.2.7 [FieldInfo](#2-2-7-fieldinfo)
        - 2.2.8 [StatementPrepareOptions](#2-2-8-statementprepareoptions)
        - 2.2.9 [QueryOptions](#2-2-9-queryoptions)
        - 2.2.10 [QueryResult](#2-2-10-queryresult)
   
# 1. Usage

## 1.1. Connecting
The library supports both single and pooled connections. 
If you want to establish a single session to a PostgreSQL server 
you need to use `Connection` class. If you require a connection pool use `Pool` class instead.


*new Connection([config: String | [ConnectionConfiguration](#2-2-1-connectionconfiguration)]);*

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

Current supported environment variables are [PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, PGAPPNAME, PGTZ, PGCONNECT_TIMEOUT, PGSEARCHPATH]

```ts
const connection = new Connection(); // Initialize using environment variables
```



## 1.2. Pooling
`Pool` class is used to create a connection pool. Constructor accepts connection string or [PoolConfiguration](#2-2-2-poolconfiguration) interface

*new Pool([config: String | [PoolConfiguration](#2-2-2-poolconfiguration)]);*

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

### 1.2.2. Obtaining a connection

The pool returns an idle `Connection` instance when you call `pool.acquire()` function. 
You must call `connection.release()` method when you done with the connection.    

`pool.acquire(): Promise<Connection>;`

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

### 1.2.3. Shutting down the pool
To shut down a pool call `pool.close()` method. 
This will wait for active connections to get idle than will release all resources.
If you define `terminateWait argument, the pool wait until the given period of time in ms, before force connections to close. 

`pool.close(terminateWait?: number): Promise<void>;`


## 1.3. Queries

### 1.3.1 Simple query
PostgreSQL wire protocol has two kind of way to execute SQL scripts. 
Simple query is the mature way.
Simple query supports executing more than one sql scripts in a single command. 
But it does not support *bind parameters* and server transfers data in text format which is slower than binary format. 
So it may cause performance and security problems.
We suggest to use `query()` method which uses *Extended query protocol* if you need bind parameters or need to return rows.

To execute SQL scripts you can create a `ScriptExecutor` instance or just call `connection.execute()` or `pool.execute()` methods. 

*pool.execute(sql: string, options?: [ScriptExecuteOptions](#2-2-4-scriptexecuteOptions)]): Promise\<[ScriptResult](#225scriptresult)>;*

*connection.execute(sql: string, options?: [ScriptExecuteOptions](#2-2-4-scriptexecuteOptions)]): Promise\<[ScriptResult](#225scriptresult)>;*

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

*pool.query(sql: string, options?: [QueryOptions](#2-2-9-queryoptions)]): Promise\<[QueryResult](#2210queryresult)>;*

*connection.query(sql: string, options?: [QueryOptions](#2-2-9-queryoptions)]): Promise\<[QueryResult](#2210queryresult)>;*


```ts
const qr = await connection.query('select * from my_table');
console.log(qr.fields);
console.log(qr.rows);
```




## 1.3.3. Prepared Statements

Prepared statements are great when you need executing a script more than once (etc. bulk insert or update).
It dramatically reduces execution time.

To create a [PreparedStatement](#2-1-4-preparedstatement) instance or just call `connection.prepare()` or `pool.prepare()` methods. 

*pool.prepare(sql: string, options?: [StatementPrepareOptions](#2-2-8-statementprepareoptions)]): Promise\<[PreparedStatement](#214preparedstatement)>;*

*connection.prepare(sql: string, options?: [StatementPrepareOptions](#2-2-8-statementprepareoptions)]): Promise\<[PreparedStatement](#214preparedstatement)>;*

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


```ts
const qr = await connection.query('select * from my_table', {cursor: true});
console.log(qr.fields);
const cursor = qr.cursor;
let row;
while ((row = cursor.next())) {
  console.log(row);
}
await cursor.close(); // When you done, close the cursor to relase resources
```


# 2. API

## 2.1. Classes


### 2.1.1. Connection

*new Connection([config: String | [ConnectionConfiguration](#2-2-1-connectionconfiguration)]);*

#### Properties

| Key             | Type                  | Readonly | Description                            | 
|-----------------|:----------------------| ---------------------------------------|--------------------|
| state           | `ConnectionState`     | true     | Returns current state of the connection | 

#### Prototype Methods

***
connect()*: Promise\<void>


***
close(terminateWait?: number)*: Promise\<void>


***
execute(sql: string, options?: [ScriptExecuteOptions](#2-2-4-scriptexecuteOptions)]): Promise\<[ScriptResult](#225scriptresult)>;


***
query(sql: string, options?: [QueryOptions](#2-2-9-queryoptions)]): Promise\<[QueryResult](#2210queryresult)>;

***
prepare(sql: string, options?: [StatementPrepareOptions](#2-2-8-statementprepareoptions)]): Promise\<[PreparedStatement](#214preparedstatement)>;


#### Events

* error
* close
* connecting
* ready
* terminate




### 2.1.2. Pool

*new Pool([config: String | [PoolConfiguration](#2-2-2-poolconfiguration)]);*




### 2.1.3. Cursor


### 2.1.4. PreparedStatement


### 2.1.5. ScriptExecutor


### 2.1.6. BindParam


### 2.1.7. DataTypeMap



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
| ssl             | `tls.ConnectionOptions|           | SSL configuration | 
| timezone        | `string`              |           | Timezone to be set on start. (Equivalent to SET timezone TO ....) |
| searchPath      | `string`              |           | Search path to be set on start. (Equivalent to SET search_path = ....) |
| connectTimeoutMs| `number`              | 30000     | Connection timeout value in millis | 
| keepAlive       | `boolean`             | true      | Socket keep alive value | 


### 2.2.2. PoolConfiguration

Extends [ConnectionConfiguration](#2-2-1-connectionconfiguration)

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

Extends [DataMappingOptions](#223DataMappingOptions)

| Key          | Type        | Default |    Description        |
|--------------|-------------| --------|-----------------------|
| objectRows   | `boolean`   | false   | Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values |
| typeMap      | `DataTypeMap`| *GlobalTypeMap* |Data type map instance |


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
| Key          | Type        | Description        |
|--------------|-------------| -------------------|
| fieldName   | `string` | Name of the field |
| tableId     | `number` | OID of the table |
| columnId    | `number` | OID of the column |
| dataTypeId  | `number` | OID of the data type |
| fixedSize   | `number` | Data length if data type has a fixed size |
| modifier    | `number` | Modifier of the data type |
| isArray     | `boolean`| Whether the data type is an array |

### 2.2.8. StatementPrepareOptions

| Key          | Type        | Default |    Description        |
|--------------|-------------| --------|-----------------------|
| paramTypes   | `number[]`  |         | Specifies data type for each parameter |
| typeMap      | `DataTypeMap` | *GlobalTypeMap* | Data type map instance |

### 2.2.9. QueryOptions

Extends [DataMappingOptions](#223datamappingoptions)

| Key          | Type         | Default |    Description        |
|--------------|--------------| --------|-----------------------|
| objectRows   | `boolean`    | false   | Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values |
| typeMap      | `DataTypeMap`| *GlobalTypeMap* |Data type map instance |
| cursor       | `boolean`    | false   | If true, returns Cursor instance instead of rows |
| params       | `(BindParam  | any)[]` | Query execution parameters |
| columnFormat | `DataFormat` `DataFormat[]`| 1 (binary)  | Specifies transfer format (binary or text) for each column |
| fetchCount   | `number`     | 100     | Specifies how many rows will be fetched. For Cursor, this value specifies how many rows will be fetched in a batch |

### 2.2.10. QueryResult

Extends [CommandResult](#226commandresult)

| Key          | Type         | Default |    Description        |
|--------------|--------------| --------|-----------------------|
| cursor       | `Cursor`     |         | Cursor instance |
