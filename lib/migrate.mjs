// One-time migration script — run with: node lib/migrate.mjs
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

    // Run entire migration as one transaction
    await client.query(`
      -- Categories
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Products
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        description TEXT,
        available BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Orders
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        takeout BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
        payment_method TEXT CHECK (payment_method IN ('cash', 'terminal')),
        amount_paid NUMERIC(10,2),
        change NUMERIC(10,2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      );

      -- Order items (normalized)
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_price NUMERIC(10,2) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        notes TEXT
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    `);
    console.log('✓ Tables and indexes created');

    // RLS policies (separate queries to handle "already exists" gracefully)
    const tables = ['categories', 'products', 'orders', 'order_items'];
    for (const t of tables) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      await client.query(`DROP POLICY IF EXISTS "allow_all_${t}" ON ${t}`);
      await client.query(`CREATE POLICY "allow_all_${t}" ON ${t} FOR ALL USING (true) WITH CHECK (true)`);
      console.log(`✓ RLS policy for ${t}`);
    }

    // Realtime
    for (const t of tables) {
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

    console.log('\n✅ Migration complete!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

migrate();
