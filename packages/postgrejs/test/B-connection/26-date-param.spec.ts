import { expect } from 'expect';
import { BindParam, Connection, DataTypeOIDs } from 'postgrejs';

/**
 * A `Date` parameter goes out with no declared type, as text carrying
 * the process's own offset - which is what `pg` sends, and the only
 * rendering that is right for a `timestamptz` column and a `timestamp`
 * column at once. The server resolves it from the column.
 *
 * It used to be declared `timestamp`, which wrote the local wall clock;
 * assigning that to a `timestamptz` column read it in the session's zone
 * and moved the instant by the client's offset.
 *
 * The defect only shows when the session's zone differs from the
 * process's, so the session is set to one that differs - whatever the
 * process zone is. Requiring `TZ` to be set instead would make this pass
 * as a no-op wherever it was not.
 */
describe('Date parameters', () => {
  const conn = new Connection();
  const instant = new Date('2024-03-05T06:07:08.900Z');
  let sessionZone: string;

  before(async () => {
    await conn.connect();
    sessionZone = instant.getTimezoneOffset() === 0 ? 'Europe/Istanbul' : 'UTC';
    await conn.execute(`set time zone '${sessionZone}'`);
    // The whole point of the test, so it is asserted rather than assumed.
    const r = await conn.query(
      'select extract(timezone from now())::int as secs',
      { objectRows: true },
    );
    const sessionOffset = Number((r.rows?.[0] as any).secs) / 60;
    expect(sessionOffset).not.toStrictEqual(-instant.getTimezoneOffset());
  });
  after(() => conn.close(0));

  it('should round-trip through a timestamptz column unchanged', async () => {
    await conn.execute(
      'drop table if exists t_date_rt; create table t_date_rt(v timestamptz)',
    );
    await conn.query('insert into t_date_rt values($1)', {
      params: [instant],
    });
    const r = await conn.query('select v from t_date_rt', {
      objectRows: true,
    });
    expect(((r.rows?.[0] as any).v as Date).getTime()).toStrictEqual(
      instant.getTime(),
    );
    await conn.execute('drop table t_date_rt');
  });

  it('should keep the wall clock in a timestamp column', async () => {
    // `pg` writes the process's wall clock here - 09:07:08.9 from a
    // client at +03 - because the offset it sends is discarded by a
    // zone-less column. Declaring `timestamptz` instead would have
    // written 06:07:08.9, moving the clock by the client's offset.
    const r = await conn.query('select ($1::timestamp)::text as t', {
      params: [instant],
      objectRows: true,
    });
    const p = (n: number) => String(n).padStart(2, '0');
    const wall =
      `${instant.getFullYear()}-${p(instant.getMonth() + 1)}-${p(instant.getDate())}` +
      ` ${p(instant.getHours())}:${p(instant.getMinutes())}:${p(instant.getSeconds())}.9`;
    expect((r.rows?.[0] as any).t).toStrictEqual(wall);
  });

  it('should send an array of them the same way', async () => {
    const a = await conn.query('select ($1::timestamptz[])[1] as v', {
      params: [[instant]],
      objectRows: true,
    });
    expect(((a.rows?.[0] as any).v as Date).getTime()).toStrictEqual(
      instant.getTime(),
    );
    const b = await conn.query('select (($1::timestamp[])[1])::text as t', {
      params: [[instant]],
      objectRows: true,
    });
    expect((b.rows?.[0] as any).t).toContain(
      String(instant.getHours()).padStart(2, '0') + ':',
    );
  });

  it('should reach a prepared statement that declared no types', async () => {
    // This used to send `String(date)` - a JavaScript date string the
    // server cannot parse - and threw.
    const st = await conn.prepare('select ($1::timestamptz)::text as t');
    const r = await st.execute({ params: [instant], objectRows: true });
    expect((r.rows?.[0] as any).t).toBeDefined();
    const back = await conn.query('select $1::timestamptz as v', {
      params: [instant],
      objectRows: true,
    });
    expect(((back.rows?.[0] as any).v as Date).getTime()).toStrictEqual(
      instant.getTime(),
    );
    await st.close();
  });

  it('should leave a named type alone, both of them', async () => {
    // These were correct before and have to stay correct: naming the
    // type is how a caller overrides the server's own resolution.
    const tz = await conn.query('select ($1::timestamptz)::text as t', {
      params: [new BindParam(DataTypeOIDs.timestamptz, instant)],
      objectRows: true,
    });
    expect((tz.rows?.[0] as any).t).toContain('2024-03-05');
    const ts = await conn.query('select ($1::timestamp)::text as t', {
      params: [new BindParam(DataTypeOIDs.timestamp, instant)],
      objectRows: true,
    });
    expect((ts.rows?.[0] as any).t).toContain('2024-03-05');
    // The two disagree, which is the whole reason neither can be the
    // default: one names an instant, the other a wall clock.
    expect((tz.rows?.[0] as any).t).not.toStrictEqual(
      (ts.rows?.[0] as any).t + '+00',
    );
  });

  it('should write the same literal as it binds', async () => {
    // An inlined Date and a bound one have to mean the same thing.
    const { sql } = await import('postgrejs');
    const inlined = await conn.query(sql`select (${instant})::timestamptz v`, {
      objectRows: true,
    });
    expect(((inlined.rows?.[0] as any).v as Date).getTime()).toStrictEqual(
      instant.getTime(),
    );
  });
});
