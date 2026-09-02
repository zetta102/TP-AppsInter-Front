/**
 * Wire-level enums from the backend contract (frontend-spec.md §7).
 *
 * Modelled as `as const` objects plus derived union types: `erasableSyntaxOnly`
 * forbids the `enum` keyword, and unions give us exhaustive `switch` checking
 * without emitting runtime constructs TypeScript cannot erase.
 *
 * ALWAYS send and compare the constant name. The label is the backend's display
 * name — reuse it so the UI and the API agree. Note `THREED`/`FOURD`: the wire
 * value is NOT `3D`/`4D`.
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

/** Maps every member of an enum-like union to a display string. */
type LabelMap<T extends string> = Readonly<Record<T, string>>;

export const roleLabels = {
  CUSTOMER: 'Customer',
  ADMIN: 'Admin',
} as const satisfies LabelMap<Role>;

export const movieGenreLabels = {
  ACTION: 'Action',
  THRILLER: 'Thriller',
  TERROR: 'Terror',
  ROMANCE: 'Romance',
  COMEDY: 'Comedy',
  DRAMA: 'Drama',
  ANIMATION: 'Animation',
  SCI_FI: 'Sci-Fi',
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
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
} as const satisfies LabelMap<ReservationStatus>;

export const productCategoryLabels = {
  SNACK: 'Snack',
  DRINK: 'Drink',
  COMBO: 'Combo',
  MERCHANDISE: 'Merchandise',
} as const satisfies LabelMap<ProductCategory>;

/** Ordered value lists, handy for `<select>` options and filter chips. */
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
