import { supabase } from './supabase';
import { Category, Product, Order, OrderItem, DaySession, Expense, DayReport, ProductSale, ExpenseEntry } from '@/types';

// ── Helpers ──

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ── Category mappers ──

function mapCategoryRow(row: Record<string, unknown>): Category {
  return {
    id: row.id as string,
    name: row.name as string,
    order: Number(row.order),
  };
}

// ── Product mappers ──

function mapProductRow(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    categoryId: row.category_id as string,
    name: row.name as string,
    price: Number(row.price),
    description: (row.description as string) || undefined,
    available: row.available as boolean,
  };
}

// ── Order mappers ──

function mapOrderRow(row: Record<string, unknown>, items: OrderItem[]): Order {
  return {
    id: row.id as string,
    customerName: row.customer_name as string,
    takeout: row.takeout as boolean,
    status: row.status as Order['status'],
    paymentMethod: (row.payment_method as Order['paymentMethod']) || undefined,
    amountPaid: row.amount_paid != null ? Number(row.amount_paid) : undefined,
    change: row.change != null ? Number(row.change) : undefined,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) || undefined,
    daySessionId: (row.day_session_id as string) || undefined,
    items,
  };
}

function mapOrderItemRow(row: Record<string, unknown>): OrderItem {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    productId: row.product_id as string,
    productName: row.product_name as string,
    productPrice: Number(row.product_price),
    quantity: Number(row.quantity),
    notes: (row.notes as string) || undefined,
  };
}

// ══════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('order', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapCategoryRow);
}

export async function insertCategory(name: string, order: number): Promise<Category> {
  const id = generateId();
  const { error } = await supabase
    .from('categories')
    .insert({ id, name, order });
  if (error) throw error;
  return { id, name, order };
}

export async function updateCategoryDb(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ name })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCategoryDb(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ══════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapProductRow);
}

export async function insertProduct(product: Omit<Product, 'id'>): Promise<Product> {
  const id = generateId();
  const { error } = await supabase
    .from('products')
    .insert({
      id,
      category_id: product.categoryId,
      name: product.name,
      price: product.price,
      description: product.description || null,
      available: product.available,
    });
  if (error) throw error;
  return { ...product, id };
}

export async function updateProductDb(id: string, data: Partial<Product>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.price !== undefined) update.price = data.price;
  if (data.available !== undefined) update.available = data.available;
  if (data.description !== undefined) update.description = data.description;
  if (data.categoryId !== undefined) update.category_id = data.categoryId;

  const { error } = await supabase
    .from('products')
    .update(update)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProductDb(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ══════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════

export async function fetchOrders(): Promise<Order[]> {
  const { data: orderRows, error: oErr } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: true });
  if (oErr) throw oErr;

  const { data: itemRows, error: iErr } = await supabase
    .from('order_items')
    .select('*');
  if (iErr) throw iErr;

  // Group items by order_id
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const row of itemRows || []) {
    const item = mapOrderItemRow(row);
    const list = itemsByOrder.get(item.orderId) || [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  return (orderRows || []).map(row =>
    mapOrderRow(row, itemsByOrder.get(row.id as string) || [])
  );
}

export async function fetchOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);
  if (error) throw error;
  return (data || []).map(mapOrderItemRow);
}

export async function insertOrder(
  order: Omit<Order, 'items'>,
  items: OrderItem[]
): Promise<void> {
  const { error: oErr } = await supabase
    .from('orders')
    .insert({
      id: order.id,
      customer_name: order.customerName,
      takeout: order.takeout,
      status: order.status,
      created_at: order.createdAt,
      day_session_id: order.daySessionId || null,
    });
  if (oErr) throw oErr;

  if (items.length > 0) {
    const { error: iErr } = await supabase
      .from('order_items')
      .insert(
        items.map(item => ({
          id: item.id,
          order_id: item.orderId,
          product_id: item.productId,
          product_name: item.productName,
          product_price: item.productPrice,
          quantity: item.quantity,
          notes: item.notes || null,
        }))
      );
    if (iErr) throw iErr;
  }
}

export async function updateOrderStatusDb(
  orderId: string,
  status: Order['status']
): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);
  if (error) throw error;
}

