'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Category, Product, CartItem, Order, OrderItem, DaySession, Expense, DayReport, ProductSale, ExpenseEntry } from '@/types';
import { supabase } from '@/lib/supabase';
import {
  fetchCategories, fetchProducts, fetchOrders, fetchOrderItems,
  insertCategory, updateCategoryDb, deleteCategoryDb,
  insertProduct, updateProductDb, deleteProductDb,
  insertOrder, updateOrderStatusDb, appendOrderItemsDb,
  updateOrderItemQuantityDb, deleteOrderItemDb,
  chargeOrderItemsDb, fetchOrderById,
  seedIfEmpty, generateId,
  fetchOpenSession, openDaySession, closeDayAndArchive,
  fetchExpenses, insertExpense, deleteExpenseDb,
} from '@/lib/database';
import { computeSessionTotals, computeProductSales, orderPaid } from '@/lib/reporting';

interface AppContextType {
  // Menu
  categories: Category[];
  products: Product[];
  addCategory: (name: string) => void;
  updateCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  // Cart (local only)
  cart: CartItem[];
  customerName: string;
  setCustomerName: (name: string) => void;
  takeout: boolean;
  setTakeout: (val: boolean) => void;
  addToCart: (product: Product) => void;
  removeFromCart: (cartItemId: string) => void;
  updateCartQuantity: (cartItemId: string, quantity: number) => void;
  updateCartItemNotes: (cartItemId: string, notes: string) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;

  // Orders
  orders: Order[];
  placeOrder: () => Promise<boolean>;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  appendItemsToOrder: (orderId: string, items: CartItem[]) => Promise<boolean>;
  decreaseOrderItemQuantity: (orderId: string, itemId: string, by?: number) => Promise<boolean>;
  removeOrderItem: (orderId: string, itemId: string) => Promise<boolean>;
  chargeOrderItems: (
    orderId: string,
    selections: { itemId: string; quantity: number }[],
    payment: { cashApplied: number; terminalApplied: number }
  ) => Promise<boolean>;
  pendingOrdersCount: number;

  // Day session
  activeSession: DaySession | null;
  isDayOpen: boolean;
  openDay: (initialCash: number) => Promise<void>;
  closeDay: () => Promise<{ totalSales: number; totalCash: number; totalTerminal: number; totalExpenses: number; finalCash: number } | null>;

  // Expenses
  expenses: Expense[];
  addExpense: (description: string, amount: number) => Promise<void>;
  removeExpense: (id: string) => void;

