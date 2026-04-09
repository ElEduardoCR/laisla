'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Order } from '@/types';

function formatTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function getOrderTotal(order: Order) {
  return order.items.reduce((s, i) => s + i.productPrice * i.quantity, 0);
}

// ── Denomination buttons for cash payment ──
const DENOMINATIONS = [
  { label: '$20', value: 20 },
  { label: '$50', value: 50 },
  { label: '$100', value: 100 },
  { label: '$200', value: 200 },
  { label: '$500', value: 500 },
  { label: '$1000', value: 1000 },
];

// ── Payment Modal ──
function PaymentModal({
  order,
  onClose,
  onPayCash,
  onPayTerminal,
}: {
  order: Order;
  onClose: () => void;
  onPayCash: (amountPaid: number, change: number) => void;
  onPayTerminal: () => void;
}) {
  const total = getOrderTotal(order);
  const [amountPaid, setAmountPaid] = useState(0);
  const [denomBreakdown, setDenomBreakdown] = useState<Record<number, number>>({});
  const change = amountPaid - total;

  const addDenomination = (value: number) => {
    setAmountPaid(prev => prev + value);
    setDenomBreakdown(prev => ({ ...prev, [value]: (prev[value] || 0) + 1 }));
  };

  const resetAmount = () => {
    setAmountPaid(0);
    setDenomBreakdown({});
  };

  const handleExactAmount = () => {
    setAmountPaid(total);
    setDenomBreakdown({});
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-primary text-white p-4 rounded-t-2xl flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">💰 Cobrar</h2>
              <p className="text-sm text-white/80">{order.customerName}</p>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">✕</button>
          </div>

          {/* Order summary */}
          <div className="p-4 border-b bg-gray-50">
            <div className="space-y-1">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    <span className="font-semibold">{item.quantity}x</span> {item.productName}
                  </span>
                  <span className="font-medium text-gray-500">${(item.productPrice * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t">
              <span className="font-bold text-lg">Total a cobrar:</span>
              <span className="font-bold text-2xl text-primary">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Cash payment */}
          <div className="p-4">
            <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">Pago en efectivo</h3>

            {/* Denominations grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {DENOMINATIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => addDenomination(d.value)}
                  className="relative bg-white border-2 border-gray-200 hover:border-accent hover:bg-accent/5 rounded-xl py-3 text-center font-bold text-lg transition-all active:scale-95"
                >
                  {d.label}
                  {denomBreakdown[d.value] && (
                    <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {denomBreakdown[d.value]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Amount display */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-600">Pagó con:</span>
                <span className="font-bold text-xl">${amountPaid.toFixed(2)}</span>
              </div>
              <div className={`flex justify-between items-center pt-2 border-t ${change >= 0 ? 'text-success' : 'text-red-500'}`}>
                <span className="text-sm font-medium">
                  {change >= 0 ? 'Cambio:' : 'Falta:'}
                </span>
                <span className="font-bold text-2xl">
                  ${Math.abs(change).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleExactAmount}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg text-sm transition-colors"
              >
                Monto exacto
              </button>
              <button
                onClick={resetAmount}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg text-sm transition-colors"
              >
                Reiniciar
              </button>
            </div>

            {/* Confirm cash */}
            <button
              onClick={() => change >= 0 && onPayCash(amountPaid, change)}
              disabled={change < 0 || amountPaid === 0}
              className={`w-full font-bold py-3 rounded-xl text-sm transition-all ${
                change >= 0 && amountPaid > 0
                  ? 'bg-success hover:bg-success-dark text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              💵 Cobrar en Efectivo {change >= 0 && amountPaid > 0 && `- Cambio: $${change.toFixed(2)}`}
            </button>
          </div>

          {/* Terminal divider */}
          <div className="px-4">
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">o bien</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </div>

          {/* Terminal payment */}
          <div className="p-4 pt-2">
            <button
              onClick={onPayTerminal}
              className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl text-sm transition-colors"
            >
              💳 Pago con Terminal
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Order Card ──
function OrderCard({
  order,
  onStatusChange,
  onCharge,
}: {
  order: Order;
  onStatusChange: (id: string, status: Order['status']) => void;
  onCharge?: (order: Order) => void;
}) {
  const { products, categories } = useApp();

  const statusStyles: Record<Order['status'], string> = {
    pending: 'border-accent bg-accent/5',
    preparing: 'border-primary bg-primary/5',
    ready: 'border-success bg-success/5',
    completed: 'border-gray-300 bg-gray-50',
  };

  const statusLabels: Record<Order['status'], { label: string; color: string }> = {
    pending: { label: 'Pendiente', color: 'bg-accent text-white' },
    preparing: { label: 'Preparando', color: 'bg-primary text-white' },
    ready: { label: 'Listo', color: 'bg-success text-white' },
    completed: { label: 'Cobrado', color: 'bg-gray-500 text-white' },
  };

  const total = getOrderTotal(order);

  // Group items by category
  const groupedItems = order.items.reduce((acc, item) => {
    const product = products.find(p => p.id === item.productId);
    const category = categories.find(c => c.id === product?.categoryId);
    const catName = category?.name || 'Otros';

    if (!acc[catName]) acc[catName] = [];
    acc[catName].push(item);
    return acc;
  }, {} as Record<string, typeof order.items>);

  return (
    <div className={`rounded-xl border-2 p-4 shadow-sm ${statusStyles[order.status]}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-lg text-foreground">{order.customerName}</h3>
          <p className="text-xs text-gray-500">{formatTime(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {order.takeout && (
            <span className="bg-accent/20 text-accent-dark text-xs font-bold px-2.5 py-1 rounded-full">
              📦 Para llevar
            </span>
          )}
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusLabels[order.status].color}`}>
            {statusLabels[order.status].label}
          </span>
        </div>
      </div>

      {/* Items Grouped */}
      <div className="space-y-3 mb-4">
        {Object.entries(groupedItems).map(([catName, items]) => (
          <div key={catName} className="bg-white/50 rounded-lg p-2 border">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5 border-b border-gray-200 pb-1">
              {catName}
            </h4>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <div className="flex-1 pr-2">
                    <span className="text-gray-700">
                      <span className="font-semibold text-foreground">{item.quantity}x</span>{' '}
                      {item.productName}
                    </span>
                    {item.notes && (
                      <div className="text-xs text-red-500 font-bold mt-0.5 leading-tight">
                        ⚠️ {item.notes}
                      </div>
                    )}
                  </div>
                  <span className="text-gray-500 font-medium whitespace-nowrap">
                    ${(item.productPrice * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex justify-between items-center border-t pt-3 mb-3">
        <span className="font-semibold text-gray-600">Total:</span>
        <span className="font-bold text-lg text-primary">${total.toFixed(2)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {order.status === 'preparing' && (
          <button
            onClick={() => onStatusChange(order.id, 'ready')}
            className="flex-1 bg-success hover:bg-success-dark text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
          >
            ✅ Listo
          </button>
        )}
        {order.status === 'ready' && onCharge && (
          <button
            onClick={() => onCharge(order)}
            className="flex-1 bg-accent hover:bg-accent-dark text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
          >
            💰 Cobrar
          </button>
        )}
        {order.status === 'completed' && (
          <div className="flex-1 text-center text-sm py-2">
            <span className="text-gray-500 font-medium">
              {order.paymentMethod === 'cash'
                ? `💵 Efectivo — Pagó: $${order.amountPaid?.toFixed(2)} | Cambio: $${order.change?.toFixed(2)}`
                : '💳 Terminal'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Kitchen Page ──
type TabId = 'preparing' | 'ready' | 'completed';

const TABS: { id: TabId; label: string; icon: string; activeColor: string }[] = [
  { id: 'preparing', label: 'Preparando', icon: '🔥', activeColor: 'bg-primary text-white shadow-md' },
  { id: 'ready', label: 'Listos', icon: '✅', activeColor: 'bg-success text-white shadow-md' },
  { id: 'completed', label: 'Cobrados', icon: '📋', activeColor: 'bg-gray-600 text-white shadow-md' },
];

export default function CocinaPage() {
  const { orders, updateOrderStatus, completeOrder } = useApp();
  const [chargingOrder, setChargingOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('preparing');

  // Any order that landed in the kitchen as "pending" (legacy) is also
  // shown in the "Preparando" tab so nothing gets stuck.
  const preparingOrders = orders.filter(o => o.status === 'preparing' || o.status === 'pending');
  const readyOrders = orders.filter(o => o.status === 'ready');
  const completedOrders = orders.filter(o => o.status === 'completed').slice().reverse();

  const counts: Record<TabId, number> = {
    preparing: preparingOrders.length,
    ready: readyOrders.length,
    completed: completedOrders.length,
  };

  const ordersByTab: Record<TabId, Order[]> = {
    preparing: preparingOrders,
    ready: readyOrders,
    completed: completedOrders,
  };

  const currentOrders = ordersByTab[activeTab];

  const handlePayCash = (amountPaid: number, change: number) => {
    if (chargingOrder) {
      completeOrder(chargingOrder.id, 'cash', amountPaid, change);
      setChargingOrder(null);
    }
  };

  const handlePayTerminal = () => {
    if (chargingOrder) {
      completeOrder(chargingOrder.id, 'terminal');
      setChargingOrder(null);
    }
  };

  const emptyMessages: Record<TabId, { icon: string; title: string; subtitle: string }> = {
    preparing: {
      icon: '👨‍🍳',
      title: 'No hay pedidos preparándose',
      subtitle: 'Los pedidos nuevos aparecerán aquí automáticamente',
    },
    ready: {
      icon: '✅',
      title: 'No hay pedidos listos',
      subtitle: 'Cuando marques un pedido como listo aparecerá aquí',
    },
    completed: {
      icon: '📋',
      title: 'No hay pedidos cobrados',
      subtitle: 'Los pedidos cobrados se mostrarán aquí',
    },
  };

  const empty = emptyMessages[activeTab];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
        👨‍🍳 Cocina
      </h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const count = counts[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isActive
                  ? tab.activeColor
                  : 'bg-white text-gray-600 hover:bg-primary/10 border border-gray-200'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid or empty state */}
      {currentOrders.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-6xl mb-4">{empty.icon}</div>
          <p className="text-xl font-medium">{empty.title}</p>
          <p className="text-sm mt-1">{empty.subtitle}</p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${
            activeTab === 'completed' ? 'opacity-70' : ''
          }`}
        >
          {currentOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={updateOrderStatus}
              onCharge={activeTab === 'ready' ? setChargingOrder : undefined}
            />
          ))}
        </div>
      )}

      {/* Payment Modal */}
      {chargingOrder && (
        <PaymentModal
          order={chargingOrder}
          onClose={() => setChargingOrder(null)}
          onPayCash={handlePayCash}
          onPayTerminal={handlePayTerminal}
        />
      )}
    </div>
  );
}
