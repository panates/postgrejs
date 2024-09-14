/* eslint-disable import-x/extensions */
import './env';
import process from 'node:process';
import { createTestSchema } from './create-db';
import { configurePostgresql } from './init-pg';

export default async function setup() {
  if (process.env.INIT_PG) {
    configurePostgresql();
  }
  await createTestSchema();
}