export async function completeOrderDb(
  orderId: string,
  paymentMethod: 'cash' | 'terminal',
  amountPaid?: number,
  change?: number
): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'completed',
      payment_method: paymentMethod,
      amount_paid: amountPaid ?? null,
      change: change ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', orderId);
  if (error) throw error;
}

// ══════════════════════════════════════════════
// SYSTEM CONFIG
// ══════════════════════════════════════════════

export async function getConfigValue(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', key)
    .single();
  if (error) return null;
  return data?.value ?? null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('system_config')
    .upsert({ key, value });
  if (error) throw error;
}

// ══════════════════════════════════════════════
// DAY SESSIONS
// ══════════════════════════════════════════════

function mapDaySessionRow(row: Record<string, unknown>): DaySession {
  return {
    id: row.id as string,
    openedAt: row.opened_at as string,
    closedAt: (row.closed_at as string) || undefined,
    initialCash: Number(row.initial_cash),
    totalSales: row.total_sales != null ? Number(row.total_sales) : undefined,
    totalCash: row.total_cash != null ? Number(row.total_cash) : undefined,
    totalTerminal: row.total_terminal != null ? Number(row.total_terminal) : undefined,
    totalExpenses: row.total_expenses != null ? Number(row.total_expenses) : undefined,
    finalCash: row.final_cash != null ? Number(row.final_cash) : undefined,
    status: row.status as DaySession['status'],
  };
}

export async function fetchOpenSession(): Promise<DaySession | null> {
  const { data, error } = await supabase
    .from('day_sessions')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return mapDaySessionRow(data[0]);
}

export async function fetchAllSessions(): Promise<DaySession[]> {
  const { data, error } = await supabase
    .from('day_sessions')
    .select('*')
    .order('opened_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDaySessionRow);
}

export async function openDaySession(initialCash: number): Promise<DaySession> {
  const id = generateId();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('day_sessions')
    .insert({ id, opened_at: now, initial_cash: initialCash, status: 'open' });
  if (error) throw error;
  return { id, openedAt: now, initialCash, status: 'open' };
}

/**
 * Close the day: write a flat snapshot into `day_reports` and then delete
 * all the working-day data (orders, order_items, expenses and the
 * day_session itself). The report has no foreign keys, so it can be
 * edited or deleted directly in the database without breaking anything.
 */
export async function closeDayAndArchive(
  sessionId: string,
  report: DayReport
): Promise<void> {
  // 1) Insert the flat report snapshot
  const { error: rErr } = await supabase.from('day_reports').insert({
    id: report.id,
    opened_at: report.openedAt,
    closed_at: report.closedAt,
    initial_cash: report.initialCash,
    total_sales: report.totalSales,
    total_cash: report.totalCash,
    total_terminal: report.totalTerminal,
    total_expenses: report.totalExpenses,
    final_cash: report.finalCash,
    orders_count: report.ordersCount,
    products: report.products,
    expenses_list: report.expensesList,
  });
  if (rErr) throw rErr;

  // 2) Delete order_items + orders for this session
  const { data: orderRows, error: oErr } = await supabase
    .from('orders')
    .select('id')
    .eq('day_session_id', sessionId);
  if (oErr) throw oErr;
  const orderIds = (orderRows || []).map(r => r.id as string);
  if (orderIds.length > 0) {
    const { error: iDelErr } = await supabase.from('order_items').delete().in('order_id', orderIds);
    if (iDelErr) throw iDelErr;
    const { error: oDelErr } = await supabase.from('orders').delete().in('id', orderIds);
    if (oDelErr) throw oDelErr;
  }

  // 3) Delete expenses of this session
  const { error: eDelErr } = await supabase.from('expenses').delete().eq('day_session_id', sessionId);
  if (eDelErr) throw eDelErr;

  // 4) Delete the day_session itself
  const { error: sDelErr } = await supabase.from('day_sessions').delete().eq('id', sessionId);
  if (sDelErr) throw sDelErr;
}

// ══════════════════════════════════════════════
// EXPENSES
// ══════════════════════════════════════════════

function mapExpenseRow(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    daySessionId: row.day_session_id as string,
    description: row.description as string,
    amount: Number(row.amount),
    createdAt: row.created_at as string,
  };
}

