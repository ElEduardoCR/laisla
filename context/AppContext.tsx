'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Category, Product, CartItem, Order, OrderItem, DaySession, Expense, DayReport, ProductSale, ExpenseEntry } from '@/types';
import { supabase } from '@/lib/supabase';
import {
  fetchCategories, fetchProducts, fetchOrders,
  insertCategory, updateCategoryDb, deleteCategoryDb,
  insertProduct, updateProductDb, deleteProductDb,
  submitOrderOnce, updateOrderStatusDb, appendOrderItemsDb,
  updateOrderItemQuantityDb, deleteOrderItemDb,
  chargeOrderItemsDb,
  generateId,
  fetchOpenSession, openDaySession, closeDayAndArchive,
  fetchExpenses, insertExpense, deleteExpenseDb,
} from '@/lib/database';
import { createRefreshCoordinator } from '@/lib/refresh-coordinator';
import { enqueueOrder, readOutbox, createOutboxWorker, RETRY_MS, type PendingOrder, type SubmissionReceipt } from '@/lib/order-outbox';
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
  placeOrder: () => Promise<{ ok: boolean; queuedId?: string; error?: string }>;
  pendingSubmissions: PendingOrder[];
  submissionReceipts: SubmissionReceipt[];
  connectionError: string | null;
  queueError: string | null;
  lastSyncedAt: number | null;
  retrySync: () => void;
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


  const [pendingSubmissions, setPendingSubmissions] = useState<PendingOrder[]>([]);
  const [submissionReceipts, setSubmissionReceipts] = useState<SubmissionReceipt[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const placing = useRef(false);
  const coordinator = useRef<ReturnType<typeof createRefreshCoordinator> | null>(null);
  const wakeSync = useRef<() => void>(() => {});
  const runWrite = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    return coordinator.current ? coordinator.current.write(work) : work();
  }, []);
  const retrySync = useCallback(() => wakeSync.current(), []);

  useEffect(() => {
    let stopped = false;
    let menuDirty = true;
    const sync = createRefreshCoordinator({
      read: async () => {
        const [ords, session, cats, prods] = await Promise.all([
          fetchOrders(), fetchOpenSession(),
          menuDirty ? fetchCategories() : Promise.resolve(null),
          menuDirty ? fetchProducts() : Promise.resolve(null),
        ]);
        const exps = session ? await fetchExpenses(session.id) : [];
        return { ords, session, cats, prods, exps };
      },
      apply: ({ ords, session, cats, prods, exps }) => {
        setOrders(ords);
        setActiveSession(session);
        setExpenses(exps);
        if (cats && prods) { setCategories(cats); setProducts(prods); menuDirty = false; }
        setConnectionError(null);
        setLastSyncedAt(Date.now());
        setLoaded(true);
      },
      error: () => {
        setConnectionError('Sin actualización del servidor. Se conservan los datos visibles y se volverá a intentar.');
        setLoaded(true);
      },
    });
    coordinator.current = sync;

    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('laisla-outbox') : null;
    // These reads are serialized too, so an old IDB result cannot restore a
    // pending badge after the receipt was committed by another tab.
    let queueRead: Promise<void> | null = null;
    let queueReadAgain = false;
    const refreshQueue = (): Promise<void> => {
      queueReadAgain = true;
      if (queueRead) return queueRead;
      queueRead = (async () => {
        while (queueReadAgain && !stopped) {
          queueReadAgain = false;
          try {
            const { pending, receipts } = await readOutbox();
            if (!stopped) { setPendingSubmissions(pending); setSubmissionReceipts(receipts); setQueueError(null); }
          } catch {
            if (!stopped) setQueueError('No se puede acceder a los pedidos guardados en este dispositivo. No borres los datos del navegador.');
          }
        }
      })().finally(() => { queueRead = null; });
      return queueRead;
    };
    const changed = () => {
      if (stopped) return;
      void refreshQueue();
      channel?.postMessage('changed');
      void sync.invalidate();
    };
    const flush = createOutboxWorker({
      send: order => sync.write(() => submitOrderOnce(order)),
      changed,
      online: () => !stopped && navigator.onLine,
    });
    const wake = () => {
      if (stopped) return;
      void refreshQueue();
      if (!navigator.onLine) {
        setConnectionError('Sin conexión. Los pedidos pendientes están guardados en este dispositivo.');
        return;
      }
      void flush().catch(() => {
        if (!stopped) setQueueError('No se pudo actualizar la cola local. Conserva este navegador abierto.');
      });
      void sync.request();
    };
    wakeSync.current = wake;
    if (channel) channel.onmessage = wake;
    const visible = () => { if (document.visibilityState === 'visible') wake(); };
    const offline = () => setConnectionError('Sin conexión. Los pedidos pendientes están guardados en este dispositivo.');
    window.addEventListener('online', wake);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', visible);
    const interval = window.setInterval(wake, RETRY_MS);

    // Realtime is an invalidation signal, never a competing source of partial
    // order objects. Each snapshot includes orders and their products together.
    const realtime = supabase.channel('pos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
        if (payload.table === 'categories' || payload.table === 'products') menuDirty = true;
        void sync.invalidate();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { menuDirty = true; void sync.invalidate(); wake(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionError('La conexión en vivo se interrumpió. Se verifica el servidor cada 5 segundos.');
        }
      });
    wake();
    return () => {
      stopped = true;
      sync.stop();
      coordinator.current = null;
      wakeSync.current = () => {};
      clearInterval(interval);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', visible);
      channel?.close();
      void supabase.removeChannel(realtime);
    };
  }, []);

  // ══════════════════════════════════════════════
  // CATEGORIES CRUD
  // ══════════════════════════════════════════════

  const addCategory = useCallback((name: string) => {
    const tempId = generateId();
    setCategories(prev => [...prev, { id: tempId, name, order: prev.length + 1 }]);
    runWrite(() => insertCategory(name, categories.length + 1)).then(cat => {
      if (cat.id !== tempId) {
        setCategories(prev => prev.map(c => c.id === tempId ? { ...c, id: cat.id } : c));
      }
    }).catch(err => console.error('addCategory error:', err));
  }, [categories.length, runWrite]);

  const updateCategoryFn = useCallback((id: string, name: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    runWrite(() => updateCategoryDb(id, name)).catch(err => console.error('updateCategory error:', err));
  }, [runWrite]);

  const deleteCategoryFn = useCallback((id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    setProducts(prev => prev.filter(p => p.categoryId !== id));
    runWrite(() => deleteCategoryDb(id)).catch(err => console.error('deleteCategory error:', err));
  }, [runWrite]);

  // ══════════════════════════════════════════════
  // PRODUCTS CRUD
  // ══════════════════════════════════════════════

  const addProductFn = useCallback((product: Omit<Product, 'id'>) => {
    const tempId = generateId();
    setProducts(prev => [...prev, { ...product, id: tempId }]);
    runWrite(() => insertProduct(product)).then(p => {
      if (p.id !== tempId) {
        setProducts(prev => prev.map(pr => pr.id === tempId ? { ...pr, id: p.id } : pr));
      }
    }).catch(err => console.error('addProduct error:', err));
  }, [runWrite]);

  const updateProductFn = useCallback((id: string, data: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    runWrite(() => updateProductDb(id, data)).catch(err => console.error('updateProduct error:', err));
  }, [runWrite]);

  const deleteProductFn = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    runWrite(() => deleteProductDb(id)).catch(err => console.error('deleteProduct error:', err));
  }, [runWrite]);

  // ══════════════════════════════════════════════
  // CART (local only)
  // ══════════════════════════════════════════════

  const addToCart = useCallback((product: Product) => {
    if (placing.current) return;
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
    if (placing.current) return;
    setCart(prev => prev.filter(item => item.id !== cartItemId));
  }, []);

  const updateCartQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (placing.current) return;
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.id !== cartItemId));
      return;
    }
    setCart(prev => prev.map(item =>
      item.id === cartItemId ? { ...item, quantity } : item
    ));
  }, []);

  const updateCartItemNotes = useCallback((cartItemId: string, notes: string) => {
    if (placing.current) return;
    setCart(prev => prev.map(item =>
      item.id === cartItemId ? { ...item, notes } : item
    ));
  }, []);

  const clearCart = useCallback(() => {
    if (placing.current) return;
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
    if (placing.current) return { ok: false, error: 'El pedido ya se está guardando.' };
    if (!customerName.trim() || cart.length === 0 || !activeSession) {
      return { ok: false, error: 'Completa el pedido y verifica que el día esté abierto.' };
    }
    placing.current = true;
    const orderId = crypto.randomUUID();
    const order: Order = {
      id: orderId, customerName: customerName.trim(), takeout,
      status: 'preparing', createdAt: new Date().toISOString(), daySessionId: activeSession.id,
      items: cart.map(item => ({
        id: crypto.randomUUID(), orderId, productId: item.product.id,
        productName: item.product.name, productPrice: item.product.price,
        quantity: item.quantity, notes: item.notes || undefined,
      })),
    };
    try {
      // Do not send or clear anything until the durable IDB transaction commits.
      await enqueueOrder(order);
      setCart([]);
      setCustomerName('');
      setTakeout(false);
      retrySync();
      return { ok: true, queuedId: orderId };
    } catch {
      return { ok: false, error: 'No se pudo guardar el pedido en este dispositivo. El carrito se conserva; no se envió.' };
    } finally { placing.current = false; }
  }, [customerName, cart, takeout, activeSession, retrySync]);

  const updateOrderStatusFn = useCallback((orderId: string, status: Order['status']) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    runWrite(() => updateOrderStatusDb(orderId, status)).catch(err => console.error('updateOrderStatus error:', err));
  }, [runWrite]);

  const appendItemsToOrderFn = useCallback(async (orderId: string, items: CartItem[]) => {
    if (items.length === 0) return false;
    const target = orders.find(o => o.id === orderId);
    if (!target) return false;
    if (target.status !== 'preparing' && target.status !== 'pending' && target.status !== 'ready') return false;

    // Each round of additions gets its own batch number, so the kitchen sees
    // "+2" on what was just added instead of it blending into the original
    // "x2" lines.
    const addedBatch = target.items.reduce((max, i) => Math.max(max, i.addedBatch ?? 0), 0) + 1;

    const newItems: OrderItem[] = items.map((item, i) => ({
      id: generateId() + i,
      orderId,
      productId: item.product.id,
      productName: item.product.name,
      productPrice: item.product.price,
      quantity: item.quantity,
      notes: item.notes || undefined,
      addedBatch,
    }));


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
      await runWrite(() => appendOrderItemsDb(newItems));
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
        await runWrite(() => updateOrderStatusDb(orderId, 'preparing'));
      } catch (err) {
        console.error('appendItemsToOrder (status) error:', err);
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: target.status } : o));
        return false;
      }
    }

    return true;
  }, [orders, runWrite]);

  /** Replace an order with whatever the database actually holds. */
  const resyncOrder = useCallback(async () => {
    await coordinator.current?.invalidate();
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
      await runWrite(() => chargeOrderItemsDb(orderId, [], { cashApplied: 0, terminalApplied: 0 }));
      await resyncOrder();
    } catch (err) {
      console.error('settleIfFullyPaid error:', err);
    }
  }, [resyncOrder, runWrite]);

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
        await runWrite(() => deleteOrderItemDb(itemId));
      } catch (err) {
        console.error('decreaseOrderItemQuantity (delete) error:', err);
        await resyncOrder();
        return false;
      }
    } else {
      setOrders(prev => prev.map(o =>
        o.id === orderId
          ? { ...o, items: o.items.map(i => i.id === itemId ? { ...i, quantity: newQty } : i) }
          : o
      ));
      try {
        await runWrite(() => updateOrderItemQuantityDb(itemId, newQty));
      } catch (err) {
        console.error('decreaseOrderItemQuantity error:', err);
        await resyncOrder();
        return false;
      }
    }

    const remainingItems = newQty <= 0
      ? target.items.filter(i => i.id !== itemId)
      : target.items.map(i => i.id === itemId ? { ...i, quantity: newQty } : i);
    await settleIfFullyPaid(orderId, remainingItems, orderPaid(target));

    return true;
  }, [orders, settleIfFullyPaid, resyncOrder, runWrite]);

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
      await runWrite(() => deleteOrderItemDb(itemId));
    } catch (err) {
      console.error('removeOrderItem error:', err);
      await resyncOrder();
      return false;
    }

    await settleIfFullyPaid(orderId, target.items.filter(i => i.id !== itemId), orderPaid(target));

    return true;
  }, [orders, settleIfFullyPaid, resyncOrder, runWrite]);

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
      await runWrite(() => chargeOrderItemsDb(orderId, cleaned, payment));
    } catch (err) {
      console.error('chargeOrderItems error:', err);
      return false;
    }

    // Read back what was actually stored: the amounts were added server-side,
    // so this is the only source of truth after a concurrent charge.
    await resyncOrder();

    return true;
  }, [orders, resyncOrder, runWrite]);

  const pendingOrdersCount = orders.filter(o => o.status === 'preparing').length;

  // ══════════════════════════════════════════════
  // DAY SESSION
  // ══════════════════════════════════════════════

  const isDayOpen = activeSession !== null;

  const openDay = useCallback(async (initialCash: number) => {
    const session = await runWrite(() => openDaySession(initialCash));
    setActiveSession(session);
    setExpenses([]);
  }, [runWrite]);

  const closeDay = useCallback(async () => {
    if (!activeSession) return null;
    // A local queue must be resolved before calculating this device's corte.
    const { pending } = await readOutbox();
    if (pending.some(entry => entry.order.daySessionId === activeSession.id)) return null;

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
      await runWrite(() => closeDayAndArchive(activeSession.id, report));
      setOrders([]);
      setActiveSession(null);
      setExpenses([]);
    } catch (err) {
      console.error('closeDay error:', err);
      // The day is still open: don't hand back a corte that was never saved.
      return null;
    }

    return totals;
  }, [activeSession, orders, expenses, runWrite]);

  // ══════════════════════════════════════════════
  // EXPENSES
  // ══════════════════════════════════════════════

  const addExpenseFn = useCallback(async (description: string, amount: number) => {
    if (!activeSession) return;
    const id = generateId();
    const exp: Expense = { id, daySessionId: activeSession.id, description, amount, createdAt: new Date().toISOString() };
    setExpenses(prev => [...prev, exp]);
    try {
      await runWrite(() => insertExpense(activeSession.id, description, amount));
    } catch (err) {
      console.error('addExpense error:', err);
    }
  }, [activeSession, runWrite]);

  const removeExpenseFn = useCallback((id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    runWrite(() => deleteExpenseDb(id)).catch(err => console.error('removeExpense error:', err));
  }, [runWrite]);

  return (
    <AppContext.Provider
      value={{
        categories, products,
        addCategory, updateCategory: updateCategoryFn, deleteCategory: deleteCategoryFn,
        addProduct: addProductFn, updateProduct: updateProductFn, deleteProduct: deleteProductFn,
        cart, customerName, setCustomerName, takeout, setTakeout,
        addToCart, removeFromCart, updateCartQuantity, updateCartItemNotes, clearCart,
        cartTotal, cartCount,
        pendingSubmissions, submissionReceipts, connectionError, queueError, lastSyncedAt, retrySync,
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
