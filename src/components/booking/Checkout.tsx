import { useActionState, useCallback, useMemo, useState } from 'react';
import { getScreening, getScreeningSeatMap } from '../../lib/api/screenings.ts';
import { listInventory } from '../../lib/api/inventory.ts';
import { createReservation } from '../../lib/api/reservations.ts';
import { useResource } from '../../lib/use-resource.ts';
import { useQueryParams } from '../../lib/use-query-param.ts';
import { isApiError } from '../../lib/problem.ts';
import { estimateTotal } from '../../lib/pricing.ts';
import { formatDateTime, formatMoney, seatLabel } from '../../lib/format.ts';
import { productCategoryLabels } from '../../lib/enums.ts';
import type {
  InventoryResponse,
  MovieScreeningResponse,
  SeatMapResponse,
  SeatMapSeat,
} from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { EmptyState, LoadingBlock, SubmitButton } from '../ui/SubmitButton.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { SeatMap } from './SeatMap.tsx';

/**
 * Checkout (frontend-spec.md §8.6, §9).
 *
 * Two behaviours carry the design:
 *  - the concessions catalogue is **admin-only**, so a `403` from
 *    `GET /api/inventory` hides the panel instead of failing checkout;
 *  - seat availability is advisory, so a `409` refetches the map, highlights the
 *    seats that were lost, and asks the user to reselect rather than retrying blind.
 */

interface CheckoutData {
  readonly screening: MovieScreeningResponse;
  readonly seatMap: SeatMapResponse;
  /** `null` when `GET /api/inventory` returned `403` for this (customer) role. */
  readonly products: readonly InventoryResponse[] | null;
}

interface SubmitState {
  readonly error: unknown;
  readonly lostSeatIds: readonly string[];
}

const initialSubmitState: SubmitState = { error: null, lostSeatIds: [] };

