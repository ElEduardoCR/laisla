'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Order, Product, CartItem } from '@/types';
import { generateId } from '@/lib/database';

interface Props {
  order: Order;
  onClose: () => void;
}

export default function EditOrderModal({ order, onClose }: Props) {
  const {
    categories,
    products,
    appendItemsToOrder,
    decreaseOrderItemQuantity,
    removeOrderItem,
  } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [extraItems, setExtraItems] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const canEdit =
    order.status === 'preparing' ||
    order.status === 'pending' ||
    order.status === 'ready';

  const filtered = selectedCategory
    ? products.filter(p => p.categoryId === selectedCategory)
    : products;
  const availableProducts = filtered.filter(p => p.available);

  const extraTotal = extraItems.reduce(
    (s, i) => s + i.product.price * i.quantity,
    0
  );
  const extraCount = extraItems.reduce((s, i) => s + i.quantity, 0);

  const addProduct = (product: Product) => {
    setExtraItems(prev => {
      const existing = prev.find(item => item.product.id === product.id && !item.notes);
      if (existing) {
        return prev.map(item =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { id: generateId(), product, quantity: 1, notes: '' }];
    });
  };

  const updateQty = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setExtraItems(prev => prev.filter(i => i.id !== cartItemId));
      return;
    }
    setExtraItems(prev =>
      prev.map(i => (i.id === cartItemId ? { ...i, quantity } : i))
    );
  };

  const updateNotes = (cartItemId: string, notes: string) => {
    setExtraItems(prev =>
      prev.map(i => (i.id === cartItemId ? { ...i, notes } : i))
    );
  };

  const removeItem = (cartItemId: string) => {
    setExtraItems(prev => prev.filter(i => i.id !== cartItemId));
  };

  const handleConfirm = async () => {
    if (extraItems.length === 0 || !canEdit) return;
    setSaving(true);
    const ok = await appendItemsToOrder(order.id, extraItems);
    setSaving(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-primary text-white p-4 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-lg font-bold">✏️ Agregar productos</h2>
              <p className="text-sm text-white/80">{order.customerName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-2xl leading-none"
            >
              ✕
            </button>
          </div>

          {!canEdit ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-5xl mb-3">🔒</div>
              <p className="font-medium">
                Este pedido ya fue cobrado y no se puede modificar.
              </p>
            </div>
          ) : success ? (
            <div className="p-10 text-center">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-xl font-bold text-success">
                ¡Productos agregados!
              </p>
            </div>
          ) : (
            <>
              {/* Category tabs */}
              <div className="px-4 py-3 border-b shrink-0">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      selectedCategory === null
                        ? 'bg-primary text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-primary/10 border border-gray-200'
                    }`}
                  >
                    Todos
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        selectedCategory === cat.id
                          ? 'bg-primary text-white shadow-md'
                          : 'bg-white text-gray-600 hover:bg-primary/10 border border-gray-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products grid */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Existing items in the order */}
                {order.items.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                      Productos en el pedido
                    </h3>
                    <div className="space-y-2">
                      {order.items.map(item => (
                        <div
                          key={item.id}
                          className="bg-white border rounded-lg p-3 flex items-center gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {item.productName}
                            </p>
                            <p className="text-gray-500 text-xs">
                              ${item.productPrice.toFixed(2)} c/u · subtotal $
                              {(item.productPrice * item.quantity).toFixed(2)}
                            </p>
                            {item.notes && (
                              <p className="text-xs text-red-500 font-medium mt-0.5">
                                ⚠️ {item.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => decreaseOrderItemQuantity(order.id, item.id, 1)}
                              title={
                                item.quantity > 1
                                  ? 'Quitar 1'
                                  : 'Eliminar producto'
                              }
                              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center text-base font-bold transition-colors"
                            >
                              −
                            </button>
                            <span className="w-8 text-center font-bold text-sm">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => removeOrderItem(order.id, item.id)}
                              title="Eliminar línea completa"
                              className="w-8 h-8 rounded-full text-red-400 hover:text-white hover:bg-red-500 flex items-center justify-center text-base transition-colors"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Agregar más productos
                </h3>
                {availableProducts.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <div className="text-4xl mb-2">🍤</div>
                    <p className="text-sm">No hay productos disponibles</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {availableProducts.map(product => {
                      const qty = extraItems
                        .filter(i => i.product.id === product.id)
                        .reduce((s, i) => s + i.quantity, 0);
                      return (
                        <button
                          key={product.id}
                          onClick={() => addProduct(product)}
                          className="relative bg-white rounded-xl p-3 shadow-sm border-2 border-transparent hover:border-primary hover:shadow-md active:scale-[0.98] text-left transition-all"
                        >
                          {qty > 0 && (
                            <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                              {qty}
                            </span>
                          )}
                          <h3 className="font-semibold text-foreground text-sm leading-tight mb-1">
                            {product.name}
                          </h3>
                          <span className="text-primary font-bold text-base">
                            ${product.price.toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected extras */}
                {extraItems.length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                      Productos por agregar
                    </h3>
                    <div className="space-y-2">
                      {extraItems.map(item => (
                        <div
                          key={item.id}
                          className="bg-gray-50 rounded-lg p-3 flex flex-col gap-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">
                                {item.product.name}
                              </p>
                              <p className="text-primary font-bold text-sm">
                                ${(item.product.price * item.quantity).toFixed(2)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => updateQty(item.id, item.quantity - 1)}
                                className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-bold"
                              >
                                −
                              </button>
                              <span className="w-8 text-center font-bold text-sm">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateQty(item.id, item.quantity + 1)}
                                className="w-7 h-7 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center text-sm font-bold"
                              >
                                +
                              </button>
                            </div>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="text-red-400 hover:text-red-600 text-lg shrink-0"
                            >
                              🗑️
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="Agrega nota (ej: sin cebolla)..."
                            value={item.notes || ''}
                            onChange={e => updateNotes(item.id, e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border rounded bg-white text-gray-700 focus:outline-none focus:border-primary placeholder:text-gray-400"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t p-4 shrink-0 bg-white">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-gray-600 font-medium">
                    {extraCount} {extraCount === 1 ? 'producto' : 'productos'} por agregar
                  </span>
                  <span className="text-xl font-bold text-primary">
                    +${extraTotal.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={extraItems.length === 0 || saving}
                  className={`w-full font-bold py-3 rounded-lg text-sm transition-colors ${
                    extraItems.length === 0 || saving
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-success hover:bg-success-dark text-white'
                  }`}
                >
                  {saving ? 'Agregando...' : '✅ Agregar al pedido'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
