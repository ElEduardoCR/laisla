'use client';

import { useApp } from '@/context/AppContext';

export default function SyncStatus() {
  const { pendingSubmissions, connectionError, queueError, lastSyncedAt, retrySync } = useApp();
  const attention = pendingSubmissions.length > 0 || connectionError || queueError;
  return (
    <div className={`border-b px-4 py-2 text-sm ${attention ? 'bg-amber-50 text-amber-950' : 'bg-white text-gray-500'}`}>
      <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-2">
        <p role="status">
          {queueError || connectionError || (lastSyncedAt ? 'Pedidos verificados con el servidor · revisión cada 5 s' : 'Conectando con el servidor…')}
        </p>
        {attention && <button onClick={retrySync} className="font-semibold underline">Verificar ahora</button>}
      </div>
      {pendingSubmissions.length > 0 && (
        <details className="mx-auto max-w-7xl mt-2" open>
          <summary className="cursor-pointer font-bold">{pendingSubmissions.length} pedido(s) en este dispositivo sin confirmar</summary>
          <p className="mt-1">No los vuelvas a capturar. No borres los datos del navegador. Los reintentos continúan mientras el POS está abierto.</p>
          <ul className="mt-2 space-y-2">
            {pendingSubmissions.map(entry => (
              <li key={entry.id} className="rounded border border-amber-200 bg-white p-3">
                <p className="font-semibold">{entry.order.customerName} · {new Date(entry.order.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {entry.state === 'blocked' ? 'Requiere revisión' : entry.state === 'sending' ? 'Esperando confirmación' : 'Pendiente de envío'}</p>
                <p>{entry.order.items.map(item => `${item.quantity} × ${item.productName}`).join(', ')}</p>
                {entry.error && <p className="mt-1">{entry.error}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
