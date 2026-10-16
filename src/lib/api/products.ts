import { getPage, requestJson, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ProductCategory } from '../enums.ts';
import type { Page, ProductResponse, Uuid } from '../types.ts';

/**
 * `/api/products`: la proyección **pública** del inventario orientada al cliente
 * (backend-status-for-frontend.md §5.10). Publica `price` y `available`; el stock bruto en
 * `quantity` no se expone deliberadamente.
 *
 * Reemplaza el viejo workaround de llamar al `GET /api/inventory` solo para admin
 * y ocultar el panel de confitería ante un `403`.
 */

export const productSortFields = ['productName', 'category', 'price'] as const;
export type ProductSortField = (typeof productSortFields)[number];

export type ProductFilters = {
  readonly category?: ProductCategory;
  readonly search?: string;
};

export type ListProductsParams = PageParams<ProductSortField> & ProductFilters;

export function listProducts(
  params: ListProductsParams = {},
  options: CallOptions = {},
): Promise<Page<ProductResponse>> {
  return getPage<ProductResponse>('/api/products', params, options);
}

export function getProduct(uuid: Uuid, options: CallOptions = {}): Promise<ProductResponse> {
  return requestJson<ProductResponse>(`/api/products/${uuid}`, options);
}
