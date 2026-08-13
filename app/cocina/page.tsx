'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Order } from '@/types';
import EditOrderModal from '@/components/EditOrderModal';
import ChargeModal from '@/components/ChargeModal';

function formatTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function getOrderTotal(order: Order) {
  return order.items.reduce((s, i) => s + i.productPrice * i.quantity, 0);
}

function getOrderPaid(order: Order) {
  return (order.paidCash ?? 0) + (order.paidTerminal ?? 0);
}

// ── Order Card ──
function OrderCard({
  order,
  onStatusChange,
  onCharge,
  onEdit,
}: {
  order: Order;
  onStatusChange: (id: string, status: Order['status']) => void;
  onCharge?: (order: Order) => void;
  onEdit?: (order: Order) => void;
}) {
  const { products, categories } = useApp();
  const canEdit =
    order.status === 'preparing' ||
    order.status === 'pending' ||
    order.status === 'ready';

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
  const paid = getOrderPaid(order);
  const remaining = Math.max(0, total - paid);

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
          {canEdit && onEdit && (
            <button
              onClick={() => onEdit(order)}
              title="Agregar productos"
              aria-label="Agregar productos al pedido"
              className="w-8 h-8 rounded-full bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white flex items-center justify-center text-sm transition-colors shadow-sm"
            >
              ✏️
            </button>
          )}
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
      <div className="border-t pt-3 mb-3">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-600">Total:</span>
          <span className="font-bold text-lg text-primary">${total.toFixed(2)}</span>
        </div>
        {order.status !== 'completed' && paid > 0 && (
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-success font-medium">Pagado: ${paid.toFixed(2)}</span>
            <span className="text-accent-dark font-bold">Resta: ${remaining.toFixed(2)}</span>
          </div>
        )}
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
        {/* A partially paid order that went back to the kitchen (new items were
            added) keeps its charge button so the split payment can continue. */}
        {order.status !== 'completed' && (order.status === 'ready' || paid > 0) && onCharge && (
          <button
            onClick={() => onCharge(order)}
            className="flex-1 bg-accent hover:bg-accent-dark text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
          >
            💰 {paid > 0 ? 'Seguir cobrando' : 'Cobrar'}
          </button>
        )}
        {order.status === 'completed' && (
          <div className="flex-1 text-center text-sm py-2">
            <span className="text-gray-500 font-medium">
              {order.paymentMethod === 'mixed'
                ? `💵 $${(order.paidCash ?? 0).toFixed(2)} + 💳 $${(order.paidTerminal ?? 0).toFixed(2)}`
                : order.paymentMethod === 'cash'
                  ? `💵 Efectivo — $${(order.paidCash ?? total).toFixed(2)}`
                  : `💳 Terminal — $${(order.paidTerminal ?? total).toFixed(2)}`}
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
  const { orders, updateOrderStatus } = useApp();
  const [chargingOrder, setChargingOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('preparing');

  // Keep edited order in sync with context (so newly added items appear live)
  const liveEditingOrder = editingOrder
    ? orders.find(o => o.id === editingOrder.id) ?? null
    : null;

  // Keep the charging order in sync so the remaining bill updates live as
  // each split payment is applied.
  const liveChargingOrder = chargingOrder
    ? orders.find(o => o.id === chargingOrder.id) ?? null
    : null;

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
              onCharge={activeTab !== 'completed' ? setChargingOrder : undefined}
              onEdit={activeTab !== 'completed' ? setEditingOrder : undefined}
            />
          ))}
        </div>
      )}

      {/* Charge Modal (split / mixed payments) */}
      {liveChargingOrder && (
        <ChargeModal
          order={liveChargingOrder}
          onClose={() => setChargingOrder(null)}
        />
      )}

      {/* Edit Order Modal */}
      {liveEditingOrder && (
        <EditOrderModal
          order={liveEditingOrder}
          onClose={() => setEditingOrder(null)}
        />
      )}
    </div>
  );
}
