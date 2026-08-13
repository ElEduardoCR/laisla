// Migration v4: split & mixed payments (paid_quantity, paid_cash,
// paid_terminal and payment_method = 'mixed').
//
// Run with:
//   SUPABASE_DB_URL='postgresql://...' node lib/migrate-v4.mjs
//
// Or just paste lib/migrate-v4.sql into the Supabase SQL editor.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL (or DATABASE_URL) environment variable.');
  console.error("Usage: SUPABASE_DB_URL='postgresql://...' node lib/migrate-v4.mjs");
  process.exit(1);
}

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'migrate-v4.sql'), 'utf8');

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL');

    await client.query(sql);
    console.log('✓ order_items.paid_quantity');
    console.log('✓ orders.paid_cash / orders.paid_terminal');
    console.log("✓ payment_method now accepts 'mixed'");

    console.log('\n✅ Migration v4 complete!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
