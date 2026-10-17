import { navigate } from 'astro:transitions/client';
import { useActionState, useEffect, useState } from 'react';
import { getScreeningSeatMap, getScreeningWithSeatMap } from '../../lib/api/screenings.ts';
import { listProducts } from '../../lib/api/products.ts';
import { getMetadataConfigOrDefault } from '../../lib/api/metadata.ts';
import { createReservation, quoteReservation } from '../../lib/api/reservations.ts';
import { useKeyedResource, useResource } from '../../lib/use-resource.ts';
import { delay } from '../../lib/delay.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { useQueryParams } from '../../lib/use-query-param.ts';
import { useSeatHold } from '../../lib/use-seat-hold.ts';
import { useNow } from '../../lib/use-now.ts';
import { usePolling } from '../../lib/use-polling.ts';
import { patchSeatMap, useSeatStream } from '../../lib/use-seat-stream.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { isApiError, isApiErrorWithCode } from '../../lib/problem.ts';
import { estimateTotal, lineTotal, ticketPrice } from '../../lib/pricing.ts';
import { formatCountdown, formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import { productCategoryLabels, SeatType } from '../../lib/enums.ts';
import type {
  MetadataConfigResponse,
  MovieScreeningResponse,
  ProductResponse,
  SeatMapResponse,
  SeatMapSeat,
} from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock, SubmitButton } from '../ui/SubmitButton.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { indexSeatsById, SeatMap } from './SeatMap.tsx';

/**
 * Pantalla de checkout (backend-status-for-frontend.md §7.2–§7.4).
 *
 * Tres comportamientos sostienen el diseño:
 *  - al seleccionar asientos se crea una **retención** (`POST /api/screenings/{id}/holds`)
 *    que expira con una cuenta regresiva, para que nadie más pueda tomarlos durante el checkout;
 *    cada cambio de selección la reemplaza de forma atómica (`PUT /api/holds/{id}`) y el mapa
 *    se mantiene al día con el stream SSE de la función;
 *  - el total del pedido proviene de `POST /api/reservations:quote` —el mismo
 *    flujo de código que usa el cobro final— en lugar de una estimación solo del cliente;
 *  - la retención no es una garantía absoluta (puede expirar o perderse la respuesta ya
 *    confirmada del lado del servidor), así que se conserva, a propósito, una segunda línea
 *    de defensa: un `409` al enviar vuelve a consultar el mapa, resalta los asientos
 *    perdidos y le pide al usuario que vuelva a seleccionar. Esto ya no es el workaround
 *    previo a la retención — es el manejo de la carrera residual que la retención no cubre.
 */

interface CheckoutData {
  readonly screening: MovieScreeningResponse;
  readonly seatMap: SeatMapResponse;
  readonly products: readonly ProductResponse[];
  readonly config: MetadataConfigResponse;
}

interface SubmitState {
  readonly error: unknown;
  readonly lostSeatIds: readonly string[];
}

const initialSubmitState: SubmitState = { error: null, lostSeatIds: [] };
const QUOTE_DEBOUNCE_MS = 400;
const SEAT_MAP_POLL_MS = 15_000;
const SEAT_MAP_SAFETY_POLL_MS = 60_000;
/** Umbral del aviso previo al vencimiento de la retención (las retenciones no se extienden). */
const HOLD_WARNING_SECONDS = 60;

export default function Checkout() {
  return (
    <AuthGuard message="Iniciá sesión para confirmar tu reserva. Tu selección de asientos se conservará.">
      <CheckoutPanel />
    </AuthGuard>
  );
}

