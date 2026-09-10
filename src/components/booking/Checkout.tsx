import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getScreening, getScreeningSeatMap } from '../../lib/api/screenings.ts';
import { listProducts } from '../../lib/api/products.ts';
import { getMetadataConfigOrDefault } from '../../lib/api/metadata.ts';
import { createReservation, quoteReservation } from '../../lib/api/reservations.ts';
import { useResource } from '../../lib/use-resource.ts';
import { useQueryParams } from '../../lib/use-query-param.ts';
import { useSeatHold } from '../../lib/use-seat-hold.ts';
import { isApiError } from '../../lib/problem.ts';
import { estimateTotal } from '../../lib/pricing.ts';
import { formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import { productCategoryLabels } from '../../lib/enums.ts';
import type {
  MetadataConfigResponse,
  MovieScreeningResponse,
  ProductResponse,
  ReservationQuoteResponse,
  SeatMapResponse,
  SeatMapSeat,
} from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock, SubmitButton } from '../ui/SubmitButton.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { SeatMap } from './SeatMap.tsx';

/**
 * Pantalla de checkout (frontend-spec.md §8.4 "Retención de asientos", §8.6, §8.8 "Cotización de precio", §9).
 *
 * Tres comportamientos sostienen el diseño:
 *  - al seleccionar asientos se crea una **retención** (`POST /api/screenings/{id}/holds`)
 *    que expira con una cuenta regresiva, para que nadie más pueda tomarlos durante el checkout;
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

  const [selected, setSelected] = useState<readonly string[]>([]);
  const [initialised, setInitialised] = useState(false);
  const [quantities, setQuantities] = useState<ReadonlyMap<string, number>>(new Map());

  const resource = useResource<CheckoutData>(
    async (signal) => {
      const [screening, seatMap, products, config] = await Promise.all([
        getScreening(screeningId!, { signal }),
        getScreeningSeatMap(screeningId!, { signal }),
        // Público y solo de precios: ya no se oculta este panel ante un 403.
        listProducts({ size: 100, sort: 'productName,asc' }, { signal }),
        // Ante un error, vuelve a los valores predeterminados documentados, para que
        // una caída de metadata nunca bloquee el checkout.
        getMetadataConfigOrDefault({ signal }),
      ]);

      return { screening, seatMap, products: products.content, config };
    },
    [screeningId],
    { enabled: Boolean(screeningId) },
  );

  // Inicializa la selección desde la query string una vez conocido el mapa,
  // descartando cualquier asiento que ya no esté disponible.
  const seatsById = useMemo(() => {
    const map = new Map<string, SeatMapSeat>();
    for (const seat of resource.data?.seatMap.seats ?? []) map.set(seat.seatId, seat);
    return map;
  }, [resource.data]);

  if (resource.data && !initialised) {
    const requested = (params.seats ?? '').split(',').filter(Boolean);
    setSelected(requested.filter((id) => seatsById.get(id)?.available === true));
    setInitialised(true);
  }

  // Retiene la selección actual durante unos minutos para que nadie más pueda tomarla
  // durante el checkout. Se recrea cada vez que cambia la selección.
  const seatHold = useSeatHold(screeningId ?? undefined, selected);

  const toggle = useCallback((seat: SeatMapSeat) => {
    setSelected((current) =>
      current.includes(seat.seatId)
        ? current.filter((id) => id !== seat.seatId)
        : [...current, seat.seatId],
    );
  }, []);

  const setQuantity = useCallback((inventoryId: string, quantity: number) => {
    setQuantities((current) => {
      const next = new Map(current);
      if (quantity <= 0) next.delete(inventoryId);
      else next.set(inventoryId, quantity);
      return next;
    });
  }, []);

  // Cuando la cuenta regresiva llega a cero, la retención se pierde: vuelve a consultar el mapa
  // para que una selección desactualizada no sorprenda al usuario al enviar.
  const wasExpired = useRef(false);
  if (seatHold.expired && !wasExpired.current) {
    wasExpired.current = true;
    resource.refetch();
  } else if (!seatHold.expired) {
    wasExpired.current = false;
  }

  const productsRequest = quantities.size > 0
    ? [...quantities].map(([inventoryId, quantity]) => ({ inventoryId, quantity }))
    : undefined;

  // Vista previa autorizada del precio: mismo cuerpo y misma validación que
  // create, sin efectos secundarios. Tiene debounce para que no se dispare una petición en cada clic.
  const [quote, setQuote] = useState<ReservationQuoteResponse | null>(null);
  const quoteKey = `${selected.join(',')}|${[...quantities].map((e) => e.join(':')).join(',')}`;
  useEffect(() => {
    if (!screeningId || selected.length === 0) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void quoteReservation(
        {
          movieScreeningId: screeningId,
          seatIds: selected,
          ...(productsRequest ? { products: productsRequest } : {}),
        },
        { signal: controller.signal },
      )
        .then(setQuote)
        .catch(() => setQuote(null));
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteKey deriva las dependencias
  }, [screeningId, quoteKey]);

  const [submitState, submitAction] = useActionState(async (_prev: SubmitState) => {
    try {
      const { data } = await createReservation({
        movieScreeningId: screeningId!,
        seatIds: selected,
        ...(productsRequest ? { products: productsRequest } : {}),
        ...(seatHold.hold ? { holdId: seatHold.hold.uuid } : {}),
      });
      // La retención se consume del lado del servidor al completar con éxito; no la liberes también aquí.
      seatHold.markConsumed();
      window.location.assign(`/reservations/detail?id=${data.uuid}`);
      return initialSubmitState;
    } catch (error) {
      // 409: otra persona reservó uno de estos asientos antes. Volvé a consultar y mostrá cuáles.
      if (isApiError(error) && error.status === 409) {
        const fresh = await getScreeningSeatMap(screeningId!).catch(() => null);
        const lost = fresh
          ? selected.filter(
              (id) => fresh.seats.find((seat) => seat.seatId === id)?.available === false,
            )
          : [];
        resource.refetch();
        setSelected((current) => current.filter((id) => !lost.includes(id)));
        return { error, lostSeatIds: lost };
      }
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

  const chosenProducts = [...quantities]
    .map(([id, quantity]) => {
      const product = products.find((candidate) => candidate.uuid === id);
      return product ? { product, quantity } : null;
    })
    .filter((entry) => entry !== null);

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

  const hasStarted = new Date(screening.startsAt).getTime() <= Date.now();
  const canSubmit = chosenSeats.length > 0 && !hasStarted && !seatHold.expired;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold">{screening.movieName}</h1>
          <p className="text-ink-500 text-sm">
            {formatDateTime(screening.startsAt)} · {screening.roomName}
          </p>
        </header>

        {seatHold.hold && !seatHold.expired && (
          <div
            role="status"
            className="border-brand-500/40 bg-brand-500/10 text-brand-300 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
          >
            <span>Tus asientos están reservados para vos.</span>
            <span className="font-mono tabular-nums">
              {String(Math.floor((seatHold.secondsLeft ?? 0) / 60)).padStart(2, '0')}:
              {String((seatHold.secondsLeft ?? 0) % 60).padStart(2, '0')}
            </span>
          </div>
        )}

        {seatHold.expired && (
          <div
            role="alert"
            className="border-gold-500/40 bg-gold-500/10 text-gold-400 rounded-lg border px-4 py-3 text-sm"
          >
            Tu retención venció. El mapa de asientos se actualizó; volvé a seleccionar.
          </div>
        )}

        {submitState.lostSeatIds.length > 0 && (
          <div
            role="alert"
            className="border-gold-500/40 bg-gold-500/10 text-gold-400 rounded-lg border px-4 py-3 text-sm"
          >
            <p className="font-semibold">Algunos asientos acaban de ocuparse</p>
            <p className="text-ink-300 mt-0.5">
              {submitState.lostSeatIds
                .map((id) => {
                  const seat = seatsById.get(id);
                  return seat ? seatLabel(seat.row, seat.column) : id.slice(0, 8);
                })
                .join(', ')}{' '}
              ahora pertenecen a otro cliente y se quitaron de tu pedido. Elegí reemplazos e
              intentá nuevamente.
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
            selected={selected}
            onToggle={toggle}
            lostSeatIds={submitState.lostSeatIds}
            disabled={hasStarted}
          />
        </section>

        <section className="cine-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Agregar confitería</h2>

          {products.length === 0 ? (
            <p className="text-ink-500 text-sm">No hay productos disponibles en este momento.</p>
          ) : (
            <ul className="divide-ink-800 divide-y">
              {products.map((product) => {
                const quantity = quantities.get(product.uuid) ?? 0;
                const soldOut = !product.available;

                return (
                  <li key={product.uuid} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{product.productName}</p>
                      <p className="text-ink-500 text-xs">
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
                      <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
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
        <form action={submitAction} className="cine-card flex flex-col gap-4 p-5">
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
                        · {seat.seatType === 'PREMIUM' ? 'premium' : 'estándar'}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(
                        quoted?.price ??
                          estimateTotal(screening.basePrice, [seat], [], config.premiumSeatMultiplier)
                            .seatsTotal,
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
                    {formatMoney(quoted?.lineTotal ?? product.price * quantity)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="border-ink-800 flex justify-between border-t pt-3 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </div>

          <SubmitButton disabled={!canSubmit} pendingLabel="Reservando…">
            Confirmar reserva
          </SubmitButton>

          <p className="text-ink-600 text-xs">
            {quote
              ? 'Este total es la cotización de precio confirmada por el servidor.'
              : 'El precio mostrado es una estimación; el total confirmado de tu reserva es el válido.'}
          </p>
        </form>
      </aside>
    </div>
  );
}
