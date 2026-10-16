import { useEffect, useState } from 'react';

/**
 * La hora actual como estado que se actualiza cada `intervalMs`.
 *
 * Llamar a `Date.now()` durante el render es impuro (el resultado cambia entre renders
 * sin que cambie nada en React) y además deja la UI desactualizada: un "la función ya
 * comenzó" calculado así nunca se re-evalúa mientras la página sigue abierta.
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
