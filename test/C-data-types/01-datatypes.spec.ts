import fs from 'fs';
import path from 'path';
import { Connection } from 'postgrejs';

describe('Data type encode/decode', () => {
  let connection: Connection;
  process.env.PGTZ = 'Europe/Istanbul';

  beforeAll(async () => {
    connection = new Connection();
    await connection.connect();
    await connection.execute("SET SESSION timezone TO 'Europe/Berlin'");
  });

  afterAll(async () => {
    process.env.TZ = '';
    await connection.close(0);
  });

  const files = fs.readdirSync(path.join(__dirname, 'tests'));
  for (const f of files) {
    if (f.endsWith('.test.ts'))
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./tests/' + f).createTests(() => connection);
  }
});
