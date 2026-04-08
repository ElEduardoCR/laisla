'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Category, Product, CartItem, Order, OrderItem, DaySession, Expense } from '@/types';
import { supabase } from '@/lib/supabase';
import {
  fetchCategories, fetchProducts, fetchOrders, fetchOrderItems,
  insertCategory, updateCategoryDb, deleteCategoryDb,
  insertProduct, updateProductDb, deleteProductDb,
  insertOrder, updateOrderStatusDb, completeOrderDb,
  seedIfEmpty, generateId,
  fetchOpenSession, openDaySession, closeDaySessionDb,
  fetchExpenses, insertExpense, deleteExpenseDb,
} from '@/lib/database';

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
  completeOrder: (orderId: string, paymentMethod: 'cash' | 'terminal', amountPaid?: number, change?: number) => void;
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
        };
        setOrders(prev => prev.map(o => {
          if (o.id !== item.orderId) return o;
          if (o.items.some(i => i.id === item.id)) return o;
          return { ...o, items: [...o.items, item] };
        }));
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'day_sessions' }, (payload) => {
        const row = payload.new;
        if (row.status === 'closed') {
          setActiveSession(prev => prev?.id === row.id ? null : prev);
        }
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
      status: 'pending',
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
        { id: orderId, customerName: newOrder.customerName, takeout, status: 'pending', createdAt: now, daySessionId: activeSession?.id },
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

  const completeOrderFn = useCallback((orderId: string, paymentMethod: 'cash' | 'terminal', amountPaid?: number, change?: number) => {
    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, status: 'completed' as const, paymentMethod, amountPaid, change, completedAt: new Date().toISOString() }
        : o
    ));
    completeOrderDb(orderId, paymentMethod, amountPaid, change)
      .catch(err => console.error('completeOrder error:', err));
  }, []);

  const pendingOrdersCount = orders.filter(o => o.status === 'pending' || o.status === 'preparing').length;

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

    // Calculate totals from completed orders of this session
    const sessionOrders = orders.filter(o => o.daySessionId === activeSession.id && o.status === 'completed');
    const totalSales = sessionOrders.reduce((sum, o) => {
      return sum + o.items.reduce((s, i) => s + i.productPrice * i.quantity, 0);
    }, 0);
    const totalCash = sessionOrders
      .filter(o => o.paymentMethod === 'cash')
      .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.productPrice * i.quantity, 0), 0);
    const totalTerminal = sessionOrders
      .filter(o => o.paymentMethod === 'terminal')
      .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.productPrice * i.quantity, 0), 0);
    const totalExp = expenses.reduce((sum, e) => sum + e.amount, 0);
    const finalCash = activeSession.initialCash + totalCash - totalExp;

    const totals = { totalSales, totalCash, totalTerminal, totalExpenses: totalExp, finalCash };

    try {
      await closeDaySessionDb(activeSession.id, totals);
      setActiveSession(null);
      setExpenses([]);
    } catch (err) {
      console.error('closeDay error:', err);
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
        completeOrder: completeOrderFn, pendingOrdersCount,
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
