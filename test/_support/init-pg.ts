/* eslint-disable import-x/extensions */
import './env';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

export function configurePostgresql() {
  const database = process.env.PGDATABASE || 'postgrejs_test';
  const user = database;
  const user_md5 = process.env.LOGIN_MD5 || 'postgrejs_test_md5';
  const user_scram = process.env.LOGIN_SCRAM || 'postgrejs_test_scram';
  exec('dropdb', [database]);

  exec('psql', ['-c', 'alter system set ssl=on']);
  exec('psql', ['-c', `drop user if exists ${user}`]);
  exec('psql', ['-c', `create user ${user}`]);
  exec('psql', ['-c', 'alter system set password_encryption=md5']);
  exec('psql', ['-c', 'select pg_reload_conf()']);
  exec('psql', ['-c', `drop user if exists $${user_md5}`]);
  exec('psql', ['-c', `create user ${user_md5} with password '${user_md5}'`]);
  exec('psql', ['-c', "alter system set password_encryption='scram-sha-256'"]);
  exec('psql', ['-c', 'select pg_reload_conf()']);
  exec('psql', ['-c', `drop user if exists ${user_scram}`]);
  exec('psql', [
    '-c',
    `create user ${user_scram} with password '${user_scram}'`,
  ]);

  exec('createdb', [database]);
  exec('psql', ['-c', `grant all on database ${database} to ${user}`]);
  exec('psql', ['-c', `alter database ${database} owner to ${user}`]);
}

export function exec(cmd: string, args: readonly string[]) {
  const { stderr } = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });
  if (
    stderr &&
    !stderr.includes('already exists') &&
    !stderr.includes('does not exist')
  )
    throw stderr;
}
