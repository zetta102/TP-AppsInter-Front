import { getPage, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { Role } from '../enums.ts';
import type {
  ChangePasswordRequest,
  Page,
  UpdateProfileRequest,
  UpdateRoleRequest,
  Uuid,
  UserResponse,
} from '../types.ts';

/** `/api/users`: `me` requiere autenticación; el resto es ADMIN. */

export const userSortFields = ['email', 'firstName', 'lastName', 'role'] as const;
export type UserSortField = (typeof userSortFields)[number];

export type UserFilters = {
  readonly role?: Role;
  /** Subcadena del email, sin distinguir mayúsculas. */
  readonly email?: string;
  /** Subcadena del nombre, del apellido o del nombre completo (`ada love`), sin distinguir mayúsculas. */
  readonly name?: string;
};

export type ListUsersParams = PageParams<UserSortField> & UserFilters;

/** La fuente autoritativa para el control por roles: nunca decodifiques el JWT. */
export function getCurrentUser(options: CallOptions = {}): Promise<UserResponse> {
  return requestJson<UserResponse>('/api/users/me', { ...options, auth: true });
}

/** `firstName` y `lastName` son ambos `@NotBlank`. */
export function updateMyProfile(body: UpdateProfileRequest): Promise<UserResponse> {
  return requestJson<UserResponse>('/api/users/me', { method: 'PATCH', body, auth: true });
}

/**
 * `422 WRONG_PASSWORD` cuando `currentPassword` es incorrecta (la sesión sigue válida: no
 * hay que cerrarla). Revoca cada refresh token que
 * posee el llamador excepto `refreshToken`: pasa el token de la sesión actual para
 * seguir con sesión iniciada aquí mientras se cierran las demás, u omítelo para
 * cerrar sesión en todas partes, incluida la pestaña actual.
 */
export function changeMyPassword(body: ChangePasswordRequest): Promise<void> {
  return requestVoid('/api/users/me/password', { method: 'POST', body, auth: true });
}

export function listUsers(
  params: ListUsersParams = {},
  options: CallOptions = {},
): Promise<Page<UserResponse>> {
  return getPage<UserResponse>('/api/users', params, { ...options, auth: true });
}

export function getUser(uuid: Uuid, options: CallOptions = {}): Promise<UserResponse> {
  return requestJson<UserResponse>(`/api/users/${uuid}`, { ...options, auth: true });
}

/** `422 LAST_ADMIN` al degradarte a ti mismo o al último admin que queda. */
export function updateUserRole(uuid: Uuid, body: UpdateRoleRequest): Promise<UserResponse> {
  return requestJson<UserResponse>(`/api/users/${uuid}/role`, {
    method: 'PATCH',
    body,
    auth: true,
  });
}

/**
 * Borrado lógico: la fila sobrevive para que las reservas pasadas sigan resolviendo
 * su propietario, pero el usuario desaparece de los listados y se revoca cada refresh token.
 * `409 RESOURCE_IN_USE` mientras tenga reservas futuras, `422 LAST_ADMIN` para sí mismo o
 * para el último admin. Es idempotente: borrar un usuario ya borrado devuelve un `204` silencioso.
 */
export function deleteUser(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/users/${uuid}`, { method: 'DELETE', auth: true });
}
