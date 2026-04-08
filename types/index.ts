export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description?: string;
  available: boolean;
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  notes?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  notes?: string;
}

export interface Order {
  id: string;
  customerName: string;
  items: OrderItem[];
  takeout: boolean;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  paymentMethod?: 'cash' | 'terminal';
  amountPaid?: number;
  change?: number;
  createdAt: string;
  completedAt?: string;
  daySessionId?: string;
}

export interface DaySession {
  id: string;
  openedAt: string;
  closedAt?: string;
  initialCash: number;
  totalSales?: number;
  totalCash?: number;
  totalTerminal?: number;
  totalExpenses?: number;
  finalCash?: number;
  status: 'open' | 'closed';
}

export interface Expense {
  id: string;
  daySessionId: string;
  description: string;
  amount: number;
  createdAt: string;
}
