import { useEffect, useRef, useState } from 'react';
import { createHold, releaseHold, replaceHold } from './api/holds.ts';
import { isApiErrorWithStatus, toUserMessage } from './problem.ts';
import { useNow } from './use-now.ts';
import type { SeatHold, Uuid } from './types.ts';

/**
 * Gestiona el ciclo de vida de una retención de asientos para la página de compra.
 *
 * La primera selección crea una retención; cada cambio posterior la **reemplaza** con
 * `PUT /api/holds/{id}`, que es atómico: los asientos que siguen seleccionados nunca se
 * liberan en el medio. El reemplazo conserva `expiresAt` (no extiende la retención); si la
 * retención ya no existe (`404`), se crea una nueva. Si el reemplazo falla por otro motivo, el
 * servidor conserva los asientos anteriores y se informa el error.
 *
 * Las operaciones contra el servidor se encolan: nunca hay dos en vuelo, así que un cambio de
 * selección rápido no puede aplicarse fuera de orden ni dejar una retención huérfana. Al vaciar
 * la selección o desmontar se libera la retención, salvo que antes se haya llamado a
 * `markConsumed()` (justo antes de un `POST /api/reservations`, que la consume del lado del
 * servidor). Al vencer, `renew()` crea una retención nueva para la misma selección.
 */

export interface SeatHoldState {
  /** La retención que cubre exactamente la selección actual; `null` mientras se crea o reemplaza. */
  readonly hold: SeatHold | null;
  /** Segundos restantes, acotados a 0; `null` mientras no haya una retención activa. */
  readonly secondsLeft: number | null;
  readonly expired: boolean;
  readonly error: string | null;
  /** Llamar justo antes de que el envío de una reserva consuma esta retención. */
  readonly markConsumed: () => void;
  /** Crea una retención nueva para la selección actual (las retenciones no se extienden). */
  readonly renew: () => void;
}

/** Un resultado asociado a la selección (`key`) que lo produjo. */
interface Keyed<T> {
  readonly key: string;
  readonly value: T;
}

/**
 * El `holdId` que corresponde enviar con la selección actual: solo si la retención cubre todos
 * los asientos elegidos. Mientras se reemplaza o recrea para una selección nueva, enviarla haría
 * que el servidor respondiera `404`/`409`, así que se omite (cotizar y comprar sin retención
 * sigue siendo válido).
 */
export function holdIdFor(hold: SeatHold | null, selected: readonly Uuid[]): Uuid | undefined {
  if (!hold || selected.length === 0) return undefined;
  return new Set(selected).isSubsetOf(new Set(hold.seatIds)) ? hold.uuid : undefined;
}

function release(hold: SeatHold | null): Promise<void> {
  return hold ? releaseHold(hold.uuid).catch(() => undefined) : Promise.resolve();
}

function isLive(hold: SeatHold, screeningId: Uuid): boolean {
  return hold.screeningId === screeningId && new Date(hold.expiresAt).getTime() > Date.now();
}

export function useSeatHold(
  screeningId: Uuid | undefined,
  seatIds: readonly Uuid[],
): SeatHoldState {
  const [generation, setGeneration] = useState(0);
  // Clave estable e independiente del orden: la retención solo cambia si cambia el conjunto
  // (o si se pidió renovarla).
  const key = screeningId ? `${screeningId}|${seatIds.toSorted().join(',')}#${generation}` : '';

  const [created, setCreated] = useState<Keyed<SeatHold> | null>(null);
  const [failure, setFailure] = useState<Keyed<string> | null>(null);
  const consumedRef = useRef(false);
  // La retención vigente en el servidor según la última operación terminada.
  const liveRef = useRef<SeatHold | null>(null);
  // Cola de operaciones: cada una espera a que termine la anterior.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  function enqueue(operation: () => Promise<void>): void {
    queueRef.current = queueRef.current.then(operation, operation);
  }

  useEffect(() => {
    consumedRef.current = false;

    if (!screeningId || seatIds.length === 0) {
      enqueue(async () => {
        const previous = liveRef.current;
        liveRef.current = null;
        await release(previous);
      });
      return;
    }

    let cancelled = false;
    const ids = [...seatIds];

    enqueue(async () => {
      // Una selección más nueva ya está en la cola: que trabaje esa.
      if (cancelled) return;
      const live = liveRef.current;
      try {
        let data: SeatHold | null = null;
        if (live && isLive(live, screeningId)) {
          try {
            data = await replaceHold(live.uuid, { seatIds: ids });
          } catch (err) {
            // Venció, se consumió o se liberó: se sigue con una retención nueva.
            if (!isApiErrorWithStatus(err, 404)) throw err;
            liveRef.current = null;
          }
        } else if (live) {
          liveRef.current = null;
          await release(live);
        }
        data ??= (await createHold(screeningId, { seatIds: ids })).data;
        liveRef.current = data;
        if (!cancelled) setCreated({ key, value: data });
      } catch (err) {
        if (!cancelled) setFailure({ key, value: toUserMessage(err) });
      }
    });

    return () => {
      cancelled = true;
    };
    // `key` resume `screeningId`, el conjunto de `seatIds` y la generación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Libera al desmontar (después de lo que quede en la cola) salvo que la retención se haya consumido.
  useEffect(
    () => () => {
      enqueue(async () => {
        if (!consumedRef.current) await release(liveRef.current);
        liveRef.current = null;
      });
    },
    [],
  );

  const hold = created?.key === key && seatIds.length > 0 ? created.value : null;
  const error = failure?.key === key && seatIds.length > 0 ? failure.value : null;

  // La cuenta regresiva solo corre mientras hay una retención activa.
  const now = useNow(1000, hold !== null);

  const secondsLeft = hold
    ? Math.min(
        hold.ttlSeconds,
        Math.max(0, Math.round((new Date(hold.expiresAt).getTime() - now) / 1000)),
      )
    : null;

  return {
    hold,
    secondsLeft,
    expired: secondsLeft === 0,
    error,
    markConsumed: () => {
      consumedRef.current = true;
    },
    renew: () => setGeneration((current) => current + 1),
  };
}
