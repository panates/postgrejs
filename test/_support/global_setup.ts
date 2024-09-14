/* eslint-disable import-x/extensions */
import './env';
import { createTestSchema } from './create-db';

export default async function setup() {
  await createTestSchema();
}
