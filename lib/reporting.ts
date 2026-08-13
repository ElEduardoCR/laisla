import { Order, OrderItem, ProductSale, Expense } from '@/types';

/**
 * Money maths for the day report. Everything the cash-drawer numbers are made
 * of lives here so the running totals in Configuración and the closing report
 * can never drift apart.
 *
 * The rule: only what was actually charged counts. A partially paid order
 * contributes the units and the money that were really collected, instead of
 * being ignored until it reaches "completed" — orders are deleted when the day
 * closes, so anything not counted here is money lost.
 */

export function orderTotal(order: Order): number {
  return order.items.reduce((s, i) => s + i.productPrice * i.quantity, 0);
}

/** Units of a line that were sold: all of them once the order is closed, only the paid ones otherwise. */
export function soldUnits(order: Order, item: OrderItem): number {
  if (order.status === 'completed') return item.quantity;
  return Math.min(item.paidQuantity ?? 0, item.quantity);
}

/** Cash collected. Falls back to the payment method for orders closed before split payments existed. */
export function orderCash(order: Order): number {
  if (order.paidCash != null || order.paidTerminal != null) return order.paidCash ?? 0;
  return order.status === 'completed' && order.paymentMethod === 'cash' ? orderTotal(order) : 0;
}

/** Card/terminal collected, with the same legacy fallback as {@link orderCash}. */
export function orderTerminal(order: Order): number {
  if (order.paidCash != null || order.paidTerminal != null) return order.paidTerminal ?? 0;
  return order.status === 'completed' && order.paymentMethod === 'terminal' ? orderTotal(order) : 0;
}

export function orderPaid(order: Order): number {
  return orderCash(order) + orderTerminal(order);
}

export function orderRemaining(order: Order): number {
  return Math.max(0, orderTotal(order) - orderPaid(order));
}

/** Orders of a session that still owe money — they'd be deleted unpaid on close. */
export function unchargedOrders(orders: Order[]): Order[] {
  return orders.filter(o => o.status !== 'completed' && orderRemaining(o) > 0);
}

export interface SessionTotals {
  totalSales: number;
  totalCash: number;
  totalTerminal: number;
  totalExpenses: number;
  finalCash: number;
}

export function computeSessionTotals(
  orders: Order[],
  expenses: Expense[],
  initialCash: number
): SessionTotals {
  const totalCash = orders.reduce((s, o) => s + orderCash(o), 0);
  const totalTerminal = orders.reduce((s, o) => s + orderTerminal(o), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  return {
    // What was really charged, cash + card. Orders left unpaid are not sales.
    totalSales: totalCash + totalTerminal,
    totalCash,
    totalTerminal,
    totalExpenses,
    finalCash: initialCash + totalCash - totalExpenses,
  };
}

export function computeProductSales(orders: Order[]): ProductSale[] {
  const byName: Record<string, ProductSale> = {};
  for (const order of orders) {
    for (const item of order.items) {
      const units = soldUnits(order, item);
      if (units <= 0) continue;
      if (!byName[item.productName]) byName[item.productName] = { name: item.productName, qty: 0, total: 0 };
      byName[item.productName].qty += units;
      byName[item.productName].total += item.productPrice * units;
    }
  }
  return Object.values(byName).sort((a, b) => b.total - a.total);
}
