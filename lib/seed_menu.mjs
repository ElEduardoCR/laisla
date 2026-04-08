import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.uorcbakgjcvlbcnvcwok:MYMalk4pon3@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
});

const menuData = [
  {
    name: 'Tostadas',
    order: 1,
    products: [
      { name: 'PULPO', price: 75.00 },
      { name: 'CAMARÓN', price: 70.00 },
      { name: 'CEVICHE DE PESCADO', price: 45.00 },
      { name: 'CEVICHE DE CAMARÓN', price: 70.00 },
      { name: 'MIXTA', price: 60.00 },
      { name: 'AGUACHILE', price: 85.00 },
      { name: 'PULPO/CAMARÓN', price: 75.00 },
      { name: 'MEDALLON DE ATUN', price: 75.00 },
    ],
  },
  {
    name: 'Aguachiles',
    order: 2,
    products: [
      { name: 'VERDE Ó ROJO', price: 235.00 },
      { name: 'LA ISLA', price: 280.00 },
    ],
  },
  {
    name: 'Tosticeviches',
    order: 3,
    products: [
      { name: 'SENCILLO', price: 105.00 },
      { name: 'DOBLE', price: 190.00 },
      { name: 'LA ISLA', price: 225.00 },
      { name: 'TOSTIAGUACHILE', price: 235.00 },
    ],
  },
  {
    name: 'Torres',
    order: 4,
    products: [
      { name: 'TORRE LA ISLA', price: 250.00 },
      { name: 'TORRE DE MARISCOS', price: 290.00 },
    ],
  },
  {
    name: 'Ceviches',
    order: 5,
    products: [
      { name: '1/2 LTO PESCADO', price: 110.00 },
      { name: '1/2 LTO CAMARÓN', price: 155.00 },
      { name: '1/2 MIXTO', price: 135.00 },
      { name: 'LITRO DE PESCADO', price: 200.00 },
      { name: 'LITRO DE CAMARÓN', price: 290.00 },
      { name: 'LITRO MIXTO', price: 250.00 },
    ],
  },
  {
    name: 'Cócteles',
    order: 6,
    products: [
      { name: 'SENCILLO', price: 210.00 },
      { name: 'VUELVE A LA VIDA', price: 260.00 },
    ],
  },
  {
    name: 'Botanas',
    order: 7,
    products: [
      { name: 'PAPACARNE', price: 85.00 },
      { name: 'TOSTICARNE', price: 85.00 },
    ],
  },
  {
    name: 'Bebidas',
    order: 8,
    products: [
      { name: 'CLAMATO SENCILLO', price: 80.00 },
      { name: 'CLAMATO LA ISLA', price: 190.00 },
      { name: 'AGUA MINERAL PREP.', price: 45.00 },
      { name: 'TORONJA PREPARADA', price: 45.00 },
      { name: 'REFRESCO', price: 30.00 },
      { name: 'BOTELLA DE AGUA', price: 10.00 },
    ],
  },
  {
    name: 'Extras',
    order: 9,
    products: [
      { name: 'PULPO', price: 50.00 },
      { name: 'CAMARÓN', price: 45.00 },
      { name: 'CALLO DE ALMEJA', price: 40.00 },
      { name: 'CARNE SECA', price: 40.00 },
      { name: 'TOSTITOS', price: 25.00 },
      { name: 'BARQUILLOS', price: 25.00 },
    ],
  },
];

async function seed() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL');

    // Remove existing products and categories
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM categories');
    console.log('Cleared existing products and categories');

    for (const cat of menuData) {
      const catId = crypto.randomUUID();
      await client.query(
        'INSERT INTO categories (id, name, "order") VALUES ($1, $2, $3)',
        [catId, cat.name, cat.order]
      );
      
      console.log(`Added category: ${cat.name}`);

      for (const prod of cat.products) {
        const prodId = crypto.randomUUID();
        await client.query(
          'INSERT INTO products (id, category_id, name, price) VALUES ($1, $2, $3, $4)',
          [prodId, catId, prod.name, prod.price]
        );
      }
      console.log(`  Added ${cat.products.length} products to ${cat.name}`);
    }

    console.log('\\n✅ Seeding complete!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

seed();
