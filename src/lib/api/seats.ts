import { requestCreated, requestJson, requestVoid } from './shared.ts';
import type { CallOptions } from './shared.ts';
import type { CreateSeatRequest, SeatResponse, Uuid } from '../types.ts';

/**
 * `/api/seats` — reads are public, writes are ADMIN (frontend-spec.md §8.3).
 *
 * Normalisation: `row` is trimmed and upper-cased, `column` is trimmed. Send
 * `"a"`, read back `"A"`. Blank values are rejected with `400`.
 */

export function getSeat(uuid: Uuid, options: CallOptions = {}): Promise<SeatResponse> {
  return requestJson<SeatResponse>(`/api/seats/${uuid}`, options);
}

/** `409 "Seat A1 already exists in room …"` on a duplicate position. */
export function createSeat(body: CreateSeatRequest) {
  return requestCreated<SeatResponse>('/api/seats', { body, auth: true });
}

/** Position uniqueness is re-checked excluding itself. */
export function updateSeat(uuid: Uuid, body: CreateSeatRequest): Promise<SeatResponse> {
  return requestJson<SeatResponse>(`/api/seats/${uuid}`, { method: 'PUT', body, auth: true });
}

export function deleteSeat(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/seats/${uuid}`, { method: 'DELETE', auth: true });
}

export interface BulkSeatOutcome {
  readonly request: CreateSeatRequest;
  readonly seat: SeatResponse | null;
  readonly error: unknown;
}

export interface BulkSeatResult {
  readonly created: readonly SeatResponse[];
  readonly failures: readonly BulkSeatOutcome[];
}

/**
 * There is no bulk seat endpoint, so the grid builder issues one `POST` per
 * seat. We cap concurrency and collect per-seat outcomes so partial failure can
 * be surfaced instead of silently losing rows.
 */
export async function createSeats(
  requests: readonly CreateSeatRequest[],
  options: {
    readonly concurrency?: number;
    readonly onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<BulkSeatResult> {
  const { concurrency = 4, onProgress } = options;
  const outcomes: BulkSeatOutcome[] = new Array(requests.length);
  let cursor = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (cursor < requests.length) {
      const index = cursor++;
      const request = requests[index]!;
      try {
        const { data } = await createSeat(request);
        outcomes[index] = { request, seat: data, error: null };
      } catch (error) {
        outcomes[index] = { request, seat: null, error };
      }
      onProgress?.(++completed, requests.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, requests.length) }, () => worker()),
  );

  return {
    created: outcomes.filter((outcome) => outcome.seat !== null).map((outcome) => outcome.seat!),
    failures: outcomes.filter((outcome) => outcome.seat === null),
  };
}
