import { getPage, requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ProductCategory } from '../enums.ts';
import type { CreateInventoryRequest, InventoryResponse, Page, Uuid } from '../types.ts';

/**
 * `/api/inventory` — **ADMIN-only for every method, including `GET`**
 * (frontend-spec.md §8.5).
 *
 * A `CUSTOMER` calling `GET /api/inventory` receives `403`, so the checkout
 * concessions panel must degrade to hidden. See `backend-spec.md`.
 */

export type InventorySortField = 'productName' | 'category' | 'cost' | 'quantity';

export type InventoryFilters = {
  readonly category?: ProductCategory;
  readonly search?: string;
};

export type ListInventoryParams = PageParams<InventorySortField> & InventoryFilters;

export function listInventory(
  params: ListInventoryParams = {},
  options: CallOptions = {},
): Promise<Page<InventoryResponse>> {
  return getPage<InventoryResponse>('/api/inventory', params, { ...options, auth: true });
}

export function getInventoryItem(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<InventoryResponse> {
  return requestJson<InventoryResponse>(`/api/inventory/${uuid}`, { ...options, auth: true });
}

/** `409 "Product '…' already exists"` on a case-insensitive name clash. */
export function createInventoryItem(body: CreateInventoryRequest) {
  return requestCreated<InventoryResponse>('/api/inventory', { body, auth: true });
}

/**
 * Sets an **absolute** quantity, not a delta. `Inventory` carries a JPA
 * `@Version`, so a concurrent write loses with
 * `409 "The resource was modified concurrently, please retry"` — refetch and retry.
 */
export function updateInventoryItem(
  uuid: Uuid,
  body: CreateInventoryRequest,
): Promise<InventoryResponse> {
  return requestJson<InventoryResponse>(`/api/inventory/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

/** `409` when a reservation line still references the product. */
export function deleteInventoryItem(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/inventory/${uuid}`, { method: 'DELETE', auth: true });
}
