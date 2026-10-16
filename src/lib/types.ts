/**
 * Espejo solo de tipos de los DTO del backend (backend-status-for-frontend.md §6).
 *
 * Nada en este módulo emite código de runtime, así que desaparece por completo
 * con el borrado de tipos. Impórtalo con `import type`.
 */

import type {
  MovieGenre,
  ProductCategory,
  ReservationStatus,
  Role,
  ScreenRoomType,
  SeatType,
} from './enums.ts';

/** Un identificador del backend. Siempre es una cadena UUID en el wire. */
export type Uuid = string;

/** Marca de tiempo ISO-8601 *con offset* (`OffsetDateTime`), nunca sin zona. */
export type OffsetDateTimeString = string;

/** Número JSON con 2 decimales. */
export type Money = number;

// ---------------------------------------------------------------------------
// Contenedores y errores
// ---------------------------------------------------------------------------

/** El contenedor que devuelve cada endpoint de lista. `page` es base cero. */
export interface Page<T> {
  readonly content: readonly T[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly first: boolean;
  readonly last: boolean;
  /** `Sort.toString()` de Spring, p. ej. `"movieName: ASC"`. Solo para mostrar; nunca lo parsees. */
  readonly sort: string;
}

/**
 * RFC 7807 `application/problem+json` tal como lo emite el backend
 * (backend-status-for-frontend.md §3.4, §6). Todo error usa esta forma, incluidos
 * los 401/403 emitidos por la cadena de filtros de seguridad.
 */
export interface ProblemDetail {
  /** `https://cine.example/problems/<code-en-kebab>`: un identificador equivalente a `code`, no una página. */
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  /**
   * Presente en fallos de bean validation: un mapa plano campo -> mensaje.
   * Los mensajes se localizan en el servidor, así que la UI debe guiarse solo por el nombre del campo.
   */
  readonly errors?: Readonly<Record<string, string>>;
  /** Presente en `VALIDATION_FAILED`: cada restricción violada, legible por máquina, para traducir en el cliente. */
  readonly violations?: readonly Violation[];
  /** Código de fallo legible por máquina (backend-status-for-frontend.md §8): ramifica con esto, nunca con `detail`. */
  readonly code: string;
  /** Datos extra estructurados cuyas claves dependen de `code`; ausentes cuando no hay nada que agregar. */
  readonly context?: Readonly<Record<string, unknown>>;
}

/**
 * Un body de error que no se puede dar por válido: puede venir de un proxy o gateway
 * (HTML, JSON parcial) o construirse en el cliente (fallos de red). Todo campo es opcional.
 */
export type ProblemPayload = Partial<ProblemDetail>;

/**
 * Una restricción violada (backend-status-for-frontend.md §3.4): `code` es el nombre de la
 * restricción (`NotBlank`, `Size`, `HttpUrl`…) y `params` sus atributos (`{ min: 8, max: 72 }`).
 */
export interface Violation {
  readonly field: string;
  readonly code: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** `PATCH /api/{movies|rooms|screenings|inventory}/{id}`: archivar (`true`) o restaurar (`false`). */
export interface ArchiveRequest {
  readonly archived: boolean;
}

// ---------------------------------------------------------------------------
// Auth y usuarios
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
  readonly tokenType: 'Bearer';
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

/** `PATCH /api/users/me`: ambos campos son obligatorios. */
export interface UpdateProfileRequest {
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * `POST /api/users/me/password`. Omite `refreshToken` para cerrar sesión en todas partes,
 * incluida la pestaña actual; de lo contrario se revoca cada refresh token de *otras* sesiones.
 */
export interface ChangePasswordRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly refreshToken?: string;
}

/** `PATCH /api/users/{uuid}/role`. */
export interface UpdateRoleRequest {
  readonly role: Role;
}

// ---------------------------------------------------------------------------
// Películas
// ---------------------------------------------------------------------------

export interface CreateMovieRequest {
  readonly movieName: string;
  readonly genres: readonly MovieGenre[];
  readonly runtime: number;
  readonly description?: string | null;
  readonly director?: string | null;
  readonly mainCast?: readonly string[];
  /** URL `http(s)` absoluta, máximo 2048 caracteres. */
  readonly posterUrl?: string | null;
  /** URL `http(s)` absoluta, máximo 2048 caracteres. */
  readonly backdropUrl?: string | null;
  /** `1888` … año actual + 10. */
  readonly releaseYear?: number | null;
  /** p. ej. `PG-13`, `ATP`; máximo 16 caracteres. */
  readonly certification?: string | null;
  /** Par ISO 639-1 en minúsculas, p. ej. `en`, `es`. */
  readonly originalLanguage?: string | null;
  /** URL `http(s)` absoluta, máximo 2048 caracteres. */
  readonly trailerUrl?: string | null;
}

/** Todos los campos de presentación son anulables: el backend nunca inventa placeholders. */
export interface MovieResponse {
  readonly uuid: Uuid;
  readonly movieName: string;
  readonly genres: readonly MovieGenre[];
  /** Minutos. */
  readonly runtime: number;
  readonly description: string | null;
  readonly director: string | null;
  readonly mainCast: readonly string[];
  readonly posterUrl: string | null;
  readonly backdropUrl: string | null;
  readonly releaseYear: number | null;
  readonly certification: string | null;
  readonly originalLanguage: string | null;
  readonly trailerUrl: string | null;
  /** Archivada: oculta de los listados por defecto, pero se sigue pudiendo leer por id. */
  readonly archived: boolean;
}

/** `GET /api/movies/now-showing`: una película con sus funciones de la ventana, por `startsAt`. */
export interface NowShowingResponse {
  readonly movie: MovieResponse;
  readonly screenings: readonly MovieScreeningResponse[];
}

// ---------------------------------------------------------------------------
// Salas y asientos
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
  readonly archived: boolean;
}

export interface CreateSeatRequest {
  readonly screenRoomId: Uuid;
  /** Se recorta y pasa a mayúsculas del lado del servidor: envía `"a"` y recibe `"A"`. */
  readonly row: string;
  /** Se recorta del lado del servidor. */
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

/** La grilla de la sala sin disponibilidad, para el editor de salas de admin. */
export interface SeatLayoutResponse {
  readonly screenRoomId: Uuid;
  readonly roomName: string;
  /** Coordenadas únicas, ya ordenadas de forma natural (`A2` va antes que `A10`). */
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  readonly seats: readonly SeatResponse[];
}

// ---------------------------------------------------------------------------
// Funciones
// ---------------------------------------------------------------------------

export interface CreateMovieScreeningRequest {
  readonly movieId: Uuid;
  readonly screenRoomId: Uuid;
  /** Debe estar en el futuro. `endsAt` se calcula del lado del servidor y nunca se envía. */
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
  /** `startsAt + movie.runtime + 15 min` de margen entre funciones. */
  readonly endsAt: OffsetDateTimeString;
  readonly basePrice: Money;
  /**
   * Se incluye por defecto en cada lectura de función; `null` significa "no
   * calculado" (se pidió `includeAvailability=false`), nunca "cero".
   */
  readonly totalSeats: number | null;
  /** Total − vendidos − retenidos por **otros** clientes (con token, las retenciones propias no se descuentan). */
  readonly availableSeats: number | null;
  /** Asientos sin vender retenidos ahora por otros clientes; se liberan al vencer la retención. */
  readonly heldSeats: number | null;
  /** `true` solo cuando **todos** los asientos están vendidos. */
  readonly soldOut: boolean | null;
  /** Una función archivada no acepta retenciones, cotizaciones ni compras (`422 RESOURCE_ARCHIVED`). */
  readonly archived: boolean;
  /** Solo con `GET /api/screenings/{id}?include=seatMap`; en otro caso está ausente. */
  readonly seatMap?: SeatMapResponse;
}

/**
 * Una celda del mapa de asientos de la función. `available: false` significa vendido
 * (`held: false`) o retenido por otro cliente (`held: true`).
 */
export interface SeatMapSeat {
  readonly seatId: Uuid;
  readonly row: string;
  readonly column: string;
  readonly seatType: SeatType;
  readonly available: boolean;
  /**
   * True cuando otro comprador tiene actualmente este asiento retenido. Las
   * retenciones del propio llamador nunca se informan como `held`; los
   * llamadores anónimos ven cada retención activa como `held`.
   */
  readonly held: boolean;
}

export interface SeatMapResponse {
  readonly screeningId: Uuid;
  readonly screenRoomId: Uuid;
  readonly roomName: string;
  /** Ordenado naturalmente: renderízalo en este orden y nunca lo reordenes lexicográficamente. */
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  /** Disperso: un (row, column) sin entrada es un pasillo o hueco. */
  readonly seats: readonly SeatMapSeat[];
}

/** El `data` de un evento `seats` del stream SSE: solo los asientos que cambiaron (§7.6). */
export interface SeatState {
  readonly seatId: Uuid;
  readonly available: boolean;
  readonly held: boolean;
}

// ---------------------------------------------------------------------------
// Retenciones de asientos
// ---------------------------------------------------------------------------

/** `POST /api/screenings/{id}/holds`. Los ids de asiento duplicados se deduplican. */
export interface CreateSeatHoldRequest {
  readonly seatIds: readonly Uuid[];
}

export interface SeatHoldResponse {
  readonly uuid: Uuid;
  readonly screeningId: Uuid;
  readonly seatIds: readonly Uuid[];
  /** Instante de expiración autoritativo. */
  readonly expiresAt: OffsetDateTimeString;
  /** El mismo instante como cuenta regresiva, para clientes con el reloj desfasado. */
  readonly ttlSeconds: number;
}

// ---------------------------------------------------------------------------
// Creación masiva de asientos
// ---------------------------------------------------------------------------

export type SeatConflictPolicy = 'FAIL' | 'SKIP' | 'REPLACE';

export interface BulkSeatEntry {
  readonly row: string;
  readonly column: string;
  readonly seatType: SeatType;
}

/** `POST /api/rooms/{id}/seats:bulk` (alias `…/seats/bulk`). */
export interface BulkCreateSeatsRequest {
  readonly seats: readonly BulkSeatEntry[];
  readonly onConflict?: SeatConflictPolicy;
}

/** `POST /api/rooms/{id}/seats:generate` (alias `…/seats/generate`). */
export interface GenerateSeatsRequest {
  readonly rows: number;
  readonly columns: number;
  readonly startRow?: string;
  /** Filas completas marcadas como `PREMIUM`. */
  readonly premiumRows?: readonly string[];
  /** Coordenadas individuales estilo `"E5"` dejadas vacías como pasillos. */
  readonly skip?: readonly string[];
  readonly onConflict?: SeatConflictPolicy;
}

// ---------------------------------------------------------------------------
// Inventario (confitería): solo admin para todos los métodos, incluido GET
// ---------------------------------------------------------------------------

export interface CreateInventoryRequest {
  readonly productName: string;
  readonly category: ProductCategory;
  readonly cost: Money;
  /** Nivel de stock absoluto, no un delta. */
  readonly quantity: number;
}

export interface InventoryResponse {
  readonly uuid: Uuid;
  readonly productName: string;
  readonly category: ProductCategory;
  readonly cost: Money;
  readonly quantity: number;
  /** Archivado: no se puede pedir y no figura en `/api/products`. */
  readonly archived: boolean;
}

/** `POST /api/inventory/{uuid}/adjustments`: atómico, con `delta` distinto de cero. */
export interface StockAdjustmentRequest {
  readonly delta: number;
  readonly reason: string;
}

export interface InventoryAdjustmentResponse {
  readonly uuid: Uuid;
  readonly delta: number;
  readonly resultingStock: number;
  readonly reason: string;
  /** `null` cuando el ajuste lo originó el sistema o el usuario ya no existe. */
  readonly adjustedBy: string | null;
  readonly createdAt: OffsetDateTimeString;
}

// ---------------------------------------------------------------------------
// Productos (proyección pública de confitería)
// ---------------------------------------------------------------------------

/** La proyección del inventario orientada al cliente: publica el precio y oculta los niveles de stock. */
export interface ProductResponse {
  readonly uuid: Uuid;
  readonly productName: string;
  readonly category: ProductCategory;
  /** Snapshot del `cost` del inventario. */
  readonly price: Money;
  /** `quantity > 0` y no archivado. La cantidad real no se expone deliberadamente. */
  readonly available: boolean;
}

// ---------------------------------------------------------------------------
// Metadatos
// ---------------------------------------------------------------------------

export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

/** `GET /api/metadata/enums`: público, cacheable y con labels solo en inglés. */
export interface MetadataEnumsResponse {
  readonly role: readonly EnumOption[];
  readonly movieGenre: readonly EnumOption[];
  readonly screenRoomType: readonly EnumOption[];
  readonly seatType: readonly EnumOption[];
  readonly productCategory: readonly EnumOption[];
  readonly reservationStatus: readonly EnumOption[];
}

/** `GET /api/metadata/config`: los valores vigentes de constantes de negocio de primera mano. */
export interface MetadataConfigResponse {
  readonly premiumSeatMultiplier: number;
  readonly screeningTurnoverMinutes: number;
  readonly currency: string;
  readonly seatHoldTtlSeconds: number;
}

// ---------------------------------------------------------------------------
// Reservas
// ---------------------------------------------------------------------------

export interface ReservationProductRequest {
  readonly inventoryId: Uuid;
  readonly quantity: number;
}

export interface CreateReservationRequest {
  readonly movieScreeningId: Uuid;
  /** Los duplicados se deduplican silenciosamente del lado del servidor. */
  readonly seatIds: readonly Uuid[];
  /** Opcional. Las repeticiones se agrupan por producto y las cantidades se suman. */
  readonly products?: readonly ReservationProductRequest[];
  /** Retención opcional para consumir; se libera al tener éxito. */
  readonly holdId?: Uuid;
}

export interface TicketResponse {
  readonly uuid: Uuid;
  readonly seatId: Uuid;
  readonly row: string;
  readonly column: string;
  readonly seatType: SeatType;
  readonly price: Money;
}

/** `productName` y `unitPrice` se guardan como snapshot; nunca se vuelve a consultar el inventario. */
export interface ReservationItemResponse {
  readonly uuid: Uuid;
  readonly inventoryId: Uuid;
  readonly productName: string;
  readonly unitPrice: Money;
  readonly quantity: number;
  readonly lineTotal: Money;
}

/** El propietario de la reserva, embebido en cada endpoint de reservas. */
export interface ReservationOwner {
  readonly uuid: Uuid;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface ReservationResponse {
  readonly uuid: Uuid;
  /** Presente en cada endpoint de reservas; no hace falta un segundo fetch. */
  readonly user: ReservationOwner;
  readonly movieScreeningId: Uuid;
  readonly movieName: string;
  readonly screeningStartsAt: OffsetDateTimeString;
  readonly roomName: string;
  readonly status: ReservationStatus;
  /** "Lo que todavía se adeuda": `0` una vez cancelada. */
  readonly totalPrice: Money;
  /** Lo que se cobró originalmente; `null` hasta cancelar. */
  readonly originalTotalPrice: Money | null;
  readonly createdAt: OffsetDateTimeString;
  /** `null` until cancelled. */
  readonly cancelledAt: OffsetDateTimeString | null;
  /** Se conserva (no se elimina) después de una cancelación lógica. */
  readonly tickets: readonly TicketResponse[];
  /** Se conserva (no se elimina) después de una cancelación lógica. */
  readonly items: readonly ReservationItemResponse[];
}

// ---------------------------------------------------------------------------
// Cotización de precio de reserva
// ---------------------------------------------------------------------------

export interface QuoteTicket {
  readonly seatId: Uuid;
  readonly row: string;
  readonly column: string;
  readonly seatType: SeatType;
  readonly price: Money;
}

export interface QuoteItem {
  readonly inventoryId: Uuid;
  readonly productName: string;
  readonly unitPrice: Money;
  readonly quantity: number;
  readonly lineTotal: Money;
}

/** Respuesta de `POST /api/reservations:quote`: sin efectos secundarios; `totalPrice` es autoritativo. */
export interface ReservationQuoteResponse {
  readonly tickets: readonly QuoteTicket[];
  readonly items: readonly QuoteItem[];
  readonly ticketsTotal: Money;
  readonly itemsTotal: Money;
  readonly totalPrice: Money;
}
