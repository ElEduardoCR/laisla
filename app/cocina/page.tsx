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
  variant = 'active',
}: {
  order: Order;
  onStatusChange: (id: string, status: Order['status']) => void;
  onCharge?: (order: Order) => void;
  variant?: 'active' | 'ready' | 'completed';
}) {
  const statusStyles = {
    pending: 'border-accent bg-accent/5',
    preparing: 'border-primary bg-primary/5',
    ready: 'border-success bg-success/5',
    completed: 'border-gray-300 bg-gray-50',
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendiente', color: 'bg-accent text-white' },
    preparing: { label: 'Preparando', color: 'bg-primary text-white' },
    ready: { label: 'Listo', color: 'bg-success text-white' },
    completed: { label: 'Cobrado', color: 'bg-gray-500 text-white' },
  };

  const total = getOrderTotal(order);

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

      {/* Items */}
      <div className="space-y-1.5 mb-4">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700">
              <span className="font-semibold text-foreground">{item.quantity}x</span>{' '}
              {item.productName}
            </span>
            <span className="text-gray-500 font-medium">
              ${(item.productPrice * item.quantity).toFixed(2)}
            </span>
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
        {order.status === 'pending' && (
          <button
            onClick={() => onStatusChange(order.id, 'preparing')}
            className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
          >
            👨‍🍳 Preparando
          </button>
        )}
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
export default function CocinaPage() {
  const { orders, updateOrderStatus, completeOrder } = useApp();
  const [chargingOrder, setChargingOrder] = useState<Order | null>(null);

  // Chronological order (oldest first) — orders are already stored in chronological order
  const inProgressOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready');
  const completedOrders = orders.filter(o => o.status === 'completed').reverse(); // newest completed first

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

  const hasAnyOrders = inProgressOrders.length > 0 || readyOrders.length > 0 || completedOrders.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          👨‍🍳 Cocina
        </h1>
        <div className="flex gap-2">
          {inProgressOrders.length > 0 && (
            <span className="bg-accent text-white text-sm font-bold px-3 py-1 rounded-full">
              {inProgressOrders.length} en curso
            </span>
          )}
          {readyOrders.length > 0 && (
            <span className="bg-success text-white text-sm font-bold px-3 py-1 rounded-full">
              {readyOrders.length} por cobrar
            </span>
          )}
        </div>
      </div>

      {!hasAnyOrders ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-6xl mb-4">👨‍🍳</div>
          <p className="text-xl font-medium">No hay pedidos por ahora</p>
          <p className="text-sm mt-1">Los pedidos aparecerán aquí cuando el mesero los envíe</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── In progress (pending + preparing) ── */}
          {inProgressOrders.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                🔥 Pedidos en Curso
                <span className="text-sm font-normal text-gray-400">({inProgressOrders.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inProgressOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={updateOrderStatus}
                    variant="active"
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Ready to charge ── */}
          {readyOrders.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-success mb-4 flex items-center gap-2">
                ✅ Listos — Por Cobrar
                <span className="text-sm font-normal text-gray-400">({readyOrders.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {readyOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={updateOrderStatus}
                    onCharge={setChargingOrder}
                    variant="ready"
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Completed ── */}
          {completedOrders.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-gray-400 mb-4 flex items-center gap-2">
                📋 Terminados
                <span className="text-sm font-normal">({completedOrders.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                {completedOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={updateOrderStatus}
                    variant="completed"
                  />
                ))}
              </div>
            </section>
          )}
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