  // Loading
  loaded: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [takeout, setTakeout] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeSession, setActiveSession] = useState<DaySession | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const localIds = useRef(new Set<string>());

  // ── Initial data load ──
  useEffect(() => {
    async function init() {
      try {
        await seedIfEmpty();
        const [cats, prods, ords, session] = await Promise.all([
          fetchCategories(),
          fetchProducts(),
          fetchOrders(),
          fetchOpenSession(),
        ]);
        setCategories(cats);
        setProducts(prods);
        setOrders(ords);
        if (session) {
          setActiveSession(session);
          const exps = await fetchExpenses(session.id);
          setExpenses(exps);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoaded(true);
      }
    }
    init();
  }, []);

  // ── Realtime subscriptions ──
  useEffect(() => {
    const channel = supabase
      .channel('pos-realtime')
      // Categories
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories' }, (payload) => {
        const row = payload.new;
        if (localIds.current.has(row.id)) { localIds.current.delete(row.id); return; }
        setCategories(prev => {
          if (prev.some(c => c.id === row.id)) return prev;
          return [...prev, { id: row.id, name: row.name, order: Number(row.order) }];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'categories' }, (payload) => {
        const row = payload.new;
        setCategories(prev => prev.map(c => c.id === row.id ? { ...c, name: row.name, order: Number(row.order) } : c));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'categories' }, (payload) => {
        setCategories(prev => prev.filter(c => c.id !== payload.old.id));
      })
      // Products
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'products' }, (payload) => {
        const row = payload.new;
        if (localIds.current.has(row.id)) { localIds.current.delete(row.id); return; }
        setProducts(prev => {
          if (prev.some(p => p.id === row.id)) return prev;
          return [...prev, {
            id: row.id, categoryId: row.category_id, name: row.name,
            price: Number(row.price), description: row.description || undefined, available: row.available,
          }];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, (payload) => {
        const row = payload.new;
        setProducts(prev => prev.map(p => p.id === row.id ? {
          ...p, name: row.name, price: Number(row.price), available: row.available,
          description: row.description || undefined, categoryId: row.category_id,
        } : p));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'products' }, (payload) => {
        setProducts(prev => prev.filter(p => p.id !== payload.old.id));
      })
      // Orders
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const row = payload.new;
        if (localIds.current.has(row.id)) { localIds.current.delete(row.id); return; }
        setOrders(prev => {
          if (prev.some(o => o.id === row.id)) return prev;
          return [...prev, {
            id: row.id, customerName: row.customer_name, takeout: row.takeout,
            status: row.status, createdAt: row.created_at, items: [],
            paymentMethod: row.payment_method || undefined,
            amountPaid: row.amount_paid != null ? Number(row.amount_paid) : undefined,
            change: row.change != null ? Number(row.change) : undefined,
            completedAt: row.completed_at || undefined,
            daySessionId: row.day_session_id || undefined,
          }];
        });
        fetchOrderItems(row.id).then(items => {
          setOrders(prev => prev.map(o => o.id === row.id ? { ...o, items } : o));
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const row = payload.new;
        setOrders(prev => prev.map(o => o.id === row.id ? {
          ...o,
          status: row.status,
          paymentMethod: row.payment_method || undefined,
          amountPaid: row.amount_paid != null ? Number(row.amount_paid) : undefined,
          change: row.change != null ? Number(row.change) : undefined,
          paidCash: row.paid_cash != null ? Number(row.paid_cash) : undefined,
          paidTerminal: row.paid_terminal != null ? Number(row.paid_terminal) : undefined,
          completedAt: row.completed_at || undefined,
        } : o));
      })
      // Order items
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, (payload) => {
        const row = payload.new;
        if (localIds.current.has(row.id)) { localIds.current.delete(row.id); return; }
        const item: OrderItem = {
          id: row.id, orderId: row.order_id, productId: row.product_id,
          productName: row.product_name, productPrice: Number(row.product_price),
          quantity: Number(row.quantity), notes: row.notes || undefined,
          paidQuantity: row.paid_quantity != null ? Number(row.paid_quantity) : 0,
        };
        setOrders(prev => prev.map(o => {
          if (o.id !== item.orderId) return o;
          if (o.items.some(i => i.id === item.id)) return o;
          return { ...o, items: [...o.items, item] };
        }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_items' }, (payload) => {
        const row = payload.new;
        setOrders(prev => prev.map(o => ({
          ...o,
          items: o.items.map(i =>
            i.id === row.id
              ? {
                  ...i,
                  quantity: Number(row.quantity),
                  notes: row.notes || undefined,
                  paidQuantity: row.paid_quantity != null ? Number(row.paid_quantity) : i.paidQuantity ?? 0,
                }
              : i
          ),
        })));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'order_items' }, (payload) => {
        const id = payload.old.id as string;
        setOrders(prev => prev.map(o => ({
          ...o,
          items: o.items.filter(i => i.id !== id),
        })));
      })
      // Day sessions
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'day_sessions' }, (payload) => {
        const row = payload.new;
        if (localIds.current.has(row.id)) { localIds.current.delete(row.id); return; }
        if (row.status === 'open') {
          setActiveSession({
            id: row.id, openedAt: row.opened_at, initialCash: Number(row.initial_cash), status: 'open',
          });
          setExpenses([]);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'day_sessions' }, (payload) => {
        // Day closed → session row deleted. Clear everything locally.
        setActiveSession(prev => prev?.id === payload.old.id ? null : prev);
        setExpenses([]);
        setOrders([]);
      })
      // Orders deletion (fires on day close for other devices)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
        setOrders(prev => prev.filter(o => o.id !== payload.old.id));
      })
      // Expenses
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses' }, (payload) => {
        const row = payload.new;
        if (localIds.current.has(row.id)) { localIds.current.delete(row.id); return; }
        setExpenses(prev => {
          if (prev.some(e => e.id === row.id)) return prev;
          return [...prev, {
            id: row.id, daySessionId: row.day_session_id,
            description: row.description, amount: Number(row.amount), createdAt: row.created_at,
          }];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'expenses' }, (payload) => {
        setExpenses(prev => prev.filter(e => e.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ══════════════════════════════════════════════
  // CATEGORIES CRUD
  // ══════════════════════════════════════════════

  const addCategory = useCallback((name: string) => {
    const tempId = generateId();
    localIds.current.add(tempId);
    setCategories(prev => [...prev, { id: tempId, name, order: prev.length + 1 }]);
    insertCategory(name, categories.length + 1).then(cat => {
      if (cat.id !== tempId) {
        setCategories(prev => prev.map(c => c.id === tempId ? { ...c, id: cat.id } : c));
      }
    }).catch(err => console.error('addCategory error:', err));
  }, [categories.length]);

  const updateCategoryFn = useCallback((id: string, name: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    updateCategoryDb(id, name).catch(err => console.error('updateCategory error:', err));
  }, []);

  const deleteCategoryFn = useCallback((id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    setProducts(prev => prev.filter(p => p.categoryId !== id));
    deleteCategoryDb(id).catch(err => console.error('deleteCategory error:', err));
  }, []);

  // ══════════════════════════════════════════════
  // PRODUCTS CRUD
  // ══════════════════════════════════════════════

  const addProductFn = useCallback((product: Omit<Product, 'id'>) => {
    const tempId = generateId();
    localIds.current.add(tempId);
    setProducts(prev => [...prev, { ...product, id: tempId }]);
    insertProduct(product).then(p => {
      if (p.id !== tempId) {
        setProducts(prev => prev.map(pr => pr.id === tempId ? { ...pr, id: p.id } : pr));
      }
    }).catch(err => console.error('addProduct error:', err));
  }, []);

  const updateProductFn = useCallback((id: string, data: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    updateProductDb(id, data).catch(err => console.error('updateProduct error:', err));
  }, []);

  const deleteProductFn = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    deleteProductDb(id).catch(err => console.error('deleteProduct error:', err));
  }, []);

  // ══════════════════════════════════════════════
  // CART (local only)
  // ══════════════════════════════════════════════

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id && !item.notes);
      if (existing) {
        return prev.map(item =>
          item.id === existing.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { id: generateId(), product, quantity: 1, notes: '' }];
    });
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCart(prev => prev.filter(item => item.id !== cartItemId));
  }, []);

  const updateCartQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.id !== cartItemId));
      return;
    }
    setCart(prev => prev.map(item =>
      item.id === cartItemId ? { ...item, quantity } : item
    ));
  }, []);

  const updateCartItemNotes = useCallback((cartItemId: string, notes: string) => {
    setCart(prev => prev.map(item =>
      item.id === cartItemId ? { ...item, notes } : item
    ));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerName('');
    setTakeout(false);
  }, []);

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // ══════════════════════════════════════════════
  // ORDERS
  // ══════════════════════════════════════════════

  const placeOrder = useCallback(async () => {
    if (!customerName.trim() || cart.length === 0) return false;

    const orderId = generateId();
    const now = new Date().toISOString();

    const orderItems: OrderItem[] = cart.map((item, i) => ({
      id: generateId() + i,
      orderId,
      productId: item.product.id,
      productName: item.product.name,
      productPrice: item.product.price,
      quantity: item.quantity,
      notes: item.notes || undefined,
    }));

    const newOrder: Order = {
      id: orderId,
      customerName: customerName.trim(),
      items: orderItems,
      takeout,
      status: 'preparing',
      createdAt: now,
      daySessionId: activeSession?.id,
    };

    localIds.current.add(orderId);
    orderItems.forEach(item => localIds.current.add(item.id));

    setOrders(prev => [...prev, newOrder]);
    setCart([]);
    setCustomerName('');
    setTakeout(false);

    try {
      await insertOrder(
        { id: orderId, customerName: newOrder.customerName, takeout, status: 'preparing', createdAt: now, daySessionId: activeSession?.id },
        orderItems
      );
    } catch (err) {
      console.error('placeOrder error:', err);
    }

    return true;
  }, [customerName, cart, takeout, activeSession]);

  const updateOrderStatusFn = useCallback((orderId: string, status: Order['status']) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    updateOrderStatusDb(orderId, status).catch(err => console.error('updateOrderStatus error:', err));
  }, []);

  const appendItemsToOrderFn = useCallback(async (orderId: string, items: CartItem[]) => {
    if (items.length === 0) return false;
    const target = orders.find(o => o.id === orderId);
    if (!target) return false;
    if (target.status !== 'preparing' && target.status !== 'pending' && target.status !== 'ready') return false;

    const newItems: OrderItem[] = items.map((item, i) => ({
      id: generateId() + i,
      orderId,
      productId: item.product.id,
      productName: item.product.name,
      productPrice: item.product.price,
      quantity: item.quantity,
      notes: item.notes || undefined,
    }));

    newItems.forEach(item => localIds.current.add(item.id));

    // New food means the kitchen has to cook again, so an order that was
    // already "Listo" goes back to "Preparando" instead of sitting in the
    // ready tab where nobody would notice the extra items.
    const backToPreparing = target.status !== 'preparing';

    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? {
            ...o,
            items: [...o.items, ...newItems],
            ...(backToPreparing ? { status: 'preparing' as const } : {}),
          }
        : o
    ));

    try {
      await appendOrderItemsDb(newItems);
    } catch (err) {
      console.error('appendItemsToOrder error:', err);
      // Don't leave phantom items on screen that never reached the database.
      const newIds = new Set(newItems.map(i => i.id));
      setOrders(prev => prev.map(o =>
        o.id === orderId
          ? {
              ...o,
              items: o.items.filter(i => !newIds.has(i.id)),
              ...(backToPreparing ? { status: target.status } : {}),
            }
          : o
      ));
      return false;
    }

    if (backToPreparing) {
      try {
        await updateOrderStatusDb(orderId, 'preparing');
      } catch (err) {
        console.error('appendItemsToOrder (status) error:', err);
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: target.status } : o));
        return false;
      }
    }

    return true;
  }, [orders]);

  /** Replace an order with whatever the database actually holds. */
  const resyncOrder = useCallback(async (orderId: string) => {
    try {
      const fresh = await fetchOrderById(orderId);
      if (fresh) setOrders(prev => prev.map(o => o.id === orderId ? fresh : o));
    } catch (err) {
      console.error('resyncOrder error:', err);
    }
  }, []);

  /**
   * After taking lines off an order, whatever is left may already be paid for.
   * A zero charge asks the database to re-check and close the order if so —
   * otherwise it would sit in the kitchen forever with nothing left to cobrar.
   */
  const settleIfFullyPaid = useCallback(async (orderId: string, items: OrderItem[], paidMoney: number) => {
    const allPaid = items.length > 0 && items.every(i => (i.paidQuantity ?? 0) >= i.quantity);
    if (!allPaid || paidMoney <= 0) return;
    try {
      await chargeOrderItemsDb(orderId, [], { cashApplied: 0, terminalApplied: 0 });
      await resyncOrder(orderId);
    } catch (err) {
      console.error('settleIfFullyPaid error:', err);
    }
  }, [resyncOrder]);

  const decreaseOrderItemQuantityFn = useCallback(async (orderId: string, itemId: string, by: number = 1) => {
    const target = orders.find(o => o.id === orderId);
    if (!target) return false;
    if (target.status !== 'preparing' && target.status !== 'pending' && target.status !== 'ready') return false;

    const item = target.items.find(i => i.id === itemId);
    if (!item) return false;

    const newQty = item.quantity - by;
    const alreadyPaid = item.paidQuantity ?? 0;

    // Units that were already charged can't be taken off the order: the money
    // is in the drawer, and dropping below paid_quantity used to make the order
    // count as fully settled on its own, without anybody paying the rest.
    if (newQty < alreadyPaid) return false;

    if (newQty <= 0) {
      setOrders(prev => prev.map(o =>
        o.id === orderId
          ? { ...o, items: o.items.filter(i => i.id !== itemId) }
          : o
      ));
      try {
        await deleteOrderItemDb(itemId);
      } catch (err) {
        console.error('decreaseOrderItemQuantity (delete) error:', err);
        await resyncOrder(orderId);
        return false;
      }
    } else {
      setOrders(prev => prev.map(o =>
        o.id === orderId
          ? { ...o, items: o.items.map(i => i.id === itemId ? { ...i, quantity: newQty } : i) }
          : o
      ));
      try {
        await updateOrderItemQuantityDb(itemId, newQty);
      } catch (err) {
        console.error('decreaseOrderItemQuantity error:', err);
        await resyncOrder(orderId);
        return false;
      }
    }

    const remainingItems = newQty <= 0
      ? target.items.filter(i => i.id !== itemId)
      : target.items.map(i => i.id === itemId ? { ...i, quantity: newQty } : i);
    await settleIfFullyPaid(orderId, remainingItems, orderPaid(target));

    return true;
  }, [orders, settleIfFullyPaid, resyncOrder]);

  const removeOrderItemFn = useCallback(async (orderId: string, itemId: string) => {
    const target = orders.find(o => o.id === orderId);
    if (!target) return false;
    if (target.status !== 'preparing' && target.status !== 'pending' && target.status !== 'ready') return false;

    const item = target.items.find(i => i.id === itemId);
    if (!item) return false;
    // Same rule as above: a line with paid units stays on the bill.
    if ((item.paidQuantity ?? 0) > 0) return false;

    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, items: o.items.filter(i => i.id !== itemId) }
        : o
    ));

    try {
      await deleteOrderItemDb(itemId);
    } catch (err) {
      console.error('removeOrderItem error:', err);
      await resyncOrder(orderId);
      return false;
    }

    await settleIfFullyPaid(orderId, target.items.filter(i => i.id !== itemId), orderPaid(target));

    return true;
  }, [orders, settleIfFullyPaid, resyncOrder]);

  const chargeOrderItemsFn = useCallback(async (
    orderId: string,
    selections: { itemId: string; quantity: number }[],
    payment: { cashApplied: number; terminalApplied: number }
  ) => {
    const target = orders.find(o => o.id === orderId);
    if (!target) return false;
    if (target.status === 'completed') return false;

    const cleaned = selections.filter(s => s.quantity > 0);
    if (cleaned.length === 0 && payment.cashApplied === 0 && payment.terminalApplied === 0) {
      return false;
    }

    // The whole charge — paid units, cash, card and closing the order — is one
    // transaction on the database. Nothing is applied locally until it lands,
    // so the screen can never show a charge the database refused.
    try {
      await chargeOrderItemsDb(orderId, cleaned, payment);
    } catch (err) {
      console.error('chargeOrderItems error:', err);
      return false;
    }

    // Read back what was actually stored: the amounts were added server-side,
    // so this is the only source of truth after a concurrent charge.
    await resyncOrder(orderId);

    return true;
  }, [orders, resyncOrder]);

  const pendingOrdersCount = orders.filter(o => o.status === 'preparing').length;

  // ══════════════════════════════════════════════
  // DAY SESSION
  // ══════════════════════════════════════════════

  const isDayOpen = activeSession !== null;

  const openDay = useCallback(async (initialCash: number) => {
    const id = generateId();
    localIds.current.add(id);
    const session: DaySession = {
      id,
      openedAt: new Date().toISOString(),
      initialCash,
      status: 'open',
    };
    setActiveSession(session);
    setExpenses([]);
    try {
      await openDaySession(initialCash);
    } catch (err) {
      console.error('openDay error:', err);
    }
  }, []);

  const closeDay = useCallback(async () => {
    if (!activeSession) return null;

    // Every order of the session counts, not just the closed ones: a bill that
    // was half paid still put money in the drawer, and all of them are deleted
    // below. See lib/reporting.ts for how partial charges are counted.
    const sessionOrders = orders.filter(o => o.daySessionId === activeSession.id);
    const totals = computeSessionTotals(sessionOrders, expenses, activeSession.initialCash);
    const { totalSales, totalCash, totalTerminal, totalExpenses: totalExp, finalCash } = totals;

    const products: ProductSale[] = computeProductSales(sessionOrders);
    const ordersCount = sessionOrders.filter(o => orderPaid(o) > 0).length;

    const expensesList: ExpenseEntry[] = expenses.map(e => ({ description: e.description, amount: e.amount }));

    const report: DayReport = {
      id: generateId(),
      openedAt: activeSession.openedAt,
      closedAt: new Date().toISOString(),
      initialCash: activeSession.initialCash,
      totalSales,
      totalCash,
      totalTerminal,
      totalExpenses: totalExp,
      finalCash,
      ordersCount,
      products,
      expensesList,
    };

    try {
      // Inserta el reporte plano y borra orders/items/expenses/session.
      await closeDayAndArchive(activeSession.id, report);
      setOrders([]);
      setActiveSession(null);
      setExpenses([]);
    } catch (err) {
      console.error('closeDay error:', err);
      // The day is still open: don't hand back a corte that was never saved.
      return null;
    }

    return totals;
  }, [activeSession, orders, expenses]);

  // ══════════════════════════════════════════════
  // EXPENSES
  // ══════════════════════════════════════════════

  const addExpenseFn = useCallback(async (description: string, amount: number) => {
    if (!activeSession) return;
    const id = generateId();
    localIds.current.add(id);
    const exp: Expense = { id, daySessionId: activeSession.id, description, amount, createdAt: new Date().toISOString() };
    setExpenses(prev => [...prev, exp]);
    try {
      await insertExpense(activeSession.id, description, amount);
    } catch (err) {
      console.error('addExpense error:', err);
    }
  }, [activeSession]);

  const removeExpenseFn = useCallback((id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    deleteExpenseDb(id).catch(err => console.error('removeExpense error:', err));
  }, []);

  return (
    <AppContext.Provider
      value={{
        categories, products,
        addCategory, updateCategory: updateCategoryFn, deleteCategory: deleteCategoryFn,
        addProduct: addProductFn, updateProduct: updateProductFn, deleteProduct: deleteProductFn,
        cart, customerName, setCustomerName, takeout, setTakeout,
        addToCart, removeFromCart, updateCartQuantity, updateCartItemNotes, clearCart,
        cartTotal, cartCount,
        orders, placeOrder, updateOrderStatus: updateOrderStatusFn,
        appendItemsToOrder: appendItemsToOrderFn,
        decreaseOrderItemQuantity: decreaseOrderItemQuantityFn,
        removeOrderItem: removeOrderItemFn,
        chargeOrderItems: chargeOrderItemsFn,
        pendingOrdersCount,
        activeSession, isDayOpen, openDay, closeDay,
        expenses, addExpense: addExpenseFn, removeExpense: removeExpenseFn,
        loaded,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
