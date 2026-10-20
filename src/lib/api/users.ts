import { getPage, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { Role } from '../enums.ts';
import type {
  ChangePasswordRequest,
  Page,
  UpdateProfileRequest,
  UpdateRoleRequest,
  User,
  Uuid,
} from '../types.ts';

/**
 * `/api/users`: `me` requiere autenticación; el resto es ADMIN.
 */

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

/** La fuente autoritativa para el control por roles: nunca se decodifica el JWT. */
export function getCurrentUser(options: CallOptions = {}): Promise<User> {
  return requestJson<User>('/api/users/me', { ...options, auth: true });
}

/** `firstName` y `lastName` son ambos `@NotBlank`. */
export function updateMyProfile(body: UpdateProfileRequest): Promise<User> {
  return requestJson<User>('/api/users/me', { method: 'PATCH', body, auth: true });
}

/**
 * `422 WRONG_PASSWORD` cuando `currentPassword` es incorrecta (la sesión sigue válida: no hay que
 * cerrarla). Revoca cada refresh token del llamador excepto `refreshToken`: con el token de la
 * sesión actual se sigue con sesión iniciada acá mientras se cierran las demás; sin él se cierra
 * la sesión en todas partes, incluida la pestaña actual.
 */
export function changeMyPassword(body: ChangePasswordRequest): Promise<void> {
  return requestVoid('/api/users/me/password', { method: 'POST', body, auth: true });
}

export function listUsers(
  params: ListUsersParams = {},
  options: CallOptions = {},
): Promise<Page<User>> {
  return getPage<User>('/api/users', params, { ...options, auth: true });
}

/** `422 LAST_ADMIN` al degradarse a uno mismo o al último admin que queda. */
export function updateUserRole(uuid: Uuid, body: UpdateRoleRequest): Promise<User> {
  return requestJson<User>(`/api/users/${uuid}/role`, {
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
