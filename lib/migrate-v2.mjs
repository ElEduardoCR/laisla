// Migration v2: day sessions, expenses, system config
// Run with: node lib/migrate-v2.mjs
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

    // New tables
    await client.query(`
      -- System config (password, etc)
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Day sessions (open/close)
      CREATE TABLE IF NOT EXISTS day_sessions (
        id TEXT PRIMARY KEY,
        opened_at TIMESTAMPTZ NOT NULL,
        closed_at TIMESTAMPTZ,
        initial_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_sales NUMERIC(10,2),
        total_cash NUMERIC(10,2),
        total_terminal NUMERIC(10,2),
        total_expenses NUMERIC(10,2),
        final_cash NUMERIC(10,2),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
      );

      -- Expenses per day
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        day_session_id TEXT NOT NULL REFERENCES day_sessions(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_day_sessions_status ON day_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_expenses_session ON expenses(day_session_id);
    `);
    console.log('✓ New tables created');

    // Add day_session_id column to orders if it doesn't exist
    try {
      await client.query(`ALTER TABLE orders ADD COLUMN day_session_id TEXT REFERENCES day_sessions(id)`);
      console.log('✓ Added day_session_id to orders');
    } catch (err) {
      if (err.message?.includes('already exists')) {
        console.log('⊘ day_session_id column already exists on orders');
      } else {
        throw err;
      }
    }

    // Seed default password
    await client.query(`
      INSERT INTO system_config (key, value) VALUES ('admin_password', 'admin')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('✓ Default password seeded');

    // RLS for new tables
    const newTables = ['system_config', 'day_sessions', 'expenses'];
    for (const t of newTables) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      await client.query(`DROP POLICY IF EXISTS "allow_all_${t}" ON ${t}`);
      await client.query(`CREATE POLICY "allow_all_${t}" ON ${t} FOR ALL USING (true) WITH CHECK (true)`);
      console.log(`✓ RLS policy for ${t}`);
    }

    // Realtime for new tables
    for (const t of newTables) {
      try {
        await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE ${t}`);
        console.log(`✓ Realtime enabled for ${t}`);
      } catch (err) {
        if (err.message?.includes('already member')) {
          console.log(`⊘ Realtime already enabled for ${t}`);
        } else {
          throw err;
        }
      }
    }

    console.log('\n✅ Migration v2 complete!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
