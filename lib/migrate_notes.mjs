import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.uorcbakgjcvlbcnvcwok:MYMalk4pon3@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
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
