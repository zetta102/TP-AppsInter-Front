import { getPage, requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type {
  CreateScreenRoomRequest,
  Page,
  ScreenRoomResponse,
  SeatLayoutResponse,
  SeatResponse,
  Uuid,
} from '../types.ts';

/** `/api/rooms` — reads are public, writes are ADMIN (frontend-spec.md §8.2). */

export type RoomSortField = 'roomName' | 'screenRoomType';

export type ListRoomsParams = PageParams<RoomSortField>;

export function listRooms(
  params: ListRoomsParams = {},
  options: CallOptions = {},
): Promise<Page<ScreenRoomResponse>> {
  return getPage<ScreenRoomResponse>('/api/rooms', params, options);
}

export function getRoom(uuid: Uuid, options: CallOptions = {}): Promise<ScreenRoomResponse> {
  return requestJson<ScreenRoomResponse>(`/api/rooms/${uuid}`, options);
}

/** Returns a **plain array**, not a page envelope. */
export function getRoomSeats(uuid: Uuid, options: CallOptions = {}): Promise<SeatResponse[]> {
  return requestJson<SeatResponse[]>(`/api/rooms/${uuid}/seats`, options);
}

/** The grid without availability — for the admin room editor. */
export function getRoomLayout(uuid: Uuid, options: CallOptions = {}): Promise<SeatLayoutResponse> {
  return requestJson<SeatLayoutResponse>(`/api/rooms/${uuid}/layout`, options);
}

/** `409 "Screen room '…' already exists"` on a case-insensitive name clash. */
export function createRoom(body: CreateScreenRoomRequest) {
  return requestCreated<ScreenRoomResponse>('/api/rooms', { body, auth: true });
}

/** Uniqueness is re-checked excluding itself, so keeping the name succeeds. */
export function updateRoom(
  uuid: Uuid,
  body: CreateScreenRoomRequest,
): Promise<ScreenRoomResponse> {
  return requestJson<ScreenRoomResponse>(`/api/rooms/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

export function deleteRoom(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/rooms/${uuid}`, { method: 'DELETE', auth: true });
}
