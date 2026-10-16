import { useEffect, useEffectEvent } from 'react';

/**
 * Ejecuta `callback` cada `intervalMs` mientras la pestaña está visible.
 *
 * El mapa de asientos se actualiza en vivo por SSE (`use-seat-stream.ts`); esto es la red de
 * seguridad: cubre los huecos mientras el stream está caído y el caso de un backend escalado a
 * varias instancias (backend-status-for-frontend.md §7.6). Siempre se usa la versión más
 * reciente de `callback` sin reiniciar el intervalo; cambiar `intervalMs` lo reprograma.
 */
export function usePolling(callback: () => void, intervalMs: number, enabled = true): void {
  const tick = useEffectEvent(callback);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') tick();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);
}