export async function fetchExpenses(sessionId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('day_session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapExpenseRow);
}

export async function insertExpense(sessionId: string, description: string, amount: number): Promise<Expense> {
  const id = generateId();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('expenses')
    .insert({ id, day_session_id: sessionId, description, amount, created_at: now });
  if (error) throw error;
  return { id, daySessionId: sessionId, description, amount, createdAt: now };
}

export async function deleteExpenseDb(id: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ══════════════════════════════════════════════
// DAY REPORTS (flat, no foreign keys)
// ══════════════════════════════════════════════

function mapDayReportRow(row: Record<string, unknown>): DayReport {
  const products = row.products as ProductSale[] | null;
  const expensesList = row.expenses_list as ExpenseEntry[] | null;
  return {
    id: row.id as string,
    openedAt: row.opened_at as string,
    closedAt: row.closed_at as string,
    initialCash: Number(row.initial_cash),
    totalSales: Number(row.total_sales),
    totalCash: Number(row.total_cash),
    totalTerminal: Number(row.total_terminal),
    totalExpenses: Number(row.total_expenses),
    finalCash: Number(row.final_cash),
    ordersCount: Number(row.orders_count),
    products: Array.isArray(products) ? products : [],
    expensesList: Array.isArray(expensesList) ? expensesList : [],
  };
}

export async function fetchReportsByMonth(year: number, month: number): Promise<DayReport[]> {
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();
  const { data, error } = await supabase
    .from('day_reports')
    .select('*')
    .gte('closed_at', startDate)
    .lt('closed_at', endDate)
    .order('closed_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapDayReportRow);
}

// ══════════════════════════════════════════════
// SEED DEFAULT DATA
// ══════════════════════════════════════════════

const defaultCategories: Omit<Category, 'id'>[] = [
  { name: 'Ceviches', order: 1 },
  { name: 'Cocteles', order: 2 },
  { name: 'Tacos', order: 3 },
  { name: 'Tostadas', order: 4 },
  { name: 'Aguachiles', order: 5 },
  { name: 'Bebidas', order: 6 },
];

const defaultProductsByCat: Record<string, { name: string; price: number }[]> = {
  'Ceviches': [
    { name: 'Ceviche de Camarón', price: 120 },
    { name: 'Ceviche de Pescado', price: 100 },
    { name: 'Ceviche Mixto', price: 140 },
  ],
  'Cocteles': [
    { name: 'Coctel de Camarón', price: 130 },
    { name: 'Coctel de Pulpo', price: 150 },
    { name: 'Coctel Mixto', price: 160 },
  ],
  'Tacos': [
    { name: 'Taco de Camarón', price: 35 },
    { name: 'Taco de Pescado', price: 30 },
    { name: 'Taco Gobernador', price: 45 },
  ],
  'Tostadas': [
    { name: 'Tostada de Ceviche', price: 45 },
    { name: 'Tostada de Marlín', price: 40 },
  ],
  'Aguachiles': [
    { name: 'Aguachile Verde', price: 140 },
    { name: 'Aguachile Negro', price: 145 },
    { name: 'Aguachile Rojo', price: 140 },
  ],
  'Bebidas': [
    { name: 'Agua Fresca', price: 30 },
    { name: 'Refresco', price: 25 },
    { name: 'Cerveza', price: 40 },
    { name: 'Michelada', price: 65 },
  ],
};

export async function seedIfEmpty(): Promise<void> {
  const { data } = await supabase.from('categories').select('id').limit(1);
  if (data && data.length > 0) return; // already seeded

  // Insert categories
  const catRows = defaultCategories.map(c => ({
    id: generateId(),
    name: c.name,
    order: c.order,
  }));

  // Small delay between IDs to ensure uniqueness
  for (let i = 1; i < catRows.length; i++) {
    catRows[i].id = generateId() + i;
  }

  const { error: cErr } = await supabase.from('categories').insert(catRows);
  if (cErr) { console.error('Seed categories error:', cErr); return; }

  // Insert products
  const prodRows: Record<string, unknown>[] = [];
  for (const cat of catRows) {
    const products = defaultProductsByCat[cat.name] || [];
    for (const p of products) {
      prodRows.push({
        id: generateId() + prodRows.length,
        category_id: cat.id,
        name: p.name,
        price: p.price,
        available: true,
      });
    }
  }

  const { error: pErr } = await supabase.from('products').insert(prodRows);
  if (pErr) console.error('Seed products error:', pErr);
}

export { generateId };
