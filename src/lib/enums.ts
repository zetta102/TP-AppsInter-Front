/**
 * Enums del contrato del backend.
 *
 * Se modelan como objetos `as const` más uniones derivadas: `erasableSyntaxOnly`
 * prohíbe la palabra clave `enum`, y las uniones dan chequeo exhaustivo en `switch`
 * sin emitir construcciones que TypeScript no pueda borrar.
 *
 * SIEMPRE enviá y compará el nombre de la constante. Las etiquetas del backend no se
 * muestran: las de abajo son la traducción del cliente. Ojo con
 * `THREED`/`FOURD`: el valor en el cable NO es `3D`/`4D`.
 */

export const Role = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const MovieGenre = {
  ACTION: 'ACTION',
  THRILLER: 'THRILLER',
  TERROR: 'TERROR',
  ROMANCE: 'ROMANCE',
  COMEDY: 'COMEDY',
  DRAMA: 'DRAMA',
  ANIMATION: 'ANIMATION',
  SCI_FI: 'SCI_FI',
} as const;
export type MovieGenre = (typeof MovieGenre)[keyof typeof MovieGenre];

export const ScreenRoomType = {
  NORMAL: 'NORMAL',
  THREED: 'THREED',
  FOURD: 'FOURD',
  IMAX: 'IMAX',
} as const;
export type ScreenRoomType = (typeof ScreenRoomType)[keyof typeof ScreenRoomType];

export const SeatType = {
  NORMAL: 'NORMAL',
  PREMIUM: 'PREMIUM',
} as const;
export type SeatType = (typeof SeatType)[keyof typeof SeatType];

export const ReservationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const ProductCategory = {
  SNACK: 'SNACK',
  DRINK: 'DRINK',
  COMBO: 'COMBO',
  MERCHANDISE: 'MERCHANDISE',
} as const;
export type ProductCategory = (typeof ProductCategory)[keyof typeof ProductCategory];

export const ContactCategory = {
  GENERAL: 'GENERAL',
  RESERVATION: 'RESERVATION',
  COMPLAINT: 'COMPLAINT',
  SUGGESTION: 'SUGGESTION',
} as const;
export type ContactCategory = (typeof ContactCategory)[keyof typeof ContactCategory];

/** Asocia cada miembro de una unión tipo enum con su texto visible. */
type LabelMap<T extends string> = Readonly<Record<T, string>>;

export const roleLabels = {
  CUSTOMER: 'Cliente',
  ADMIN: 'Administrador',
} as const satisfies LabelMap<Role>;

export const movieGenreLabels = {
  ACTION: 'Acción',
  THRILLER: 'Suspenso',
  TERROR: 'Terror',
  ROMANCE: 'Romance',
  COMEDY: 'Comedia',
  DRAMA: 'Drama',
  ANIMATION: 'Animación',
  SCI_FI: 'Ciencia ficción',
} as const satisfies LabelMap<MovieGenre>;

export const screenRoomTypeLabels = {
  NORMAL: 'Normal',
  THREED: '3D',
  FOURD: '4D',
  IMAX: 'IMAX',
} as const satisfies LabelMap<ScreenRoomType>;

export const seatTypeLabels = {
  NORMAL: 'Normal',
  PREMIUM: 'Premium',
} as const satisfies LabelMap<SeatType>;

export const reservationStatusLabels = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
} as const satisfies LabelMap<ReservationStatus>;

export const productCategoryLabels = {
  SNACK: 'Snack',
  DRINK: 'Bebida',
  COMBO: 'Combo',
  MERCHANDISE: 'Merchandising',
} as const satisfies LabelMap<ProductCategory>;

export const contactCategoryLabels = {
  GENERAL: 'Consulta general',
  RESERVATION: 'Reservas',
  COMPLAINT: 'Reclamo',
  SUGGESTION: 'Sugerencia',
} as const satisfies LabelMap<ContactCategory>;

/** Listas ordenadas de valores, para opciones de `<select>` y chips de filtro. */
export const movieGenreValues = Object.keys(movieGenreLabels) as readonly MovieGenre[];
export const screenRoomTypeValues = Object.keys(screenRoomTypeLabels) as readonly ScreenRoomType[];
export const seatTypeValues = Object.keys(seatTypeLabels) as readonly SeatType[];
export const reservationStatusValues = Object.keys(
  reservationStatusLabels,
) as readonly ReservationStatus[];
export const productCategoryValues = Object.keys(
  productCategoryLabels,
) as readonly ProductCategory[];
export const roleValues = Object.keys(roleLabels) as readonly Role[];
export const contactCategoryValues = Object.keys(
  contactCategoryLabels,
) as readonly ContactCategory[];

/**
 * Type guard para valores que llegan como `string` (un `<select>`, `FormData`): reemplaza el
 * `as` por una verificación real contra la lista de valores del enum.
 */
export function isEnumValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
