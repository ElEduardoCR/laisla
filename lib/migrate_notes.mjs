import pg from 'pg';

const { Client } = pg;

// Never hardcode the database password here: this repository is public.
// Run with: SUPABASE_DB_URL='postgresql://...' node lib/migrate_notes.mjs
function requireConnectionString() {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing SUPABASE_DB_URL (or DATABASE_URL) environment variable.");
    process.exit(1);
  }
  return url;
}

const client = new Client({
  connectionString: requireConnectionString(),
  ssl: { rejectUnauthorized: false },
});

async function migrate_notes() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL');

    await client.query(`
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
    `);
    console.log('✓ Column "notes" added securely');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

migrate_notes();
