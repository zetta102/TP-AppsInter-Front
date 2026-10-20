import { getPage, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ProductCategory } from '../enums.ts';
import type { Page, Product } from '../types.ts';

/**
 * `/api/products`: la proyección **pública** del inventario orientada al cliente.
 * Publica `price` y `available`; el stock bruto en `quantity` no se expone deliberadamente.
 *
 * Es lo que usa la confitería del checkout; `/api/inventory` queda solo para admin.
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
): Promise<Page<Product>> {
  return getPage<Product>('/api/products', params, options);
}
