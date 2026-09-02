import { getPage, requestJson, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { Role } from '../enums.ts';
import type { Page, Uuid, UserResponse } from '../types.ts';

/** `/api/users` — `me` is authenticated, the rest is ADMIN. */

export type UserSortField = 'email' | 'firstName' | 'lastName' | 'role';

export type UserFilters = {
  readonly role?: Role;
};

export type ListUsersParams = PageParams<UserSortField> & UserFilters;

/** The authoritative source for role gating — never decode the JWT. */
export function getCurrentUser(options: CallOptions = {}): Promise<UserResponse> {
  return requestJson<UserResponse>('/api/users/me', { ...options, auth: true });
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
