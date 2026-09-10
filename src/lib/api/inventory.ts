import { getPage, requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ProductCategory } from '../enums.ts';
import type {
  CreateInventoryRequest,
  InventoryAdjustmentResponse,
  InventoryResponse,
  Page,
  StockAdjustmentRequest,
  Uuid,
} from '../types.ts';

/**
 * `/api/inventory`: **solo ADMIN para todos los métodos, incluido `GET`**
 * (frontend-spec.md §8.5).
 *
 * Un `CUSTOMER` que llama `GET /api/inventory` recibe `403`, así que el panel
 * de confitería de la compra debe degradarse ocultándose. Ver `backend-spec.md`.
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

/** `409 "Product '…' already exists"` ante un choque de nombre sin distinguir mayúsculas. */
export function createInventoryItem(body: CreateInventoryRequest) {
  return requestCreated<InventoryResponse>('/api/inventory', { body, auth: true });
}

/**
 * Establece una cantidad **absoluta**, no un delta. `Inventory` lleva una
 * `@Version` de JPA, así que una escritura concurrente pierde con
 * `409 "The resource was modified concurrently, please retry"`: hay que refetchear y reintentar.
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

/** `409` cuando una línea de reserva todavía referencia el producto. */
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
  body: StockAdjustmentRequest,
): Promise<InventoryResponse> {
  return requestJson<InventoryResponse>(`/api/inventory/${uuid}/adjustments`, {
    method: 'POST',
    body,
    auth: true,
  });
}

/** El rastro de auditoría paginado detrás de cada ajuste realizado sobre este ítem. */
export function listInventoryAdjustments(
  uuid: Uuid,
  params: PageParams<'createdAt'> = {},
  options: CallOptions = {},
): Promise<Page<InventoryAdjustmentResponse>> {
  return getPage<InventoryAdjustmentResponse>(`/api/inventory/${uuid}/adjustments`, params, {
    ...options,
    auth: true,
  });
}
