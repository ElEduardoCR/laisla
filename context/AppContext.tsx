'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Category, Product, CartItem, Order } from '@/types';

const defaultCategories: Category[] = [
  { id: 'cat-1', name: 'Ceviches', order: 1 },
  { id: 'cat-2', name: 'Cocteles', order: 2 },
  { id: 'cat-3', name: 'Tacos', order: 3 },
  { id: 'cat-4', name: 'Tostadas', order: 4 },
  { id: 'cat-5', name: 'Aguachiles', order: 5 },
  { id: 'cat-6', name: 'Bebidas', order: 6 },
];

const defaultProducts: Product[] = [
  { id: 'prod-1', categoryId: 'cat-1', name: 'Ceviche de Camarón', price: 120, available: true },
  { id: 'prod-2', categoryId: 'cat-1', name: 'Ceviche de Pescado', price: 100, available: true },
  { id: 'prod-3', categoryId: 'cat-1', name: 'Ceviche Mixto', price: 140, available: true },
  { id: 'prod-4', categoryId: 'cat-2', name: 'Coctel de Camarón', price: 130, available: true },
  { id: 'prod-5', categoryId: 'cat-2', name: 'Coctel de Pulpo', price: 150, available: true },
  { id: 'prod-6', categoryId: 'cat-2', name: 'Coctel Mixto', price: 160, available: true },
  { id: 'prod-7', categoryId: 'cat-3', name: 'Taco de Camarón', price: 35, available: true },
  { id: 'prod-8', categoryId: 'cat-3', name: 'Taco de Pescado', price: 30, available: true },
  { id: 'prod-9', categoryId: 'cat-3', name: 'Taco Gobernador', price: 45, available: true },
  { id: 'prod-10', categoryId: 'cat-4', name: 'Tostada de Ceviche', price: 45, available: true },
  { id: 'prod-11', categoryId: 'cat-4', name: 'Tostada de Marlín', price: 40, available: true },
  { id: 'prod-12', categoryId: 'cat-5', name: 'Aguachile Verde', price: 140, available: true },
  { id: 'prod-13', categoryId: 'cat-5', name: 'Aguachile Negro', price: 145, available: true },
  { id: 'prod-14', categoryId: 'cat-5', name: 'Aguachile Rojo', price: 140, available: true },
  { id: 'prod-15', categoryId: 'cat-6', name: 'Agua Fresca', price: 30, available: true },
  { id: 'prod-16', categoryId: 'cat-6', name: 'Refresco', price: 25, available: true },
  { id: 'prod-17', categoryId: 'cat-6', name: 'Cerveza', price: 40, available: true },
  { id: 'prod-18', categoryId: 'cat-6', name: 'Michelada', price: 65, available: true },
];

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

  // Cart
  cart: CartItem[];
  customerName: string;
  setCustomerName: (name: string) => void;
  takeout: boolean;
  setTakeout: (val: boolean) => void;
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;

  // Orders
  orders: Order[];
  placeOrder: () => boolean;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  completeOrder: (orderId: string, paymentMethod: 'cash' | 'terminal', amountPaid?: number, change?: number) => void;
  pendingOrdersCount: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [takeout, setTakeout] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setCategories(loadFromStorage('pos-categories', defaultCategories));
    setProducts(loadFromStorage('pos-products', defaultProducts));
    setOrders(loadFromStorage('pos-orders', []));
    setLoaded(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem('pos-categories', JSON.stringify(categories));
  }, [categories, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem('pos-products', JSON.stringify(products));
  }, [products, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem('pos-orders', JSON.stringify(orders));
  }, [orders, loaded]);

  // Categories CRUD
  const addCategory = useCallback((name: string) => {
    setCategories(prev => [...prev, { id: generateId(), name, order: prev.length + 1 }]);
  }, []);

  const updateCategory = useCallback((id: string, name: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    setProducts(prev => prev.filter(p => p.categoryId !== id));
  }, []);

  // Products CRUD
  const addProduct = useCallback((product: Omit<Product, 'id'>) => {
    setProducts(prev => [...prev, { ...product, id: generateId() }]);
  }, []);

  const updateProduct = useCallback((id: string, data: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  // Cart
  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.product.id !== productId));
      return;
    }
    setCart(prev => prev.map(item =>
      item.product.id === productId ? { ...item, quantity } : item
    ));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerName('');
    setTakeout(false);
  }, []);

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Orders
  const placeOrder = useCallback(() => {
    if (!customerName.trim() || cart.length === 0) return false;
    const newOrder: Order = {
      id: generateId(),
      customerName: customerName.trim(),
      items: [...cart],
      takeout,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setOrders(prev => [...prev, newOrder]);
    setCart([]);
    setCustomerName('');
    setTakeout(false);
    return true;
  }, [customerName, cart, takeout]);

  const updateOrderStatus = useCallback((orderId: string, status: Order['status']) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  }, []);

  const completeOrder = useCallback((orderId: string, paymentMethod: 'cash' | 'terminal', amountPaid?: number, change?: number) => {
    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, status: 'completed' as const, paymentMethod, amountPaid, change, completedAt: new Date().toISOString() }
        : o
    ));
  }, []);

  const pendingOrdersCount = orders.filter(o => o.status === 'pending' || o.status === 'preparing').length;

  return (
    <AppContext.Provider
      value={{
        categories, products,
        addCategory, updateCategory, deleteCategory,
        addProduct, updateProduct, deleteProduct,
        cart, customerName, setCustomerName, takeout, setTakeout,
        addToCart, removeFromCart, updateCartQuantity, clearCart,
        cartTotal, cartCount,
        orders, placeOrder, updateOrderStatus, completeOrder, pendingOrdersCount,
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
