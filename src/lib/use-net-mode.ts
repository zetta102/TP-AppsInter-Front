import { useSyncExternalStore } from 'react';

/**
 * El modo del fondo "Net" (`NetBackground.tsx`), recordado en `localStorage`.
 *
 *  - `quieto` (predeterminado): baldosas fijas. WCAG 3 "No visual motion" prohíbe movimiento de
 *    más de 5 s salvo que la persona lo pida, así que la animación es opcional;
 *  - `animado`: solo con `prefers-reduced-motion: no-preference`;
 *  - `liso`: sin baldosas detrás del texto, solo el degradé (WCAG 3 "Background adjustable").
 *
 * El fondo y el grupo "Fondo" del pie leen el mismo store, y el evento `storage` sincroniza las
 * pestañas abiertas.
 */

export type NetMode = 'animado' | 'quieto' | 'liso';

const STORAGE_KEY = 'cine:fondo';
const DEFAULT_MODE: NetMode = 'quieto';

const listeners = new Set<() => void>();

export function isNetMode(value: unknown): value is NetMode {
  return value === 'animado' || value === 'quieto' || value === 'liso';
}

function readMode(): NetMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isNetMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    // Sin almacenamiento: queda el modo predeterminado.
    return DEFAULT_MODE;
  }
}

// Respaldo en memoria: sin almacenamiento (navegación privada) la elección vale para esta pestaña.
let current: NetMode | null = null;

function getSnapshot(): NetMode {
  current ??= readMode();
  return current;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = readMode();
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function setNetMode(mode: NetMode): void {
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Sin almacenamiento la elección no sobrevive a una recarga.
  }
  for (const listener of listeners) listener();
}

export function useNetMode(): NetMode {
  return useSyncExternalStore(subscribe, getSnapshot);
}
