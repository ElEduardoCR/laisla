'use client';

import { useState, useEffect, useCallback } from 'react';
import { DaySession, Order } from '@/types';
import { fetchSessionsByMonth, fetchOrdersBySession } from '@/lib/database';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  // 0=Sun → convert to Mon=0
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

// ── Day Detail Modal ──
function DayDetailModal({
  date,
  sessions,
  onClose,
}: {
  date: string;
  sessions: DaySession[];
  onClose: () => void;
}) {
  const [ordersBySession, setOrdersBySession] = useState<Record<string, Order[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result: Record<string, Order[]> = {};
      for (const s of sessions) {
        result[s.id] = await fetchOrdersBySession(s.id);
      }
      setOrdersBySession(result);
      setLoading(false);
    }
    load();
  }, [sessions]);

  const dayTotalSales = sessions.reduce((s, ses) => s + (ses.totalSales || 0), 0);
  const dayTotalCash = sessions.reduce((s, ses) => s + (ses.totalCash || 0), 0);
  const dayTotalTerminal = sessions.reduce((s, ses) => s + (ses.totalTerminal || 0), 0);
  const dayTotalExpenses = sessions.reduce((s, ses) => s + (ses.totalExpenses || 0), 0);

  // Aggregate product breakdown across all sessions
  const productBreakdown: Record<string, { name: string; qty: number; total: number }> = {};
  for (const sessionId of Object.keys(ordersBySession)) {
    for (const order of ordersBySession[sessionId]) {
      for (const item of order.items) {
        const key = item.productName;
        if (!productBreakdown[key]) productBreakdown[key] = { name: key, qty: 0, total: 0 };
        productBreakdown[key].qty += item.quantity;
        productBreakdown[key].total += item.productPrice * item.quantity;
      }
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-primary text-white p-4 rounded-t-2xl flex items-center justify-between sticky top-0">
            <div>
              <h2 className="text-lg font-bold">📊 Resumen del Día</h2>
              <p className="text-sm text-white/80">{date}</p>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">✕</button>
          </div>

          {/* Day totals */}
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

          {/* Sessions breakdown */}
          {sessions.length > 1 && (
            <div className="p-4 border-b">
              <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">
                Turnos ({sessions.length})
              </h3>
              <div className="space-y-2">
                {sessions.map((s, i) => (
                  <div key={s.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div className="flex justify-between font-semibold mb-1">
                      <span>Turno {i + 1}</span>
                      <span className="text-primary">${(s.totalSales || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Inicio: ${(s.initialCash || 0).toFixed(2)}</span>
                      <span>💵 ${(s.totalCash || 0).toFixed(2)}</span>
                      <span>💳 ${(s.totalTerminal || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product breakdown */}
          <div className="p-4">
            <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide mb-3">Productos Vendidos</h3>
            {loading ? (
              <p className="text-gray-400 text-sm py-4 text-center">Cargando...</p>
            ) : Object.keys(productBreakdown).length > 0 ? (
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
        </div>
      </div>
    </>
  );
}

// ── Calendar Page ──
export default function ReportesPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSessionsByMonth(year, month);
      setSessions(data);
    } catch (err) {
      console.error('fetchSessionsByMonth error:', err);
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

  // Group sessions by day of month
  const sessionsByDay: Record<number, DaySession[]> = {};
  for (const s of sessions) {
    const d = new Date(s.openedAt).getDate();
    if (!sessionsByDay[d]) sessionsByDay[d] = [];
    sessionsByDay[d].push(s);
  }

  const monthTotalSales = sessions.reduce((s, ses) => s + (ses.totalSales || 0), 0);
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOffset = getFirstDayOfWeek(year, month);

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedSessions = selectedDay ? (sessionsByDay[selectedDay] || []) : [];
  const selectedDateStr = selectedDay
    ? `${selectedDay} de ${MONTH_NAMES[month - 1]} ${year}`
    : '';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
        📊 Reportes
      </h1>

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
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="aspect-square" />;
            }
            const daySessions = sessionsByDay[day];
            const hasSales = daySessions && daySessions.length > 0;
            const dayTotal = hasSales ? daySessions.reduce((s, ses) => s + (ses.totalSales || 0), 0) : 0;
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
                {daySessions && daySessions.length > 1 && (
                  <span className="absolute top-0.5 right-0.5 bg-accent text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {daySessions.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* No data message */}
      {!loading && sessions.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No hay cierres de caja registrados en este mes</p>
        </div>
      )}

      {/* Day detail modal */}
      {selectedDay && selectedSessions.length > 0 && (
        <DayDetailModal
          date={selectedDateStr}
          sessions={selectedSessions}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
