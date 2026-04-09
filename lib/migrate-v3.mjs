// Migration v3: flat day_reports table (no foreign keys)
// Run with: node lib/migrate-v3.mjs
import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.uorcbakgjcvlbcnvcwok:MYMalk4pon3@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL');

    // Flat day reports table — all info in a single row, no FKs.
    // Products and expenses live inline as JSONB so the row can be
    // deleted or edited directly without touching other tables.
    await client.query(`
      CREATE TABLE IF NOT EXISTS day_reports (
        id TEXT PRIMARY KEY,
        opened_at TIMESTAMPTZ NOT NULL,
        closed_at TIMESTAMPTZ NOT NULL,
        initial_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_terminal NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_expenses NUMERIC(10,2) NOT NULL DEFAULT 0,
        final_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
        orders_count INTEGER NOT NULL DEFAULT 0,
        products JSONB NOT NULL DEFAULT '[]'::jsonb,
        expenses_list JSONB NOT NULL DEFAULT '[]'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_day_reports_closed_at ON day_reports(closed_at);
    `);
    console.log('✓ day_reports table created');

    // RLS
    await client.query(`ALTER TABLE day_reports ENABLE ROW LEVEL SECURITY`);
    await client.query(`DROP POLICY IF EXISTS "allow_all_day_reports" ON day_reports`);
    await client.query(`CREATE POLICY "allow_all_day_reports" ON day_reports FOR ALL USING (true) WITH CHECK (true)`);
    console.log('✓ RLS policy for day_reports');

    // Realtime
    try {
      await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE day_reports`);
      console.log('✓ Realtime enabled for day_reports');
    } catch (err) {
      if (err.message?.includes('already member')) {
        console.log('⊘ Realtime already enabled for day_reports');
      } else {
        throw err;
      }
    }

    console.log('\n✅ Migration v3 complete!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
