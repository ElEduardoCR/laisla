'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Order } from '@/types';

const DENOMINATIONS = [
  { label: '$20', value: 20 },
  { label: '$50', value: 50 },
  { label: '$100', value: 100 },
  { label: '$200', value: 200 },
  { label: '$500', value: 500 },
  { label: '$1000', value: 1000 },
];

interface Props {
  order: Order;
  onClose: () => void;
}

export default function ChargeModal({ order, onClose }: Props) {
  const { chargeOrderItems } = useApp();

  // How many units of each line are selected for THIS charge.
  const [selection, setSelection] = useState<Record<string, number>>({});
  // Amount of this charge that goes on the card terminal.
  const [terminalAmount, setTerminalAmount] = useState(0);
  // Cash tendered by the customer (for the cash part).
  const [amountPaid, setAmountPaid] = useState(0);
  const [denomBreakdown, setDenomBreakdown] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const remainingOf = (itemId: string) => {
    const item = order.items.find(i => i.id === itemId);
    if (!item) return 0;
    return item.quantity - (item.paidQuantity ?? 0);
  };

  const pendingItems = order.items.filter(i => i.quantity - (i.paidQuantity ?? 0) > 0);

  // Whole-bill remaining (what's still owed across all lines).
  const billRemaining = pendingItems.reduce(
    (s, i) => s + i.productPrice * (i.quantity - (i.paidQuantity ?? 0)),
    0
  );

  // This charge's total (only the selected units).
  const chargeTotal = pendingItems.reduce(
    (s, i) => s + i.productPrice * (selection[i.id] || 0),
    0
  );

  const terminalApplied = Math.min(Math.max(terminalAmount, 0), chargeTotal);
  const cashNeeded = Math.max(0, chargeTotal - terminalApplied);
  const change = amountPaid - cashNeeded;

  const hasSelection = chargeTotal > 0;
  const cashCovered = cashNeeded === 0 || amountPaid >= cashNeeded;
  const canConfirm = hasSelection && cashCovered && !saving;

  const setQty = (itemId: string, qty: number) => {
    const max = remainingOf(itemId);
    const clamped = Math.min(Math.max(qty, 0), max);
    setSelection(prev => ({ ...prev, [itemId]: clamped }));
  };

  const selectAllRemaining = () => {
    const next: Record<string, number> = {};
    pendingItems.forEach(i => {
      next[i.id] = i.quantity - (i.paidQuantity ?? 0);
    });
    setSelection(next);
  };

  const resetCash = () => {
    setAmountPaid(0);
    setDenomBreakdown({});
  };

  const addDenomination = (value: number) => {
    setAmountPaid(prev => prev + value);
    setDenomBreakdown(prev => ({ ...prev, [value]: (prev[value] || 0) + 1 }));
  };

  const exactCash = () => {
    setAmountPaid(cashNeeded);
    setDenomBreakdown({});
  };

  const allOnTerminal = () => {
    setTerminalAmount(chargeTotal);
    resetCash();
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSaving(true);

    const selections = pendingItems
      .filter(i => (selection[i.id] || 0) > 0)
      .map(i => ({ itemId: i.id, quantity: selection[i.id] }));

    // Will the whole order be fully paid after this charge?
    const fullyPaidAfter = pendingItems.every(
      i => (i.paidQuantity ?? 0) + (selection[i.id] || 0) >= i.quantity
    );

    const ok = await chargeOrderItems(order.id, selections, {
      cashApplied: cashNeeded,
      terminalApplied,
    });

    setSaving(false);
    if (!ok) return;

    if (fullyPaidAfter) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1300);
    } else {
      // Reset for the next person; the remaining bill will have gone down.
      setSelection({});
      setTerminalAmount(0);
      resetCash();
    }
  };

  const paidSoFar = (order.paidCash ?? 0) + (order.paidTerminal ?? 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-primary text-white p-4 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-lg font-bold">💰 Cobrar</h2>
              <p className="text-sm text-white/80">{order.customerName}</p>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">
              ✕
            </button>
          </div>

          {success ? (
            <div className="p-10 text-center">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-xl font-bold text-success">¡Cuenta saldada!</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                {/* Remaining bill */}
                <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Resta de la cuenta</span>
                    {paidSoFar > 0 && (
                      <p className="text-xs text-success font-medium">
                        Ya pagado: ${paidSoFar.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <span className="font-bold text-2xl text-primary">${billRemaining.toFixed(2)}</span>
                </div>

                {/* Item selection */}
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide">
                      ¿Qué se cobra?
                    </h3>
                    <button
                      onClick={selectAllRemaining}
                      className="text-xs font-semibold text-primary hover:text-primary-dark"
                    >
                      Seleccionar todo
                    </button>
                  </div>

                  <div className="space-y-2">
                    {pendingItems.map(item => {
                      const remaining = item.quantity - (item.paidQuantity ?? 0);
                      const sel = selection[item.id] || 0;
                      return (
                        <div
                          key={item.id}
                          className={`rounded-lg p-3 border transition-colors ${
                            sel > 0 ? 'border-accent bg-accent/5' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">
                                {item.productName}
                              </p>
                              <p className="text-xs text-gray-500">
                                ${item.productPrice.toFixed(2)} c/u · quedan {remaining}
                                {(item.paidQuantity ?? 0) > 0 && (
                                  <span className="text-success"> · {item.paidQuantity} pagado(s)</span>
                                )}
                              </p>
                              {item.notes && (
                                <p className="text-xs text-red-500 font-medium mt-0.5">⚠️ {item.notes}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => setQty(item.id, sel - 1)}
                                disabled={sel <= 0}
                                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-40 flex items-center justify-center text-base font-bold transition-colors"
                              >
                                −
                              </button>
                              <span className="w-8 text-center font-bold text-sm">{sel}</span>
                              <button
                                onClick={() => setQty(item.id, sel + 1)}
                                disabled={sel >= remaining}
                                className="w-8 h-8 rounded-full bg-primary/10 hover:bg-primary/20 disabled:opacity-40 text-primary flex items-center justify-center text-base font-bold transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {sel > 0 && (
                            <div className="text-right text-xs font-semibold text-accent-dark mt-1">
                              ${(item.productPrice * sel).toFixed(2)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Charge total */}
                <div className="px-4 py-3 border-b bg-primary/5 flex justify-between items-center">
                  <span className="font-bold text-gray-700">A cobrar ahora:</span>
                  <span className="font-bold text-2xl text-primary">${chargeTotal.toFixed(2)}</span>
                </div>

                {/* Terminal (card) */}
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide">
                      💳 Tarjeta
                    </h3>
                    <button
                      onClick={allOnTerminal}
                      disabled={chargeTotal <= 0}
                      className="text-xs font-semibold text-primary hover:text-primary-dark disabled:opacity-40"
                    >
                      Todo a tarjeta
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-bold">$</span>
                    <input
                      type="number"
                      min={0}
                      max={chargeTotal}
                      value={terminalAmount === 0 ? '' : terminalAmount}
                      onChange={e => setTerminalAmount(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                    {terminalApplied > 0 && (
                      <button
                        onClick={() => setTerminalAmount(0)}
                        className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                      >
                        limpiar
                      </button>
                    )}
                  </div>
                </div>

                {/* Cash */}
                <div className="p-4">
                  <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-2">
                    💵 Efectivo {cashNeeded > 0 && <span className="text-gray-400">(faltan ${cashNeeded.toFixed(2)})</span>}
                  </h3>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {DENOMINATIONS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => addDenomination(d.value)}
                        className="relative bg-white border-2 border-gray-200 hover:border-accent hover:bg-accent/5 rounded-xl py-2.5 text-center font-bold transition-all active:scale-95"
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

                  <div className="bg-gray-50 rounded-xl p-3 mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-600">Pagó con:</span>
                      <span className="font-bold text-lg">${amountPaid.toFixed(2)}</span>
                    </div>
                    {cashNeeded > 0 && (
                      <div className={`flex justify-between items-center pt-1 border-t ${change >= 0 ? 'text-success' : 'text-red-500'}`}>
                        <span className="text-sm font-medium">{change >= 0 ? 'Cambio:' : 'Falta:'}</span>
                        <span className="font-bold text-xl">${Math.abs(change).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={exactCash}
                      disabled={cashNeeded <= 0}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 font-semibold py-2 rounded-lg text-sm transition-colors"
                    >
                      Monto exacto
                    </button>
                    <button
                      onClick={resetCash}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg text-sm transition-colors"
                    >
                      Reiniciar
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer confirm */}
              <div className="border-t p-4 shrink-0 bg-white">
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className={`w-full font-bold py-3 rounded-xl text-sm transition-colors ${
                    canConfirm
                      ? 'bg-success hover:bg-success-dark text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {saving
                    ? 'Cobrando...'
                    : !hasSelection
                      ? 'Selecciona productos'
                      : !cashCovered
                        ? `Falta efectivo ($${Math.abs(change).toFixed(2)})`
                        : `💰 Cobrar $${chargeTotal.toFixed(2)}` +
                          (terminalApplied > 0 && cashNeeded > 0
                            ? ` (💵 $${cashNeeded.toFixed(2)} + 💳 $${terminalApplied.toFixed(2)})`
                            : terminalApplied > 0
                              ? ' con tarjeta'
                              : change > 0
                                ? ` · Cambio $${change.toFixed(2)}`
                                : '')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
