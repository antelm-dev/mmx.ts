export type RebuildScheduler = {
  schedule: () => void;
  waitCurrent: () => Promise<void>;
};

export type RebuildSchedulerOptions<T> = {
  run: () => Promise<T>;
  publish: (value: T) => void;
  onError?: (error: unknown) => void;
};

export function createRebuildScheduler<T>(
  options: RebuildSchedulerOptions<T>,
): RebuildScheduler {
  let generation = 0;
  let settledGeneration = 0;
  let pending = false;
  let running = false;
  let waiters: Array<() => void> = [];

  const wakeWaiters = (): void => {
    if (waiters.length === 0) return;
    const current = waiters;
    waiters = [];
    for (const resolve of current) resolve();
  };

  const pump = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      while (pending) {
        pending = false;
        const token = generation;
        try {
          const value = await options.run();
          if (token === generation) {
            options.publish(value);
          }
        } catch (error) {
          options.onError?.(error);
        } finally {
          settledGeneration = Math.max(settledGeneration, token);
          wakeWaiters();
        }
      }
    } finally {
      running = false;
      if (pending) {
        void pump();
      } else {
        wakeWaiters();
      }
    }
  };

  return {
    schedule() {
      generation += 1;
      pending = true;
      void pump();
    },
    async waitCurrent() {
      const target = generation;
      while (settledGeneration < target) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      }
    },
  };
}
