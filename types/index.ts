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
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  customerName: string;
  items: CartItem[];
  takeout: boolean;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  paymentMethod?: 'cash' | 'terminal';
  amountPaid?: number;
  change?: number;
  createdAt: string;
  completedAt?: string;
}
