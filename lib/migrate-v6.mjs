// Migration v6: order numbers + items added after the order was placed.
//
// Run with:
//   SUPABASE_DB_URL='postgresql://...' node lib/migrate-v6.mjs
//
// Or just paste lib/migrate-v6.sql into the Supabase SQL editor.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL (or DATABASE_URL) environment variable.');
  console.error("Usage: SUPABASE_DB_URL='postgresql://...' node lib/migrate-v6.mjs");
  process.exit(1);
}

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'migrate-v6.sql'), 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL');

    await client.query(sql);
    console.log('✓ orders.order_number + assign_order_number() trigger');
    console.log('✓ order_items.added_batch');

    console.log('\n✅ Migration v6 complete!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
