'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { getConfigValue, setConfigValue, fetchReportsByMonth } from '@/lib/database';
import { DayReport } from '@/types';

// ══════════════════════════════════════════════
// PASSWORD GATE (no sessionStorage — always asks)
// ══════════════════════════════════════════════

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError(false);
    const stored = await getConfigValue('admin_password');
    if (password === stored) {
      onUnlock();
    } else {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🔒</div>
          <h1 className="text-xl font-bold text-foreground">Configuración</h1>
          <p className="text-sm text-gray-500 mt-1">Ingresa la contraseña para acceder</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(false); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Contraseña..."
          className={`w-full px-4 py-3 border-2 rounded-xl text-center text-lg font-medium focus:outline-none transition-colors ${
            error ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-primary'
          }`}
          autoFocus
        />
        {error && <p className="text-red-500 text-sm text-center mt-2 font-medium">Contraseña incorrecta</p>}
        <button
          onClick={handleSubmit}
          disabled={loading || !password}
          className="w-full mt-4 bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// MENU MODULE (categories + products)
// ══════════════════════════════════════════════

function MenuModule() {
  const {
    categories, products,
    addCategory, updateCategory, deleteCategory,
    addProduct, updateProduct, deleteProduct,
  } = useApp();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [newProductForm, setNewProductForm] = useState<{ categoryId: string; name: string; price: string } | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editProductData, setEditProductData] = useState({ name: '', price: '' });

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    addCategory(newCategoryName.trim());
    setNewCategoryName('');
  };

  const handleSaveCategory = (id: string) => {
    if (!editCategoryName.trim()) return;
    updateCategory(id, editCategoryName.trim());
    setEditingCategory(null);
  };

  const handleAddProduct = (categoryId: string) => {
    if (!newProductForm || !newProductForm.name.trim() || !newProductForm.price) return;
    addProduct({
      categoryId,
      name: newProductForm.name.trim(),
      price: parseFloat(newProductForm.price),
      available: true,
    });
    setNewProductForm(null);
  };

  const handleSaveProduct = (id: string) => {
    if (!editProductData.name.trim() || !editProductData.price) return;
    updateProduct(id, {
      name: editProductData.name.trim(),
      price: parseFloat(editProductData.price),
    });
    setEditingProduct(null);
  };

  return (
    <div>
      {/* Add Category */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
        <h2 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">Nueva Categoría</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
            placeholder="Nombre de la categoría..."
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
          />
          <button onClick={handleAddCategory} className="bg-primary hover:bg-primary-dark text-white font-bold px-5 py-2.5 rounded-lg transition-colors text-sm shrink-0">
            + Agregar
          </button>
        </div>
      </div>

      {/* Categories accordion */}
      <div className="space-y-3">
        {categories.map(cat => {
          const catProducts = products.filter(p => p.categoryId === cat.id);
          const isExpanded = expandedCategory === cat.id;

          return (
            <div key={cat.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 p-4">
                <button onClick={() => setExpandedCategory(isExpanded ? null : cat.id)} className="flex-1 flex items-center gap-3 text-left">
                  <span className={`text-sm transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                  {editingCategory === cat.id ? (
                    <input type="text" value={editCategoryName} onChange={e => setEditCategoryName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory(cat.id); if (e.key === 'Escape') setEditingCategory(null); }}
                      onClick={e => e.stopPropagation()} className="flex-1 px-2 py-1 border-2 border-primary rounded text-sm focus:outline-none" autoFocus />
                  ) : (
                    <span className="font-bold text-foreground">{cat.name}</span>
                  )}
                  <span className="text-xs text-gray-400 font-medium">{catProducts.length} producto{catProducts.length !== 1 ? 's' : ''}</span>
                </button>
                <div className="flex gap-1 shrink-0">
                  {editingCategory === cat.id ? (
                    <>
                      <button onClick={() => handleSaveCategory(cat.id)} className="text-success hover:bg-success/10 px-2 py-1 rounded text-sm font-bold">✓</button>
                      <button onClick={() => setEditingCategory(null)} className="text-gray-400 hover:bg-gray-100 px-2 py-1 rounded text-sm font-bold">✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingCategory(cat.id); setEditCategoryName(cat.name); }} className="text-gray-400 hover:text-primary hover:bg-primary/10 px-2 py-1 rounded text-sm">✏️</button>
                      <button onClick={() => { if (confirm(`¿Eliminar "${cat.name}" y todos sus productos?`)) deleteCategory(cat.id); }} className="text-gray-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded text-sm">🗑️</button>
                    </>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t px-4 pb-4">
                  {catProducts.length > 0 ? (
                    <div className="divide-y">
                      {catProducts.map(prod => (
                        <div key={prod.id} className="flex items-center gap-3 py-3">
                          {editingProduct === prod.id ? (
                            <>
                              <input type="text" value={editProductData.name} onChange={e => setEditProductData(d => ({ ...d, name: e.target.value }))}
                                className="flex-1 px-2 py-1.5 border-2 border-primary rounded text-sm focus:outline-none" />
                              <input type="number" value={editProductData.price} onChange={e => setEditProductData(d => ({ ...d, price: e.target.value }))}
                                className="w-24 px-2 py-1.5 border-2 border-primary rounded text-sm focus:outline-none" />
                              <button onClick={() => handleSaveProduct(prod.id)} className="text-success font-bold text-sm">✓</button>
                              <button onClick={() => setEditingProduct(null)} className="text-gray-400 font-bold text-sm">✕</button>
                            </>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <span className={`font-medium text-sm ${!prod.available ? 'text-gray-400 line-through' : 'text-foreground'}`}>{prod.name}</span>
                              </div>
                              <span className="text-primary font-bold text-sm shrink-0">${prod.price.toFixed(2)}</span>
                              <button onClick={() => updateProduct(prod.id, { available: !prod.available })}
                                className={`text-xs font-bold px-2 py-1 rounded-full ${prod.available ? 'bg-success/10 text-success' : 'bg-red-50 text-red-500'}`}>
                                {prod.available ? 'Activo' : 'Inactivo'}
                              </button>
                              <button onClick={() => { setEditingProduct(prod.id); setEditProductData({ name: prod.name, price: prod.price.toString() }); }}
                                className="text-gray-400 hover:text-primary text-sm">✏️</button>
                              <button onClick={() => { if (confirm(`¿Eliminar "${prod.name}"?`)) deleteProduct(prod.id); }}
                                className="text-gray-400 hover:text-red-500 text-sm">🗑️</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm py-3">No hay productos en esta categoría</p>
                  )}

                  {newProductForm?.categoryId === cat.id ? (
                    <div className="flex items-center gap-2 pt-3 border-t mt-2">
                      <input type="text" value={newProductForm.name} onChange={e => setNewProductForm(f => f ? { ...f, name: e.target.value } : f)}
                        placeholder="Nombre del producto..." className="flex-1 px-2 py-1.5 border-2 border-gray-200 rounded text-sm focus:outline-none focus:border-primary" autoFocus />
                      <input type="number" value={newProductForm.price} onChange={e => setNewProductForm(f => f ? { ...f, price: e.target.value } : f)}
                        placeholder="Precio" className="w-24 px-2 py-1.5 border-2 border-gray-200 rounded text-sm focus:outline-none focus:border-primary" />
                      <button onClick={() => handleAddProduct(cat.id)} className="bg-success hover:bg-success-dark text-white font-bold px-3 py-1.5 rounded text-sm">✓</button>
                      <button onClick={() => setNewProductForm(null)} className="text-gray-400 hover:text-gray-600 font-bold text-sm">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setNewProductForm({ categoryId: cat.id, name: '', price: '' })}
                      className="mt-3 text-primary hover:text-primary-dark font-semibold text-sm">+ Agregar producto</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📋</div>
          <p className="font-medium">No hay categorías aún</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// DAY MODULE (open/close + expenses)
// ══════════════════════════════════════════════

function DayModule() {
  const { activeSession, isDayOpen, openDay, closeDay, orders, expenses, addExpense, removeExpense } = useApp();
  const [initialCash, setInitialCash] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [closeSummary, setCloseSummary] = useState<{ totalSales: number; totalCash: number; totalTerminal: number; totalExpenses: number; finalCash: number } | null>(null);
  const [closing, setClosing] = useState(false);

  const handleOpenDay = async () => {
    const cash = parseFloat(initialCash) || 0;
    await openDay(cash);
    setInitialCash('');
  };

  const handleCloseDay = async () => {
    setClosing(true);
    const totals = await closeDay();
    if (totals) setCloseSummary(totals);
    setClosing(false);
  };

  const handleAddExpense = async () => {
    if (!expDesc.trim() || !expAmount) return;
    await addExpense(expDesc.trim(), parseFloat(expAmount));
    setExpDesc('');
    setExpAmount('');
  };

  // Product breakdown for current session
  const sessionOrders = isDayOpen && activeSession
    ? orders.filter(o => o.daySessionId === activeSession.id && o.status === 'completed')
    : [];

  const productBreakdown: Record<string, { name: string; qty: number; total: number }> = {};
  for (const order of sessionOrders) {
    for (const item of order.items) {
      const key = item.productName;
      if (!productBreakdown[key]) productBreakdown[key] = { name: key, qty: 0, total: 0 };
      productBreakdown[key].qty += item.quantity;
      productBreakdown[key].total += item.productPrice * item.quantity;
    }
  }

  const runningTotalSales = sessionOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.productPrice * i.quantity, 0), 0);
  const runningTotalExp = expenses.reduce((s, e) => s + e.amount, 0);

  // Close summary modal
  if (closeSummary) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-xl font-bold text-foreground">Corte de Caja</h2>
          <p className="text-sm text-gray-500">Día cerrado exitosamente</p>
        </div>
        <div className="space-y-3 mb-6">
          <div className="flex justify-between py-2 border-b"><span className="text-gray-600">Venta total:</span><span className="font-bold text-lg">${closeSummary.totalSales.toFixed(2)}</span></div>
          <div className="flex justify-between py-2 border-b"><span className="text-gray-600">💵 Efectivo:</span><span className="font-bold text-success">${closeSummary.totalCash.toFixed(2)}</span></div>
          <div className="flex justify-between py-2 border-b"><span className="text-gray-600">💳 Terminal:</span><span className="font-bold text-primary">${closeSummary.totalTerminal.toFixed(2)}</span></div>
          <div className="flex justify-between py-2 border-b"><span className="text-gray-600">📝 Gastos:</span><span className="font-bold text-red-500">-${closeSummary.totalExpenses.toFixed(2)}</span></div>
          <div className="flex justify-between py-2 bg-primary/5 rounded-lg px-3"><span className="font-bold text-lg">Efectivo en caja:</span><span className="font-bold text-2xl text-primary">${closeSummary.finalCash.toFixed(2)}</span></div>
        </div>
        <button onClick={() => setCloseSummary(null)} className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl">
          Aceptar
        </button>
      </div>
    );
  }

  if (!isDayOpen) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🌅</div>
          <h2 className="text-xl font-bold text-foreground">Iniciar Día</h2>
          <p className="text-sm text-gray-500 mt-1">Ingresa el efectivo inicial en caja para comenzar</p>
        </div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Efectivo inicial en caja</label>
        <div className="flex gap-2 mb-4">
          <span className="flex items-center px-3 bg-gray-100 rounded-l-xl font-bold text-lg text-gray-500">$</span>
          <input
            type="number"
            value={initialCash}
            onChange={e => setInitialCash(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleOpenDay()}
            placeholder="0.00"
            className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-r-xl text-lg font-medium focus:outline-none focus:border-primary"
          />
        </div>
        <button onClick={handleOpenDay} className="w-full bg-success hover:bg-success-dark text-white font-bold py-3 rounded-xl text-lg transition-colors">
          🌅 Iniciar Día
        </button>
      </div>
    );
  }

  // Day is open — show status + expenses + close button
  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="bg-success/10 border-2 border-success rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-success text-lg">🟢 Día Abierto</h3>
            <p className="text-sm text-gray-600">
              Efectivo inicial: <span className="font-bold">${activeSession?.initialCash.toFixed(2)}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Venta actual</p>
            <p className="font-bold text-xl text-primary">${runningTotalSales.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Product breakdown */}
      {Object.keys(productBreakdown).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">Venta por Producto</h3>
          <div className="divide-y">
            {Object.values(productBreakdown).sort((a, b) => b.total - a.total).map(p => (
              <div key={p.name} className="flex justify-between py-2 text-sm">
                <span className="text-gray-700"><span className="font-semibold">{p.qty}x</span> {p.name}</span>
                <span className="font-bold text-primary">${p.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">Gastos del Día</h3>

        <div className="flex gap-2 mb-4">
          <input type="text" value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="Descripción..."
            className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary" />
          <input type="number" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="$0"
            className="w-24 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary" />
          <button onClick={handleAddExpense} className="bg-accent hover:bg-accent-dark text-white font-bold px-4 py-2 rounded-lg text-sm shrink-0">+</button>
        </div>

        {expenses.length > 0 ? (
          <div className="divide-y">
            {expenses.map(exp => (
              <div key={exp.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700">{exp.description}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-red-500">-${exp.amount.toFixed(2)}</span>
                  <button onClick={() => removeExpense(exp.id)} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                </div>
              </div>
            ))}
            <div className="flex justify-between py-2 font-bold">
              <span>Total gastos:</span>
              <span className="text-red-500">-${runningTotalExp.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No hay gastos registrados</p>
        )}
      </div>

      {/* Close day */}
      <button onClick={handleCloseDay} disabled={closing}
        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl text-lg transition-colors disabled:opacity-50">
        {closing ? 'Cerrando...' : '🌙 Cerrar Día y Corte de Caja'}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════
// PASSWORD MODULE
// ══════════════════════════════════════════════

function PasswordModule() {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = async () => {
    setMsg(null);
    const stored = await getConfigValue('admin_password');
    if (currentPw !== stored) { setMsg({ type: 'error', text: 'Contraseña actual incorrecta' }); return; }
    if (newPw.length < 3) { setMsg({ type: 'error', text: 'Mínimo 3 caracteres' }); return; }
    if (newPw !== confirmPw) { setMsg({ type: 'error', text: 'Las contraseñas no coinciden' }); return; }
    await setConfigValue('admin_password', newPw);
    setMsg({ type: 'success', text: 'Contraseña actualizada' });
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 max-w-md">
      <h3 className="font-bold text-lg mb-4">🔑 Cambiar Contraseña</h3>
      <div className="space-y-3">
        <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Contraseña actual"
          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary" />
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Nueva contraseña"
          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary" />
        <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirmar nueva contraseña"
          onKeyDown={e => e.key === 'Enter' && handleChange()}
          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary" />
      </div>
      {msg && <p className={`text-sm mt-2 font-medium ${msg.type === 'success' ? 'text-success' : 'text-red-500'}`}>{msg.text}</p>}
      <button onClick={handleChange} className="w-full mt-4 bg-primary hover:bg-primary-dark text-white font-bold py-2.5 rounded-lg transition-colors text-sm">
        Guardar Contraseña
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════
// REPORTES MODULE (calendar + day detail modal)
// ══════════════════════════════════════════════

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function DayDetailModal({
  date,
  reports,
  onClose,
}: {
  date: string;
  reports: DayReport[];
  onClose: () => void;
}) {
  const dayTotalSales = reports.reduce((s, r) => s + r.totalSales, 0);
  const dayTotalCash = reports.reduce((s, r) => s + r.totalCash, 0);
  const dayTotalTerminal = reports.reduce((s, r) => s + r.totalTerminal, 0);
  const dayTotalExpenses = reports.reduce((s, r) => s + r.totalExpenses, 0);

  // Aggregate product breakdown across all reports (turnos) of that day
  const productBreakdown: Record<string, { name: string; qty: number; total: number }> = {};
  for (const r of reports) {
    for (const p of r.products) {
      const key = p.name;
      if (!productBreakdown[key]) productBreakdown[key] = { name: key, qty: 0, total: 0 };
      productBreakdown[key].qty += p.qty;
      productBreakdown[key].total += p.total;
    }
  }

  // Aggregate expenses across all reports
  const allExpenses: { description: string; amount: number }[] = [];
  for (const r of reports) {
    for (const e of r.expensesList) allExpenses.push(e);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="bg-primary text-white p-4 rounded-t-2xl flex items-center justify-between sticky top-0">
            <div>
              <h2 className="text-lg font-bold">📊 Resumen del Día</h2>
              <p className="text-sm text-white/80">{date}</p>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">✕</button>
          </div>

          <div className="p-4 border-b">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 font-medium">Venta Total</p>
                <p className="font-bold text-xl text-foreground">${dayTotalSales.toFixed(2)}</p>
              </div>
              <div className="bg-success/10 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 font-medium">💵 Efectivo</p>
                <p className="font-bold text-xl text-success">${dayTotalCash.toFixed(2)}</p>
              </div>
              <div className="bg-primary/10 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 font-medium">💳 Terminal</p>
                <p className="font-bold text-xl text-primary">${dayTotalTerminal.toFixed(2)}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 font-medium">📝 Gastos</p>
                <p className="font-bold text-xl text-red-500">-${dayTotalExpenses.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {reports.length > 1 && (
            <div className="p-4 border-b">
              <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">
                Turnos ({reports.length})
              </h3>
              <div className="space-y-2">
                {reports.map((r, i) => (
                  <div key={r.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div className="flex justify-between font-semibold mb-1">
                      <span>Turno {i + 1}</span>
                      <span className="text-primary">${r.totalSales.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Inicio: ${r.initialCash.toFixed(2)}</span>
                      <span>💵 ${r.totalCash.toFixed(2)}</span>
                      <span>💳 ${r.totalTerminal.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 border-b">
            <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">Productos Vendidos</h3>
            {Object.keys(productBreakdown).length > 0 ? (
              <div className="divide-y">
                {Object.values(productBreakdown).sort((a, b) => b.total - a.total).map(p => (
                  <div key={p.name} className="flex justify-between py-2 text-sm">
                    <span className="text-gray-700">
                      <span className="font-semibold text-foreground">{p.qty}x</span> {p.name}
                    </span>
                    <span className="font-bold text-primary">${p.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm py-2">Sin productos vendidos</p>
            )}
          </div>

          {allExpenses.length > 0 && (
            <div className="p-4">
              <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">Gastos</h3>
              <div className="divide-y">
                {allExpenses.map((e, i) => (
                  <div key={i} className="flex justify-between py-2 text-sm">
                    <span className="text-gray-700">{e.description}</span>
                    <span className="font-bold text-red-500">-${e.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ReportesModule() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reports, setReports] = useState<DayReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReportsByMonth(year, month);
      setReports(data);
    } catch (err) {
      console.error('fetchReportsByMonth error:', err);
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  // Group reports by day-of-month using closedAt
  const reportsByDay: Record<number, DayReport[]> = {};
  for (const r of reports) {
    const d = new Date(r.closedAt).getDate();
    if (!reportsByDay[d]) reportsByDay[d] = [];
    reportsByDay[d].push(r);
  }

  const monthTotalSales = reports.reduce((s, r) => s + r.totalSales, 0);
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOffset = getFirstDayOfWeek(year, month);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedReports = selectedDay ? (reportsByDay[selectedDay] || []) : [];
  const selectedDateStr = selectedDay
    ? `${selectedDay} de ${MONTH_NAMES[month - 1]} ${year}`
    : '';

  return (
    <div>
      {/* Month navigation + total */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-lg transition-colors">
            ←
          </button>
          <div className="text-center">
            <h2 className="text-lg font-bold text-foreground">{MONTH_NAMES[month - 1]} {year}</h2>
          </div>
          <button onClick={nextMonth} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-lg transition-colors">
            →
          </button>
        </div>
        <div className="bg-primary/10 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 font-medium">Venta del Mes</p>
          <p className="font-bold text-2xl text-primary">
            {loading ? '...' : `$${monthTotalSales.toFixed(2)}`}
          </p>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="aspect-square" />;
            }
            const dayReports = reportsByDay[day];
            const hasSales = dayReports && dayReports.length > 0;
            const dayTotal = hasSales ? dayReports.reduce((s, r) => s + r.totalSales, 0) : 0;
            const isToday = day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();

            return (
              <button
                key={day}
                onClick={() => hasSales && setSelectedDay(day)}
                disabled={!hasSales}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all relative ${
                  hasSales
                    ? 'bg-success/10 hover:bg-success/20 border-2 border-success/30 cursor-pointer'
                    : isToday
                      ? 'bg-primary/5 border-2 border-primary/20'
                      : 'bg-gray-50 border border-gray-100'
                } ${!hasSales && !isToday ? 'text-gray-300' : ''}`}
              >
                <span className={`font-bold ${hasSales ? 'text-foreground' : isToday ? 'text-primary' : 'text-gray-400'}`}>
                  {day}
                </span>
                {hasSales && (
                  <span className="text-[10px] font-bold text-success leading-tight mt-0.5">
                    ${dayTotal >= 1000 ? `${(dayTotal / 1000).toFixed(1)}k` : dayTotal.toFixed(0)}
                  </span>
                )}
                {dayReports && dayReports.length > 1 && (
                  <span className="absolute top-0.5 right-0.5 bg-accent text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {dayReports.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!loading && reports.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No hay cierres de caja registrados en este mes</p>
        </div>
      )}

      {selectedDay && selectedReports.length > 0 && (
        <DayDetailModal
          date={selectedDateStr}
          reports={selectedReports}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// MAIN CONFIG PAGE
// ══════════════════════════════════════════════

const TABS = [
  { id: 'menu', label: '🍽️ Menú' },
  { id: 'day', label: '📅 Día' },
  { id: 'reportes', label: '📊 Reportes' },
  { id: 'password', label: '🔑 Contraseña' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ConfiguracionPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('day');

  // No sessionStorage check — always require password

  if (!authenticated) {
    return <PasswordGate onUnlock={() => setAuthenticated(true)} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
        ⚙️ Configuración
      </h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-primary/10 border border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'menu' && <MenuModule />}
      {activeTab === 'day' && <DayModule />}
      {activeTab === 'reportes' && <ReportesModule />}
      {activeTab === 'password' && <PasswordModule />}
    </div>
  );
}
