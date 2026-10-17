import { useEffect, useState } from 'react';

/**
 * La hora actual como estado que se actualiza cada `intervalMs`.
 *
 * Llamar a `Date.now()` durante el render es impuro (el resultado cambia entre renders
 * sin que cambie nada en React) y además deja la UI desactualizada: un "la función ya
 * comenzó" calculado así nunca se re-evalúa mientras la página sigue abierta.
 *
 * Con `enabled: false` el reloj se detiene (p. ej. una cuenta regresiva sin retención activa).
 */
export function useNow(intervalMs = 15_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    // Al reanudar, la primera lectura no espera un intervalo completo (el reloj pudo estar
    // detenido varios minutos).
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [intervalMs, enabled]);

  return now;
}
