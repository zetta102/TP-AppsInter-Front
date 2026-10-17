/**
 * Resuelve después de `ms`. Si `signal` se aborta antes, rechaza con `signal.reason` (como
 * `timers/promises`) y quita el timer y el listener: nada queda colgado entre esperas.
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();

  if (!signal) {
    setTimeout(resolve, ms);
    return promise;
  }
  if (signal.aborted) {
    reject(signal.reason);
    return promise;
  }

  const onAbort = () => {
    clearTimeout(id);
    reject(signal.reason);
  };
  const id = setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  signal.addEventListener('abort', onAbort, { once: true });

  return promise;
}
