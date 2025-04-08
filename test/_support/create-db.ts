import './env.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const schema = process.env.PGSCHEMA || 'test';

const schemaSql = `
DROP SCHEMA IF EXISTS ${schema} CASCADE;
CREATE SCHEMA ${schema} AUTHORIZATION postgres;

CREATE TABLE ${schema}.continents
(
    code character varying(5),
    name character varying(16),   
    CONSTRAINT continents_pkey PRIMARY KEY (code)
);

CREATE TABLE ${schema}.countries
(
    code character varying(5),
    name character varying(16),
    phone_code character varying(8),
    continent_code character varying(2),
    CONSTRAINT countries_pkey PRIMARY KEY (code),
    CONSTRAINT fk_countries_continent_code FOREIGN KEY (continent_code)
        REFERENCES ${schema}.continents (code) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

CREATE TABLE ${schema}.customers
(
    id SERIAL,
    given_name character varying(64),
    family_name character varying(64),
    birth_date date,
    city character varying(32),
    country_code character varying(5),
    CONSTRAINT customers_pkey PRIMARY KEY (id),
    CONSTRAINT fk_customers_country_code FOREIGN KEY (country_code)
        REFERENCES ${schema}.countries (code) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

ALTER SEQUENCE ${schema}.customers_id_seq RESTART WITH 10000;

CREATE TABLE ${schema}.data_types
(
    id SERIAL NOT NULL,
    f_bool bool,
    f_int2 int2,   
    f_int4 int4,
    f_int8 int8,
    f_float4 float4,
    f_float8 float8,
    f_char char,
    f_varchar character varying(255),
    f_text text,
    f_uuid uuid,
    f_bpchar bpchar,
    f_json json,
    f_jsonb jsonb,
    f_xml xml,
    f_date date,
    f_timestamp timestamp,
    f_timestamptz timestamptz,
    f_bytea bytea,
    f_point point,
    f_circle circle,
    f_lseg lseg,
    f_box box,
    f_int2_vector int2Vector,
    CONSTRAINT data_types_pkey PRIMARY KEY (id)
);

insert into ${schema}.data_types
  (id, f_bool, f_int2, f_int4, f_int8, f_float4, f_float8, f_char, f_varchar,
   f_text, f_bpchar, f_json, f_jsonb, f_xml, f_date, f_timestamp, f_timestamptz,
   f_bytea, f_point, f_circle, f_lseg, f_box, f_uuid, f_int2_vector
  )
values
  (1, true, 1, 12345, 9007199254740995, 1.2, 5.12345, 'a', 'abcd', 'abcde', 'abcdef',
   '{"a": 1}', '{"a": 1}', '<tag1>123</tag1>', '2010-03-22', '2020-01-10 15:45:12.123',
    '2005-07-01 01:21:11.123+03:00', 'ABCDE', '(-1.2, 3.5)', '<(-1.2, 3.5), 4.6>',
    '[(1.2, 3.5), (4.6, 5.2)]', '((-1.6, 3.0), (4.6, 0.1))', 
    '87d48838-02b3-4e26-8fec-bcc8c00e3772',
    '1 3 5' 
    );
`;

export async function createTestSchema() {
  const client = new pg.Client({
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    database: process.env.PGDATABASE,
  });

  await client.connect();
  await client.query(schemaSql);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const dataFiles: any[] = [
    JSON.parse(
      fs.readFileSync(__dirname + '/test-data/continents.json', 'utf8'),
    ),
    JSON.parse(
      fs.readFileSync(__dirname + '/test-data/countries.json', 'utf8'),
    ),
    JSON.parse(
      fs.readFileSync(__dirname + '/test-data/customers.json', 'utf8'),
    ),
  ];

  /* Create tables */
  for (const table of dataFiles) {
    /* Insert rows */
    for (const row of table.rows) {
      const keys = Object.keys(row);
      const values = Object.values(row);
      const sql =
        'insert into test.' +
        table.name +
        ' (' +
        keys.join(',') +
        ') values (' +
        values.map((_, i) => '$' + (i + 1)).join(',') +
        ');\n';
      await client.query(sql, values);
    }
  }
  await client.end();
}

export async function mochaGlobalSetup() {
  await createTestSchema();
}
