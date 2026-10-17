import {
  getPage,
  requestCreated,
  requestJson,
  requestVoid,
  setArchived,
  type CallOptions,
} from './shared.ts';
import type { PageParams } from '../query.ts';
import type {
  BulkSeatsRequest,
  RoomRequest,
  GenerateSeatsRequest,
  Page,
  Room,
  SeatLayout,
  Seat,
  Uuid,
} from '../types.ts';

/** `/api/rooms`: las lecturas son públicas y las escrituras son ADMIN (backend-status-for-frontend.md §5.6). */

export const roomSortFields = ['roomName', 'screenRoomType'] as const;
export type RoomSortField = (typeof roomSortFields)[number];

export type ListRoomsParams = PageParams<RoomSortField> & {
  /** Incluye las archivadas (pantallas de admin). */
  readonly includeArchived?: boolean;
};

export function listRooms(
  params: ListRoomsParams = {},
  options: CallOptions = {},
): Promise<Page<Room>> {
  return getPage<Room>('/api/rooms', params, options);
}

export function getRoom(uuid: Uuid, options: CallOptions = {}): Promise<Room> {
  return requestJson<Room>(`/api/rooms/${uuid}`, options);
}

/** Devuelve un **array plano**, no un contenedor paginado. */
export function getRoomSeats(uuid: Uuid, options: CallOptions = {}): Promise<Seat[]> {
  return requestJson<Seat[]>(`/api/rooms/${uuid}/seats`, options);
}

/** La grilla sin disponibilidad, para el editor de salas de admin. */
export function getRoomLayout(uuid: Uuid, options: CallOptions = {}): Promise<SeatLayout> {
  return requestJson<SeatLayout>(`/api/rooms/${uuid}/layout`, options);
}

/** `409 "Screen room '…' already exists"` ante un choque de nombre sin distinguir mayúsculas. */
export function createRoom(body: RoomRequest) {
  return requestCreated<Room>('/api/rooms', { body, auth: true });
}

/** La unicidad se vuelve a verificar excluyéndose a sí misma, así que conservar el nombre funciona. */
export function updateRoom(
  uuid: Uuid,
  body: RoomRequest,
): Promise<Room> {
  return requestJson<Room>(`/api/rooms/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

/** `409 RESOURCE_IN_USE` si la sala tiene funciones vigentes que no terminaron. */
export function setRoomArchived(uuid: Uuid, archived: boolean): Promise<Room> {
  return setArchived<Room>(`/api/rooms/${uuid}`, archived);
}

export function deleteRoom(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/rooms/${uuid}`, { method: 'DELETE', auth: true });
}

/**
 * Construye una sala completa en una sola transacción
 * (backend-status-for-frontend.md §5.6). `onConflict` vale `FAIL` por defecto, lo que revierte el lote completo
 * con `409 NAME_TAKEN` y `context.conflicts` listando las posiciones estilo `"A1"`
 * en conflicto; `SKIP` deja intactos los asientos existentes; `REPLACE` sobrescribe
 * el `seatType` del asiento existente.
 *
 * Se prefiere la ruta con dos puntos; `…/seats/bulk` es el mismo endpoint publicado
 * bajo un alias con barra para clientes/proxies que alteran `:` en un segmento de ruta.
 */
export function bulkCreateSeats(uuid: Uuid, body: BulkSeatsRequest) {
  return requestCreated<SeatLayout>(`/api/rooms/${uuid}/seats:bulk`, {
    body,
    auth: true,
  });
}

/**
 * Genera una grilla completa: filas `startRow…` (por defecto `A`), columnas `1…columns`
 * (ambas limitadas a 100), `premiumRows` marca filas completas como `PREMIUM`, y `skip`
 * deja vacías coordenadas individuales estilo `"E5"` como pasillos.
 */
export function generateSeats(uuid: Uuid, body: GenerateSeatsRequest) {
  return requestCreated<SeatLayout>(`/api/rooms/${uuid}/seats:generate`, {
    body,
    auth: true,
  });
}
