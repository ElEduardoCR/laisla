'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CartDrawer({ open, onClose }: Props) {
  const {
    cart, cartTotal, customerName, setCustomerName,
    takeout, setTakeout, updateCartQuantity, removeFromCart,
    clearCart, placeOrder,
  } = useApp();
  const [nameError, setNameError] = useState(false);
  const [success, setSuccess] = useState(false);

  const handlePlaceOrder = () => {
    if (!customerName.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    const ok = placeOrder();
    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    }
  };

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="bg-primary text-white p-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            🛒 Pedido
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-xl font-bold text-success">¡Pedido enviado a cocina!</p>
            </div>
          </div>
        ) : cart.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">🍽️</div>
              <p className="font-medium">El carrito está vacío</p>
            </div>
          </div>
        ) : (
          <>
            {/* Customer Name */}
            <div className="p-4 border-b shrink-0">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Nombre del cliente *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => {
                  setCustomerName(e.target.value);
                  if (e.target.value.trim()) setNameError(false);
                }}
                placeholder="Nombre obligatorio..."
                className={`w-full px-3 py-2.5 border-2 rounded-lg text-sm focus:outline-none transition-colors ${
                  nameError
                    ? 'border-red-400 bg-red-50 focus:border-red-500'
                    : 'border-gray-200 focus:border-primary'
                }`}
              />
              {nameError && (
                <p className="text-red-500 text-xs mt-1 font-medium">
                  El nombre del cliente es obligatorio
                </p>
              )}
            </div>

            {/* Takeout toggle */}
            <div className="px-4 py-3 border-b shrink-0">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  📦 Para llevar
                </span>
                <div
                  onClick={() => setTakeout(!takeout)}
                  className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                    takeout ? 'bg-accent' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      takeout ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </div>
              </label>
            </div>

            {/* Items + buttons all scrollable together */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {cart.map(item => (
                  <div
                    key={item.product.id}
                    className="bg-gray-50 rounded-lg p-3 flex items-center gap-3"
                  >
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
                        onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                        className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-bold transition-colors"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                      <button
                        onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                        className="w-7 h-7 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center text-sm font-bold transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-red-400 hover:text-red-600 text-lg transition-colors shrink-0"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>

              {/* Total + Buttons (flow with content, not fixed) */}
              <div className="border-t mt-4 pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-medium">Total:</span>
                  <span className="text-2xl font-bold text-primary">${cartTotal.toFixed(2)}</span>
                </div>
                <button
                  onClick={handlePlaceOrder}
                  className="w-full bg-success hover:bg-success-dark text-white font-bold py-3 rounded-lg transition-colors text-sm"
                >
                  ✅ Confirmar Pedido
                </button>
                <button
                  onClick={clearCart}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2.5 rounded-lg transition-colors text-sm"
                >
                  Vaciar carrito
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
