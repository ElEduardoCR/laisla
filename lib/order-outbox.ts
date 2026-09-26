import type { Order } from '../types';

export interface PendingOrder {
  id: string;
  order: Order;
  state: 'pending' | 'sending' | 'blocked';
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number;
  owner?: string;
  error?: string;
}

export interface SubmissionReceipt {
  id: string;
  orderNumber: number;
  confirmedAt: number;
}

const DB_NAME = 'laisla-order-outbox-v1';
export const RETRY_MS = 5_000;
const LEASE_MS = 30_000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('pending', { keyPath: 'id' });
      request.result.createObjectStore('receipts', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('El almacenamiento está ocupado en otra pestaña.'));
  });
}

// Resolve only on transaction completion, never merely on request success.
async function transaction<T>(
  stores: string[], mode: IDBTransactionMode,
  work: (tx: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se pudo guardar en este dispositivo.')); };
    tx.onerror = () => { /* onabort reports the final transaction result */ };
    try { work(tx, result => { value = result; }); }
    catch (error) { tx.abort(); db.close(); reject(error); }
  });
}

export function enqueueOrder(order: Order): Promise<void> {
  return transaction(['pending'], 'readwrite', tx => {
    tx.objectStore('pending').add({
      id: order.id, order, state: 'pending', attempts: 0,
      nextAttemptAt: 0, leaseUntil: 0,
    } satisfies PendingOrder);
  });
}

export function readOutbox(): Promise<{ pending: PendingOrder[]; receipts: SubmissionReceipt[] }> {
  return transaction(['pending', 'receipts'], 'readonly', (tx, result) => {
    let pending: PendingOrder[] = [];
    let receipts: SubmissionReceipt[] = [];
    tx.objectStore('pending').getAll().onsuccess = event => {
      pending = (event.target as IDBRequest<PendingOrder[]>).result;
      result({ pending, receipts });
    };
    tx.objectStore('receipts').getAll().onsuccess = event => {
      receipts = (event.target as IDBRequest<SubmissionReceipt[]>).result;
      result({ pending, receipts });
    };
  });
}

export function claimOrder(id: string, owner: string, now = Date.now()): Promise<PendingOrder | null> {
  return transaction(['pending'], 'readwrite', (tx, result) => {
    const store = tx.objectStore('pending');
    store.get(id).onsuccess = event => {
      const entry = (event.target as IDBRequest<PendingOrder | undefined>).result;
      if (!entry || entry.state === 'blocked' || entry.leaseUntil > now || entry.nextAttemptAt > now) {
        result(null);
        return;
      }
      const claimed: PendingOrder = {
        ...entry, state: 'sending', owner, leaseUntil: now + LEASE_MS, attempts: entry.attempts + 1, error: undefined,
      };
      store.put(claimed);
      result(claimed);
    };
  });
}

export function acknowledgeOrder(entry: PendingOrder, orderNumber: number): Promise<void> {
  return transaction(['pending', 'receipts'], 'readwrite', tx => {
    const pending = tx.objectStore('pending');
    pending.get(entry.id).onsuccess = event => {
      const current = (event.target as IDBRequest<PendingOrder | undefined>).result;
      if (!current || current.owner !== entry.owner) return;
      tx.objectStore('receipts').put({ id: entry.id, orderNumber, confirmedAt: Date.now() } satisfies SubmissionReceipt);
      pending.delete(entry.id);
      // Receipts contain no names or products. Keep the most recent week locally.
      const receipts = tx.objectStore('receipts');
      receipts.openCursor().onsuccess = event => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        if (cursor.value.confirmedAt < Date.now() - 7 * 86_400_000) cursor.delete();
        cursor.continue();
      };
    };
  });
}

export function submissionError(error: unknown): { blocked: boolean; message: string } {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'PT410') return { blocked: true, message: 'El día de este pedido ya se cerró. Se conserva aquí para revisión; no se enviará a otro día.' };
  if (code === 'PT409') return { blocked: true, message: 'Este identificador ya existe con otros datos. Requiere revisión; no se duplicó el pedido.' };
  if (code.startsWith('22') || code.startsWith('23') || code === 'PT422') {
    return { blocked: true, message: 'El servidor rechazó los datos. El pedido sigue guardado aquí y requiere revisión.' };
  }
  return { blocked: false, message: 'Sin confirmación del servidor. Se reintentará automáticamente sin duplicar el pedido.' };
}

export function releaseOrder(entry: PendingOrder, error: unknown): Promise<void> {
  const failure = submissionError(error);
  return transaction(['pending'], 'readwrite', tx => {
    const store = tx.objectStore('pending');
    store.get(entry.id).onsuccess = event => {
      const current = (event.target as IDBRequest<PendingOrder | undefined>).result;
      if (!current || current.owner !== entry.owner) return;
      store.put({
        ...current, state: failure.blocked ? 'blocked' : 'pending', error: failure.message,
        owner: undefined, leaseUntil: 0, nextAttemptAt: Date.now() + RETRY_MS,
      } satisfies PendingOrder);
    };
  });
}

// One worker per tab; IDB leases coordinate tabs. The server receipt remains
// authoritative even if a suspended tab outlives its lease or loses the reply.
export function createOutboxWorker(options: {
  send: (order: Order) => Promise<number>;
  changed: () => void;
  online: () => boolean;
}) {
  const owner = crypto.randomUUID();
  let running: Promise<void> | null = null;
  return function flush(): Promise<void> {
    if (running) return running;
    running = (async () => {
      if (!options.online()) return;
      const { pending } = await readOutbox();
      for (const candidate of pending.sort((a, b) => a.order.createdAt.localeCompare(b.order.createdAt))) {
        if (!options.online()) break;
        const entry = await claimOrder(candidate.id, owner);
        if (!entry) continue;
        options.changed();
        try {
          const orderNumber = await options.send(entry.order);
          await acknowledgeOrder(entry, orderNumber);
        } catch (error) {
          await releaseOrder(entry, error);
        }
        options.changed();
      }
    })().finally(() => { running = null; });
    return running;
  };
}
