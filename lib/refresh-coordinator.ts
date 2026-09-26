/** Serialize snapshots; discard reads invalidated by realtime or a local write. */
export function createRefreshCoordinator<T>(options: {
  read: () => Promise<T>;
  apply: (snapshot: T) => void;
  error: (error: unknown) => void;
}) {
  let revision = 0;
  let writers = 0;
  let requested = false;
  let running: Promise<void> | null = null;
  let stopped = false;

  function request(): Promise<void> {
    requested = true;
    if (stopped || writers > 0) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      while (requested && !stopped && writers === 0) {
        requested = false;
        const startedAt = revision;
        try {
          const snapshot = await options.read();
          if (!stopped && writers === 0 && startedAt === revision) options.apply(snapshot);
          else requested = true;
        } catch (error) {
          if (!stopped) options.error(error);
          // Avoid a tight retry loop while offline; the next timer/event retries.
          requested = false;
        }
      }
    })().finally(() => { running = null; });
    return running;
  }

  return {
    request,
    invalidate() { revision++; return request(); },
    async write<R>(work: () => Promise<R>): Promise<R> {
      revision++;
      writers++;
      try { return await work(); }
      finally {
        revision++;
        writers--;
        void request();
      }
    },
    stop() { stopped = true; revision++; },
  };
}
