import { useEffect, useRef, useState } from 'react';
import { createHold, releaseHold } from './api/holds.ts';
import { toUserMessage } from './problem.ts';
import type { SeatHoldResponse, Uuid } from './types.ts';

/**
 * Gestiona el ciclo de vida de una retención de asientos para la página de compra
 * (frontend-spec.md §8.4 "Seat holds", §9 "Seat holds").
 *
 * Una retención se (re)crea cada vez que cambia el conjunto de asientos seleccionados,
 * reemplazando la que la precedía. La retención anterior se libera —best-effort,
 * fire-and-forget— antes de solicitar la nueva. Al desmontar, la retención actual se libera
 * salvo que antes se haya llamado a `markConsumed()`, lo que ocurre justo antes de un
 * `POST /api/reservations` exitoso que ya la consume y libera del lado del servidor.
 */

export interface SeatHoldState {
  readonly hold: SeatHoldResponse | null;
  /** Segundos restantes, acotados a 0; `null` mientras no haya una retención activa. */
  readonly secondsLeft: number | null;
  readonly expired: boolean;
  readonly error: string | null;
  /** Llamar justo antes de que el envío de una reserva consuma esta retención. */
  readonly markConsumed: () => void;
}

export function useSeatHold(screeningId: Uuid | undefined, seatIds: readonly Uuid[]): SeatHoldState {
  const [hold, setHold] = useState<SeatHoldResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const consumedRef = useRef(false);
  const holdRef = useRef<SeatHoldResponse | null>(null);

  // Mantiene una ref sincronizada para que los callbacks de limpieza siempre vean la última retención sin
  // re-suscribir el efecto en cada actualización de estado.
  holdRef.current = hold;

  const key = [...seatIds].sort().join(',');

  useEffect(() => {
    consumedRef.current = false;

    if (!screeningId || seatIds.length === 0) {
      setHold(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const previous = holdRef.current;

    void (async () => {
      if (previous) await releaseHold(previous.uuid).catch(() => undefined);
      try {
        const { data } = await createHold(screeningId, { seatIds: [...seatIds] });
        if (!cancelled) {
          setHold(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHold(null);
          setError(toUserMessage(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` deriva de seatIds
  }, [screeningId, key]);

  // Libera al desmontar salvo que la retención haya sido consumida por una reserva exitosa.
  useEffect(
    () => () => {
      const current = holdRef.current;
      if (current && !consumedRef.current) void releaseHold(current.uuid).catch(() => undefined);
    },
    [],
  );

  useEffect(() => {
    if (!hold) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold]);

  const secondsLeft = hold
    ? Math.max(0, Math.round((new Date(hold.expiresAt).getTime() - now) / 1000))
    : null;

  return {
    hold,
    secondsLeft,
    expired: secondsLeft === 0,
    error,
    markConsumed: () => {
      consumedRef.current = true;
    },
  };
}
