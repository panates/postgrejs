DROP SCHEMA IF EXISTS test CASCADE;
CREATE SCHEMA test AUTHORIZATION postgres;

CREATE TABLE test.regions
(
    id character varying(10) NOT NULL,
    name character varying(16),
    CONSTRAINT regions_pkey PRIMARY KEY (id)
);

CREATE TABLE test.airports
(
    id character varying(10) NOT NULL,
    shortname character varying(10),
    name character varying(32),
    region character varying(5),
    icao character varying(10),
    flags integer,
    catalog integer,
    length integer,
    elevation integer,
    runway character varying(5),
    frequency float,
    latitude character varying(10),
    longitude character varying(10),
    temp integer,
    CONSTRAINT airports_pkey PRIMARY KEY (id),
    CONSTRAINT fk_airports_region FOREIGN KEY (region)
        REFERENCES test.regions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
);

CREATE TABLE test.data_types
(
    id SERIAL NOT NULL,
    f_bool bool,
    f_int2 int2,
    f_int4 int4,
    f_int8 int8,
    f_float4 float4,
    f_float8 float8,
    f_numeric8 numeric(8),
    f_numeric38 numeric(38),
    f_char char,
    f_varchar character varying(255),
    f_text text,
    f_bpchar bpchar,
    f_json json,
    f_xml xml,
    f_date date,
    f_timestamp timestamp,
    f_timestamptz timestamptz,
    f_bytea bytea,
    f_point point,
    f_circle circle,
    f_lseg lseg,
    f_box box,
    CONSTRAINT data_types_pkey PRIMARY KEY (id)
);

insert into test.data_types
  (id, f_bool, f_int2, f_int4, f_int8, f_float4, f_float8, f_numeric8, f_numeric38,
   f_char, f_varchar, f_text, f_bpchar, f_json, f_xml, f_date, f_timestamp,
   f_timestamptz, f_bytea, f_point, f_circle, f_lseg, f_box)
values
  (1, true, 1, 12345, 1234567890123, 1.2, 5.12345, 1.12345, 1.123,
    'a', 'abcd', 'abcde', 'abcdef',
   '{"a": 1}', '<tag1>123</tag1>', '2010-03-22', '2020-01-10 15:45:12.123',
    '2005-07-01 01:21:11.123+03:00', 'ABCDE', '(-1.2, 3.5)', '<(-1.2, 3.5), 4.6>',
    '[(1.2, 3.5), (4.6, 5.2)]', '((-1.6, 3.0), (4.6, 0.1))');