function CheckoutPanel() {
  const params = useQueryParams(['screening', 'seats'] as const);
  const screeningId = params.screening;
  const now = useNow();
  const { user } = useAuth();

  const [selected, setSelected] = useState<readonly string[]>([]);
  const [initialised, setInitialised] = useState(false);
  const [quantities, setQuantities] = useState<ReadonlyMap<string, number>>(new Map());

  const resource = useKeyedResource<string, CheckoutData>(screeningId, async (id, signal) => {
    const [screening, products, config] = await Promise.all([
      // Función + mapa en una sola llamada (`include=seatMap`).
      getScreeningWithSeatMap(id, { signal }),
      // Público y solo de precios: ya no se oculta este panel ante un 403.
      listProducts({ size: 100, sort: 'productName,asc' }, { signal }),
      // Ante un error, vuelve a los valores predeterminados documentados, para que
      // una caída de metadata nunca bloquee el checkout.
      getMetadataConfigOrDefault({ signal }),
    ]);

    return { screening, seatMap: screening.seatMap, products: products.content, config };
  });
  useDocumentTitle(resource.data && `Reserva · ${resource.data.screening.movieName}`);

  // Inicializa la selección desde la query string una vez conocido el mapa,
  // descartando cualquier asiento que ya no esté disponible.
  const seatsById = indexSeatsById(resource.data?.seatMap.seats ?? []);

  if (resource.data && !initialised) {
    const requested = (params.seats ?? '').split(',').filter(Boolean);
    setSelected(requested.filter((id) => seatsById.get(id)?.available === true));
    setInitialised(true);
  }

  // Retiene la selección actual durante unos minutos para que nadie más pueda tomarla
  // durante el checkout. Cada cambio de selección la reemplaza sin soltar los asientos que siguen.
  const seatHold = useSeatHold(screeningId ?? undefined, selected);

  const toggle = (seat: SeatMapSeat) => {
    setSelected((current) =>
      current.includes(seat.seatId)
        ? current.filter((id) => id !== seat.seatId)
        : [...current, seat.seatId],
    );
  };

  const setQuantity = (inventoryId: string, quantity: number) => {
    setQuantities((current) => {
      const next = new Map(current);
      if (quantity <= 0) next.delete(inventoryId);
      else next.set(inventoryId, quantity);
      return next;
    });
  };

  const { refetch, setData } = resource;
  // Ventas y retenciones de otros clientes, en vivo; el polling queda como red de seguridad.
  const live = useSeatStream(screeningId ?? undefined, {
    viewer: user?.uuid ?? null,
    onReconnect: refetch,
    onSeats: (states) =>
      setData(
        (current) => current && { ...current, seatMap: patchSeatMap(current.seatMap, states) },
      ),
  });
  usePolling(refetch, live ? SEAT_MAP_SAFETY_POLL_MS : SEAT_MAP_POLL_MS, Boolean(screeningId));
  // Cuando la cuenta regresiva llega a cero, la retención se pierde: vuelve a consultar el mapa
  // para que una selección desactualizada no sorprenda al usuario al enviar.
  useEffect(() => {
    if (seatHold.expired) refetch();
  }, [seatHold.expired, refetch]);

  const productsRequest =
    quantities.size > 0
      ? Array.from(quantities, ([inventoryId, quantity]) => ({ inventoryId, quantity }))
      : undefined;

  // Solo se envía la retención si cubre toda la selección actual; si no, el servidor
  // respondería `404`/`409` mientras se recrea la retención para la nueva selección.
  const holdId =
    seatHold.hold && new Set(selected).isSubsetOf(new Set(seatHold.hold.seatIds))
      ? seatHold.hold.uuid
      : undefined;
  const quoteKey = `${selected.join(',')}|${Array.from(quantities, (entry) => entry.join(':')).join(',')}|${holdId ?? ''}`;

  // Vista previa autorizada del precio: mismo cuerpo y misma validación que create, sin efectos
  // secundarios. El `delay` abortable hace de debounce: cambiar la selección cancela la espera
  // y la petición en curso, así que no se dispara una cotización en cada clic.
  const quoteResource = useResource(
    async (signal) => {
      await delay(QUOTE_DEBOUNCE_MS, signal);
      return quoteReservation(
        {
          movieScreeningId: screeningId ?? '',
          seatIds: selected,
          ...(productsRequest ? { products: productsRequest } : {}),
          ...(holdId ? { holdId } : {}),
        },
        { signal },
      );
    },
    [screeningId, quoteKey],
    { enabled: Boolean(screeningId) && selected.length > 0 },
  );
  // Un error de cotización no bloquea: se vuelve a la estimación local.
  const quote = quoteResource.status === 'success' ? quoteResource.data : null;

  const [submitState, submitAction] = useActionState(async (_prev: SubmitState) => {
    if (!screeningId) return initialSubmitState;
    try {
      const { data } = await createReservation({
        movieScreeningId: screeningId,
        seatIds: selected,
        ...(productsRequest ? { products: productsRequest } : {}),
        ...(seatHold.hold ? { holdId: seatHold.hold.uuid } : {}),
      });
      // La retención se consume del lado del servidor al completar con éxito; no la liberes también aquí.
      seatHold.markConsumed();
      void navigate(`/reservations/detail?id=${data.uuid}`);
      return initialSubmitState;
    } catch (error) {
      // 409: otra persona reservó uno de estos asientos antes. Volvé a consultar y mostrá cuáles.
      if (isApiError(error) && error.status === 409) {
        const fresh = await getScreeningSeatMap(screeningId).catch(() => null);
        const unavailable = new Set(
          (fresh?.seats ?? []).filter((seat) => !seat.available).map((seat) => seat.seatId),
        );
        const lost = new Set(selected).intersection(unavailable);
        resource.refetch();
        setSelected((current) => current.filter((id) => !lost.has(id)));
        return { error, lostSeatIds: [...lost] };
      }
      // La función se archivó o empezó mientras tanto: se recarga para reflejarlo.
      if (isApiErrorWithCode(error, 'RESOURCE_ARCHIVED', 'SCREENING_STARTED')) resource.refetch();
      return { error, lostSeatIds: [] };
    }
  }, initialSubmitState);

  // La selección de asientos se confirma localmente en el momento del clic;
  // no hay nada pendiente por reconciliar hasta el envío, que reemplaza la vista.

  if (!screeningId) {
    return (
      <EmptyState
        title="No se seleccionó ninguna función"
        description="Empezá desde un horario para elegir tus asientos."
        action={
          <a href="/" className="cine-btn cine-btn-primary">
            Ver cartelera
          </a>
        }
      />
    );
  }

  if (resource.isLoading) return <LoadingBlock label="Preparando tu pedido…" />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;
  if (!resource.data) return null;

  const { screening, seatMap, products, config } = resource.data;
  const chosenSeats = selected.map((id) => seatsById.get(id)).filter((seat) => seat !== undefined);

  const productsById = new Map(products.map((product) => [product.uuid, product]));
  const chosenProducts = Array.from(quantities, ([id, quantity]) => {
    const product = productsById.get(id);
    return product ? { product, quantity } : null;
  }).filter((entry) => entry !== null);

  // Una vez cargada, la cotización del servidor es la referencia válida; la réplica del cliente
  // solo cubre el intervalo mientras está en curso o no disponible, y usa el multiplicador premium
  // vigente de `GET /api/metadata/config` en lugar de una constante
  // hardcodeada.
  const localEstimate = estimateTotal(
    screening.basePrice,
    chosenSeats,
    chosenProducts.map(({ product, quantity }) => ({ cost: product.price, quantity })),
    config.premiumSeatMultiplier,
  );
  const total = quote?.totalPrice ?? localEstimate.total;

  const hasStarted = new Date(screening.startsAt).getTime() <= now;
  const closed = hasStarted || screening.archived;
  const canSubmit = chosenSeats.length > 0 && !closed && !seatHold.expired;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold">{screening.movieName}</h1>
          <p className="text-sm text-ink-500">
            {formatDateTime(screening.startsAt)} · {screening.roomName}
          </p>
        </header>

        {seatHold.hold && !seatHold.expired && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm text-brand-300">
            {/* Solo el aviso es una región viva: la cuenta regresiva no se anuncia cada segundo. */}
            <span role="status">
              Tus asientos están reservados para vos.
              {/* Aviso único antes del vencimiento (WCAG 2.2.1); se anuncia una vez al aparecer. */}
              {(seatHold.secondsLeft ?? 0) <= HOLD_WARNING_SECONDS && (
                <span className="block font-semibold">
                  Tu retención vence en menos de un minuto.
                </span>
              )}
            </span>
            <span className="font-mono tabular-nums">
              <span className="sr-only">Tiempo restante: </span>
              {formatCountdown(seatHold.secondsLeft ?? 0)}
            </span>
          </div>
        )}

        {closed && (
          <div role="alert" className="cine-alert-warning px-4 py-3 text-sm">
            {screening.archived
              ? 'Esta función ya no está disponible.'
              : 'Esta función ya comenzó, por lo que ya no puede reservarse.'}
          </div>
        )}

        {seatHold.expired && !closed && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 cine-alert-warning px-4 py-3 text-sm"
          >
            <span>Tu retención venció. Renovala para seguir con estos asientos.</span>
            <button type="button" className="cine-btn cine-btn-ghost" onClick={seatHold.renew}>
              Renovar retención
            </button>
          </div>
        )}

        {seatHold.error && !closed && (
          <div role="alert" className="cine-alert-warning px-4 py-3 text-sm">
            No pudimos retener tus asientos: {seatHold.error}
          </div>
        )}

        {submitState.lostSeatIds.length > 0 && (
          <div role="alert" className="cine-alert-warning px-4 py-3 text-sm">
            <p className="font-semibold">Algunos asientos acaban de ocuparse</p>
            <p className="mt-0.5 text-ink-300">
              {submitState.lostSeatIds
                .map((id) => {
                  const seat = seatsById.get(id);
                  return seat ? seatLabel(seat.row, seat.column) : id.slice(0, 8);
                })
                .join(', ')}{' '}
              ahora pertenecen a otro cliente y se quitaron de tu pedido. Elegí reemplazos e intentá
              nuevamente.
            </p>
          </div>
        )}

        {Boolean(submitState.error) && submitState.lostSeatIds.length === 0 && (
          <ErrorBanner error={submitState.error} />
        )}

        <section className="cine-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Tus asientos</h2>
          <SeatMap
            seatMap={seatMap}
            basePrice={screening.basePrice}
            premiumMultiplier={config.premiumSeatMultiplier}
            selected={selected}
            onToggle={toggle}
            lostSeatIds={submitState.lostSeatIds}
            disabled={closed}
          />
        </section>

        <section className="cine-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Agregar confitería</h2>

          {products.length === 0 ? (
            <p className="text-sm text-ink-500">No hay productos disponibles en este momento.</p>
          ) : (
            <ul className="divide-y divide-ink-800">
              {products.map((product) => {
                const quantity = quantities.get(product.uuid) ?? 0;
                const soldOut = !product.available;

                return (
                  <li key={product.uuid} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{product.productName}</p>
                      <p className="text-xs text-ink-500">
                        {productCategoryLabels[product.category]} · {formatMoney(product.price)} ·{' '}
                        {soldOut ? 'sin stock' : 'disponible'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="cine-btn cine-btn-ghost px-2 py-1"
                        disabled={quantity === 0}
                        aria-label={`Quitar una unidad de ${product.productName}`}
                        onClick={() => setQuantity(product.uuid, quantity - 1)}
                      >
                        −
                      </button>
                      <span
                        aria-live="polite"
                        aria-atomic="true"
                        className="w-6 text-center text-sm tabular-nums"
                      >
                        {quantity}
                        <span className="sr-only"> de {product.productName}</span>
                      </span>
                      <button
                        type="button"
                        className="cine-btn cine-btn-ghost px-2 py-1"
                        disabled={soldOut}
                        aria-label={`Agregar una unidad de ${product.productName}`}
                        onClick={() => setQuantity(product.uuid, quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <form action={submitAction} className="flex flex-col gap-4 cine-card p-5">
          <h2 className="text-sm font-semibold">Resumen del pedido</h2>

          <ul className="flex flex-col gap-2 text-sm">
            {chosenSeats.length === 0 ? (
              <li className="text-ink-500">Todavía no seleccionaste asientos.</li>
            ) : (
              chosenSeats.map((seat) => {
                const quoted = quote?.tickets.find((ticket) => ticket.seatId === seat.seatId);
                return (
                  <li key={seat.seatId} className="flex justify-between gap-3">
                    <span>
                      Asiento {seatLabel(seat.row, seat.column)}
                      <span className="text-ink-500">
                        {' '}
                        · {seat.seatType === SeatType.PREMIUM ? 'premium' : 'estándar'}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(
                        quoted?.price ??
                          ticketPrice(
                            screening.basePrice,
                            seat.seatType,
                            config.premiumSeatMultiplier,
                          ),
                      )}
                    </span>
                  </li>
                );
              })
            )}

            {chosenProducts.map(({ product, quantity }) => {
              const quoted = quote?.items.find((item) => item.inventoryId === product.uuid);
              return (
                <li key={product.uuid} className="flex justify-between gap-3">
                  <span>
                    {product.productName}
                    <span className="text-ink-500"> × {quantity}</span>
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(quoted?.lineTotal ?? lineTotal(product.price, quantity))}
                  </span>
                </li>
              );
            })}
          </ul>

          <div
            aria-live="polite"
            aria-atomic="true"
            className="flex justify-between border-t border-ink-800 pt-3 text-base font-semibold"
          >
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </div>

          <SubmitButton disabled={!canSubmit} pendingLabel="Reservando…">
            Confirmar reserva
          </SubmitButton>

          <p className="text-xs text-ink-500">
            {quote
              ? 'Este total es la cotización de precio confirmada por el servidor.'
              : 'El precio mostrado es una estimación; el total confirmado de tu reserva es el válido.'}
          </p>
        </form>
      </aside>
    </div>
  );
}
