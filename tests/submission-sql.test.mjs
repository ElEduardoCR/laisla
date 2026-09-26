// Starts a brand-new PostgreSQL cluster on a private Unix socket. No production
// credentials or TCP connections are used, regardless of shell environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const temp = await mkdtemp('/tmp/laisla-pg-test-');
const dataDir = `${temp}/data`;
const config = { host: temp, port: 55479, user: 'outbox_test', database: 'postgres', ssl: false };
let started = false;
let admin;
try {
  execFileSync('initdb', ['-D', dataDir, '-A', 'trust', '--username=outbox_test', '--no-locale', '--encoding=UTF8'], { stdio: 'pipe' });
  execFileSync('pg_ctl', ['-D', dataDir, '-l', `${temp}/server.log`, '-o', `-k ${temp} -h '' -p 55479`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  admin = new pg.Client(config); await admin.connect();
  await admin.query(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.day_sessions(id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'open');
    CREATE TABLE public.orders(
      id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, takeout BOOLEAN NOT NULL,
      status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
      day_session_id TEXT REFERENCES day_sessions(id), paid_cash NUMERIC, paid_terminal NUMERIC
    );
    CREATE TABLE public.order_items(
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL, product_name TEXT NOT NULL, product_price NUMERIC NOT NULL,
      quantity INTEGER NOT NULL, notes TEXT, paid_quantity INTEGER NOT NULL DEFAULT 0
    );
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders, public.order_items, public.day_sessions TO anon, authenticated;
    INSERT INTO day_sessions(id) VALUES ('local-open'), ('local-closed');
    UPDATE day_sessions SET status='closed' WHERE id='local-closed';
  `);
  await admin.query(await readFile(new URL('../lib/migrate-v6.sql', import.meta.url), 'utf8'));
  await admin.query(await readFile(new URL('../supabase/migrations/20260926201822_durable_order_submission.sql', import.meta.url), 'utf8'));
  const payload = id => ({ id, customerName: 'ISOLATED LOCAL TEST', takeout: false, createdAt: new Date().toISOString(), daySessionId: 'local-open', items: [{ id: `${id}-item`, orderId: id, productId: 'local-product', productName: 'ISOLATED FIXTURE', productPrice: 10, quantity: 1 }] });
  const submit = async order => {
    const client = new pg.Client(config); await client.connect();
    try {
      await client.query('SET ROLE anon');
      return (await client.query('SELECT public.submit_order_once($1::jsonb) AS receipt', [order])).rows[0].receipt;
    } finally { await client.end(); }
  };

  await test('atomic RPC rolls back header, items and receipt on invalid item', async () => {
    const o = payload('invalid'); o.items.push({ ...o.items[0], quantity: 0 });
    await assert.rejects(submit(o), { code: 'PT422' });
    for (const table of ['orders','order_items','order_submission_receipts']) {
      assert.equal((await admin.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n, 0);
    }
  });
  await test('concurrent anonymous replays produce one order and one item', async () => {
    const o = payload('parallel');
    const receipts = await Promise.all([submit(o),submit(o),submit(o)]);
    assert.ok(receipts.every(r => r.order_number === receipts[0].order_number));
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM orders WHERE id='parallel'")).rows[0].n,1);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM order_items WHERE order_id='parallel'")).rows[0].n,1);
    await admin.query("UPDATE orders SET status='completed', paid_cash=10 WHERE id='parallel'; DELETE FROM order_items WHERE order_id='parallel'");
    await submit(o);
    assert.deepEqual((await admin.query("SELECT status,paid_cash::int FROM orders WHERE id='parallel'")).rows[0], { status:'completed',paid_cash:10 });
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM order_items WHERE order_id='parallel'")).rows[0].n,0);
    await admin.query("DELETE FROM orders WHERE id='parallel'");
    await submit(o);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM orders WHERE id='parallel'")).rows[0].n,0);
  });
  await test('receipt replay succeeds after original day is deleted, without resurrection', async () => {
    await admin.query("INSERT INTO day_sessions(id) VALUES ('local-delete')");
    const o = { ...payload('deleted-day'), daySessionId:'local-delete' };
    const receipt = await submit(o);
    await admin.query("DELETE FROM orders WHERE id='deleted-day'; DELETE FROM day_sessions WHERE id='local-delete'");
    assert.deepEqual(await submit(o),receipt);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM orders WHERE id='deleted-day'")).rows[0].n,0);
  });
  await test('unsent order for a closed or missing original day is rejected', async () => {
    for (const day of ['local-closed','nonexistent']) await assert.rejects(submit({ ...payload(`closed-${day}`), daySessionId:day }), { code:'PT410' });
  });
  await test('same ID with different payload cannot overwrite previous order', async () => {
    const o = payload('conflict'); await submit(o);
    await assert.rejects(submit({ ...o, customerName:'changed' }), { code:'PT409' });
  });
  await test('unreceipted legacy order is never patched or supplied missing items by a retry', async () => {
    const o = payload('legacy');
    await admin.query("INSERT INTO orders(id,customer_name,takeout,status,created_at,day_session_id) VALUES ('legacy','LOCAL',false,'ready',now(),'local-open')");
    await assert.rejects(submit(o), { code:'PT409' });
    assert.equal((await admin.query("SELECT status FROM orders WHERE id='legacy'")).rows[0].status,'ready');
  });
  await test('POS roles cannot update/delete durable server receipts', async () => {
    const r = (await admin.query("SELECT has_table_privilege('anon','public.order_submission_receipts','UPDATE') AS upd, has_table_privilege('anon','public.order_submission_receipts','DELETE') AS del")).rows[0];
    assert.deepEqual(r,{upd:false,del:false});
  });
} finally {
  await admin?.end();
  if (started) execFileSync('pg_ctl', ['-D',dataDir,'-m','fast','-w','stop'], { stdio:'pipe' });
  await rm(temp,{recursive:true,force:true});
}
