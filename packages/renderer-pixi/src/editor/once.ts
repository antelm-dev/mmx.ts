/** Share one in-flight/settled promise; clear on failure so callers can retry. */
export function oncePromise(run: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | null = null;
  return () => {
    if (!pending) {
      pending = run().catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}
