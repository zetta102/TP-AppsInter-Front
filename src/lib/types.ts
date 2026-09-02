/**
 * Type-only mirror of the backend DTOs (frontend-spec.md §8).
 *
 * Nothing in this module emits runtime code, so it disappears entirely under
 * type erasure. Import it with `import type`.
 */

import type {
  MovieGenre,
  ProductCategory,
  ReservationStatus,
  Role,
  ScreenRoomType,
  SeatType,
} from './enums.ts';

/** A backend identifier. Always a UUID string on the wire. */
export type Uuid = string;

/** ISO-8601 timestamp *with offset* (`OffsetDateTime`), never zone-less. */
export type OffsetDateTimeString = string;

/** JSON number with 2 decimals. */
export type Money = number;

// ---------------------------------------------------------------------------
// Envelopes and errors
// ---------------------------------------------------------------------------

/** The envelope returned by every list endpoint. `page` is zero-based. */
export interface Page<T> {
  readonly content: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly first: boolean;
  readonly last: boolean;
  /** Spring's `Sort.toString()`, e.g. `"movieName: ASC"`. Display only — never parse. */
  readonly sort: string;
}

/**
 * RFC 7807 `application/problem+json`. Every error uses this shape, including
 * 401/403 emitted by the security filter chain.
 */
export interface ProblemDetail {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
  /**
   * Present on bean-validation failures: a flat field -> message map. The
   * messages are server-localised, so key your UI off the field name only.
   */
  readonly errors?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Auth & users
// ---------------------------------------------------------------------------

export interface RegisterRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
}

export interface CreateUserResponse {
  readonly uuid: Uuid;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: Role;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface RefreshRequest {
  readonly refreshToken: string;
}

export interface AuthResponse {
  readonly token: string;
  readonly tokenType: string;
  readonly expiresAt: OffsetDateTimeString;
  readonly refreshToken: string;
  readonly refreshExpiresAt: OffsetDateTimeString;
}

export interface UserResponse {
  readonly uuid: Uuid;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: Role;
}

// ---------------------------------------------------------------------------
// Movies
// ---------------------------------------------------------------------------

export interface CreateMovieRequest {
  readonly movieName: string;
  readonly genres: readonly MovieGenre[];
  readonly runtime: number;
  readonly description?: string | null;
  readonly director?: string | null;
  readonly mainCast?: readonly string[] | null;
}

export interface MovieResponse {
  readonly uuid: Uuid;
  readonly movieName: string;
  readonly genres: readonly MovieGenre[];
  /** Minutes. */
  readonly runtime: number;
  readonly description: string | null;
  readonly director: string | null;
  readonly mainCast: readonly string[];
}

// ---------------------------------------------------------------------------
// Screen rooms & seats
// ---------------------------------------------------------------------------

export interface CreateScreenRoomRequest {
  readonly roomName: string;
  readonly screenRoomType: ScreenRoomType;
}

export interface ScreenRoomResponse {
  readonly uuid: Uuid;
  readonly roomName: string;
  readonly screenRoomType: ScreenRoomType;
  readonly seatCount: number;
}

export interface CreateSeatRequest {
  readonly screenRoomId: Uuid;
  /** Trimmed and upper-cased server-side: send `"a"`, read back `"A"`. */
  readonly row: string;
  /** Trimmed server-side. */
  readonly column: string;
  readonly seatType: SeatType;
}

export interface SeatResponse {
  readonly uuid: Uuid;
  readonly screenRoomId: Uuid;
  readonly row: string;
  readonly column: string;
  readonly seatType: SeatType;
}

/** The room grid without availability — for the admin room editor. */
export interface SeatLayoutResponse {
  readonly screenRoomId: Uuid;
  readonly roomName: string;
  /** Distinct coordinates, already sorted naturally (`A2` precedes `A10`). */
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  readonly seats: readonly SeatResponse[];
}

// ---------------------------------------------------------------------------
// Screenings
// ---------------------------------------------------------------------------

export interface CreateMovieScreeningRequest {
  readonly movieId: Uuid;
  readonly screenRoomId: Uuid;
  /** Must be in the future. `endsAt` is computed server-side, never sent. */
  readonly startsAt: OffsetDateTimeString;
  readonly basePrice: Money;
}

export interface MovieScreeningResponse {
  readonly uuid: Uuid;
  readonly movieId: Uuid;
  readonly movieName: string;
  readonly screenRoomId: Uuid;
  readonly roomName: string;
  readonly startsAt: OffsetDateTimeString;
  /** `startsAt + movie.runtime + 15 min` turnover. */
  readonly endsAt: OffsetDateTimeString;
  readonly basePrice: Money;
}

/** One cell of the screening seat map. `available: false` means already ticketed. */
export interface SeatMapSeat {
  readonly seatId: Uuid;
  readonly row: string;
  readonly column: string;
  readonly seatType: SeatType;
  readonly available: boolean;
}

export interface SeatMapResponse {
  readonly screeningId: Uuid;
  readonly screenRoomId: Uuid;
  readonly roomName: string;
  /** Naturally sorted — render in this order, never re-sort lexicographically. */
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  /** Sparse: a (row, column) with no entry is an aisle or gap. */
  readonly seats: readonly SeatMapSeat[];
}

// ---------------------------------------------------------------------------
// Inventory (concessions) — admin-only for every method, including GET
// ---------------------------------------------------------------------------

export interface CreateInventoryRequest {
  readonly productName: string;
  readonly category: ProductCategory;
  readonly cost: Money;
  /** Absolute stock level, not a delta. */
  readonly quantity: number;
}

export interface InventoryResponse {
  readonly uuid: Uuid;
  readonly productName: string;
  readonly category: ProductCategory;
  readonly cost: Money;
  readonly quantity: number;
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

export interface ReservationProductRequest {
  readonly inventoryId: Uuid;
  readonly quantity: number;
}

export interface CreateReservationRequest {
  readonly movieScreeningId: Uuid;
  /** Duplicates are silently de-duplicated server-side. */
  readonly seatIds: readonly Uuid[];
  /** Optional. Repeats are merged by product and quantities summed. */
  readonly products?: readonly ReservationProductRequest[];
}

export interface TicketResponse {
  readonly uuid: Uuid;
  readonly seatId: Uuid;
  readonly row: string;
  readonly column: string;
  readonly seatType: SeatType;
  readonly price: Money;
}

/** `productName` and `unitPrice` are snapshotted — never re-look-up inventory. */
export interface ReservationItemResponse {
  readonly uuid: Uuid;
  readonly inventoryId: Uuid;
  readonly productName: string;
  readonly unitPrice: Money;
  readonly quantity: number;
  readonly lineTotal: Money;
}

export interface ReservationResponse {
  readonly uuid: Uuid;
  readonly movieScreeningId: Uuid;
  readonly movieName: string;
  readonly status: ReservationStatus;
  readonly totalPrice: Money;
  readonly createdAt: OffsetDateTimeString;
  readonly tickets: readonly TicketResponse[];
  readonly items: readonly ReservationItemResponse[];
}
