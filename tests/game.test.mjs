import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('rooms: validation, winner, round isolation and access controls', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;`);
    const schema = (await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')).replace('alter publication supabase_realtime add table public.rooms, public.players;', '');
    await pg.exec(schema);
    const ids = ['00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000002','00000000-0000-4000-a000-000000000003'];
    for (const id of ids) await pg.query('insert into auth.users values ($1)', [id]);
    const as = async id => { await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [id]); await pg.exec('set role authenticated'); };
    await as(ids[0]);
    await assert.rejects(pg.query("select public.create_room('   ')"), /pseudo/);
    const room = (await pg.query("select * from public.create_room('Alice')")).rows[0];
    await assert.rejects(pg.query('select public.reset_round($1,1)', [room.id]), /premier buzz/);
    await as(ids[1]);
    assert.equal((await pg.query('select * from public.rooms')).rows.length, 0);
    await assert.rejects(pg.query('select public.buzz($1,1)', [room.id]), /Rejoins/);
    await assert.rejects(pg.query("select public.join_room($1,'alice')", [room.code]), /déjà pris/);
    await pg.query("select public.join_room($1,'Bob')", [room.code]);
    assert.equal((await pg.query('select * from public.players')).rows.length, 2);
    await assert.rejects(pg.query('update public.rooms set winner_id = $1 where id = $2', [ids[1],room.id]), /permission denied/);
    const winner = (await pg.query('select * from public.buzz($1,1)', [room.id])).rows[0];
    assert.equal(winner.winner_name, 'Bob');
    await assert.rejects(pg.query('select public.reset_round($1,1)', [room.id]), /hôte/);
    await as(ids[0]);
    assert.equal((await pg.query('select * from public.buzz($1,1)', [room.id])).rows[0].winner_name, 'Bob');
    const next = (await pg.query('select * from public.reset_round($1,1)', [room.id])).rows[0];
    assert.equal(next.round, 2); assert.equal(next.winner_id, null);
    assert.equal((await pg.query('select * from public.reset_round($1,1)', [room.id])).rows[0].round, 2);
    await assert.rejects(pg.query('select public.buzz($1,1)', [room.id]), /manche a changé/);
    // Simultaneously submitted calls must retain one authoritative winner.
    const results = await Promise.all(Array.from({length: 12}, () => pg.query('select * from public.buzz($1,2)', [room.id])));
    assert.ok(results.every(r => r.rows[0].winner_id === ids[0] && r.rows[0].revision === 3));
    await as(ids[2]);
    assert.equal((await pg.query('select * from public.rooms')).rows.length, 0);
    assert.equal((await pg.query('select * from public.players')).rows.length, 0);
    await pg.exec('set role anon');
    await assert.rejects(pg.query("select public.create_room('Intrus')"), /permission denied/);
  } finally { await pg.close(); }
});