export default function Checkout() {
  return (
    <AuthGuard message="Sign in to confirm your reservation. Your seat selection is preserved.">
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
      const [screening, seatMap] = await Promise.all([
        getScreening(screeningId!, { signal }),
        getScreeningSeatMap(screeningId!, { signal }),
      ]);

      let products: readonly InventoryResponse[] | null = null;
      try {
        const page = await listInventory({ size: 100, sort: 'productName,asc' }, { signal });
        products = page.content;
      } catch (error) {
        // Admin-only endpoint: customers get 403 and simply see no concessions.
        if (!isApiError(error) || (error.status !== 403 && error.status !== 401)) throw error;
      }

      return { screening, seatMap, products };
    },
    [screeningId],
    { enabled: Boolean(screeningId) },
  );

  // Seed the selection from the query string once the map is known, dropping
  // anything that is no longer available.
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

  const [submitState, submitAction] = useActionState(async (_prev: SubmitState) => {
    try {
      const { data } = await createReservation({
        movieScreeningId: screeningId!,
        seatIds: selected,
        ...(quantities.size > 0
          ? {
              products: [...quantities].map(([inventoryId, quantity]) => ({
                inventoryId,
                quantity,
              })),
            }
          : {}),
      });
      window.location.assign(`/reservations/detail?id=${data.uuid}`);
      return initialSubmitState;
    } catch (error) {
      // 409: someone booked one of these seats first. Refetch and show which.
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

  // Seat selection is confirmed locally the moment it is clicked; there is
  // nothing pending to reconcile until submission, which replaces the view.

  if (!screeningId) {
    return (
      <EmptyState
        title="No screening selected"
        description="Start from a showtime to choose your seats."
        action={
          <a href="/" className="cine-btn cine-btn-primary">
            See what is showing
          </a>
        }
      />
    );
  }

  if (resource.isLoading) return <LoadingBlock label="Preparing your order…" />;
  if (resource.error) return <ErrorBanner error={resource.error} onRetry={resource.refetch} />;
  if (!resource.data) return null;

  const { screening, seatMap, products } = resource.data;
  const chosenSeats = selected.map((id) => seatsById.get(id)).filter((seat) => seat !== undefined);

  const chosenProducts = products
    ? [...quantities]
        .map(([id, quantity]) => {
          const product = products.find((candidate) => candidate.uuid === id);
          return product ? { product, quantity } : null;
        })
        .filter((entry) => entry !== null)
    : [];

  const estimate = estimateTotal(
    screening.basePrice,
    chosenSeats,
    chosenProducts.map(({ product, quantity }) => ({ cost: product.cost, quantity })),
  );

  const hasStarted = new Date(screening.startsAt).getTime() <= Date.now();
  const canSubmit = chosenSeats.length > 0 && !hasStarted;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold">{screening.movieName}</h1>
          <p className="text-ink-500 text-sm">
            {formatDateTime(screening.startsAt)} · {screening.roomName}
          </p>
        </header>

        {submitState.lostSeatIds.length > 0 && (
          <div
            role="alert"
            className="border-gold-500/40 bg-gold-500/10 text-gold-400 rounded-lg border px-4 py-3 text-sm"
          >
            <p className="font-semibold">Some seats were just taken</p>
            <p className="text-ink-300 mt-0.5">
              {submitState.lostSeatIds
                .map((id) => {
                  const seat = seatsById.get(id);
                  return seat ? seatLabel(seat.row, seat.column) : id.slice(0, 8);
                })
                .join(', ')}{' '}
              went to another customer and have been removed from your order. Pick replacements and
              try again.
            </p>
          </div>
        )}

        {Boolean(submitState.error) && submitState.lostSeatIds.length === 0 && (
          <ErrorBanner error={submitState.error} />
        )}

        <section className="cine-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Your seats</h2>
          <SeatMap
            seatMap={seatMap}
            basePrice={screening.basePrice}
            selected={selected}
            onToggle={toggle}
            lostSeatIds={submitState.lostSeatIds}
            disabled={hasStarted}
          />
        </section>

        {/* The concessions panel disappears entirely when `GET /api/inventory`
            returns 403 — it is an ADMIN-only endpoint today. */}
        {products !== null && (
          <section className="cine-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Add concessions</h2>

            {products.length === 0 ? (
              <p className="text-ink-500 text-sm">Nothing is in stock right now.</p>
            ) : (
              <ul className="divide-ink-800 divide-y">
                {products.map((product) => {
                  const quantity = quantities.get(product.uuid) ?? 0;
                  const soldOut = product.quantity === 0;

                  return (
                    <li key={product.uuid} className="flex items-center gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{product.productName}</p>
                        <p className="text-ink-500 text-xs">
                          {productCategoryLabels[product.category]} · {formatMoney(product.cost)} ·{' '}
                          {soldOut ? 'out of stock' : `${product.quantity} in stock`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="cine-btn cine-btn-ghost px-2 py-1"
                          disabled={quantity === 0}
                          aria-label={`Remove one ${product.productName}`}
                          onClick={() => setQuantity(product.uuid, quantity - 1)}
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
                        <button
                          type="button"
                          className="cine-btn cine-btn-ghost px-2 py-1"
                          disabled={soldOut || quantity >= product.quantity}
                          aria-label={`Add one ${product.productName}`}
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
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <form action={submitAction} className="cine-card flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold">Order summary</h2>

          <ul className="flex flex-col gap-2 text-sm">
            {chosenSeats.length === 0 ? (
              <li className="text-ink-500">No seats selected yet.</li>
            ) : (
              chosenSeats.map((seat) => (
                <li key={seat.seatId} className="flex justify-between gap-3">
                  <span>
                    Seat {seatLabel(seat.row, seat.column)}
                    <span className="text-ink-500"> · {seat.seatType.toLowerCase()}</span>
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(
                      estimateTotal(screening.basePrice, [seat]).seatsTotal,
                    )}
                  </span>
                </li>
              ))
            )}

            {chosenProducts.map(({ product, quantity }) => (
              <li key={product.uuid} className="flex justify-between gap-3">
                <span>
                  {product.productName}
                  <span className="text-ink-500"> × {quantity}</span>
                </span>
                <span className="tabular-nums">{formatMoney(product.cost * quantity)}</span>
              </li>
            ))}
          </ul>

          <div className="border-ink-800 flex justify-between border-t pt-3 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(estimate.total)}</span>
          </div>

          <SubmitButton disabled={!canSubmit} pendingLabel="Reserving…">
            Confirm reservation
          </SubmitButton>

          <p className="text-ink-600 text-xs">
            The price shown is an estimate computed the same way as the server. The confirmed total
            on your reservation is authoritative.
          </p>
        </form>
      </aside>
    </div>
  );
}
