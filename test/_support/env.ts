import dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/.env' });

process.env.NODE_ENV = 'test';
process.env.PGSCHEMA = 'test';

const setup = (): void => {
  //
};

export default setup;
