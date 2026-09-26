import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// A stalled connection must release the outbox lease and allow another attempt.
// Aborting an HTTP request is not proof of rollback: submit_order_once handles
// the case where the server committed but the response never reached us.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      // Existing charges/edits have no receipt. Do not introduce a new timeout
      // or automatic retry policy for those non-idempotent operations.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.includes('/rpc/submit_order_once')) {
        return fetch(input, init);
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (init?.signal?.aborted) abort();
      init?.signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 15_000);
      try {
        const response = await fetch(input, { ...init, signal: controller.signal });
        // Keep the deadline active until the body is available too.
        await response.clone().arrayBuffer();
        return response;
      }
      finally {
        clearTimeout(timer);
        init?.signal?.removeEventListener('abort', abort);
      }
    },
  },
});
