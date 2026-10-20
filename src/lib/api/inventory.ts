import {
  getPage,
  requestCreated,
  requestJson,
  requestVoid,
  setArchived,
  type CallOptions,
} from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ProductCategory } from '../enums.ts';
import type {
  InventoryItemRequest,
  InventoryAdjustment,
  InventoryItem,
  Page,
  InventoryAdjustmentRequest,
  Uuid,
} from '../types.ts';

/**
 * `/api/inventory`: **solo ADMIN para todos los métodos, incluido `GET`**.
 *
 * El catálogo público de confitería para clientes es `/api/products` (ver `products.ts`).
 */

export const inventorySortFields = ['productName', 'category', 'cost', 'quantity'] as const;
export type InventorySortField = (typeof inventorySortFields)[number];

export const adjustmentSortFields = ['createdAt', 'delta', 'resultingStock'] as const;
export type AdjustmentSortField = (typeof adjustmentSortFields)[number];

export type InventoryFilters = {
  readonly category?: ProductCategory;
  readonly search?: string;
  /** Incluye los archivados. */
  readonly includeArchived?: boolean;
};

export type ListInventoryParams = PageParams<InventorySortField> & InventoryFilters;

export function listInventory(
  params: ListInventoryParams = {},
  options: CallOptions = {},
): Promise<Page<InventoryItem>> {
  return getPage<InventoryItem>('/api/inventory', params, { ...options, auth: true });
}

export function getInventoryItem(uuid: Uuid, options: CallOptions = {}): Promise<InventoryItem> {
  return requestJson<InventoryItem>(`/api/inventory/${uuid}`, { ...options, auth: true });
}

/** `409 "Product '…' already exists"` ante un choque de nombre sin distinguir mayúsculas. */
export function createInventoryItem(body: InventoryItemRequest) {
  return requestCreated<InventoryItem>('/api/inventory', { body, auth: true });
}

/**
 * Establece una cantidad **absoluta**, no un delta. `Inventory` lleva una
 * `@Version` de JPA, así que una escritura concurrente pierde con
 * `409 "The resource was modified concurrently, please retry"`: hay que refetchear y reintentar.
 */
export function updateInventoryItem(
  uuid: Uuid,
  body: InventoryItemRequest,
): Promise<InventoryItem> {
  return requestJson<InventoryItem>(`/api/inventory/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

/** Siempre permitido: las reservas pasadas conservan sus líneas. */
export function setInventoryArchived(uuid: Uuid, archived: boolean): Promise<InventoryItem> {
  return setArchived<InventoryItem>(`/api/inventory/${uuid}`, archived);
}

/** `409 RESOURCE_IN_USE` cuando una línea de reserva todavía referencia el producto: archivalo. */
export function deleteInventoryItem(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/inventory/${uuid}`, { method: 'DELETE', auth: true });
}

/**
 * Aplica `delta` como un único `UPDATE` condicional atómico: conviene usar esto antes que `PUT`
 * para cualquier acción de "sumar/quitar N", ya que dos ajustes concurrentes se acumulan
 * en lugar de pisarse entre sí. Un delta que llevaría el stock por debajo de cero
 * no cambia nada y devuelve `422 INSUFFICIENT_STOCK` con `context.available`.
 */
export function adjustInventory(
  uuid: Uuid,
  body: InventoryAdjustmentRequest,
): Promise<InventoryItem> {
  return requestJson<InventoryItem>(`/api/inventory/${uuid}/adjustments`, {
    method: 'POST',
    body,
    auth: true,
  });
}

/** El rastro de auditoría paginado detrás de cada ajuste realizado sobre este ítem. */
export function listInventoryAdjustments(
  uuid: Uuid,
  params: PageParams<AdjustmentSortField> = {},
  options: CallOptions = {},
): Promise<Page<InventoryAdjustment>> {
  return getPage<InventoryAdjustment>(`/api/inventory/${uuid}/adjustments`, params, {
    ...options,
    auth: true,
  });
}
