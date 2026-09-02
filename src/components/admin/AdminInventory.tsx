import { useActionState, useState } from 'react';
import {
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  listInventory,
  updateInventoryItem,
  type InventorySortField,
} from '../../lib/api/inventory.ts';
import { useResource } from '../../lib/use-resource.ts';
import { isApiErrorWithStatus, toFieldErrors } from '../../lib/problem.ts';
import { productCategoryLabels, productCategoryValues, type ProductCategory } from '../../lib/enums.ts';
import { formatMoney } from '../../lib/format.ts';
import type { CreateInventoryRequest, InventoryResponse, Page } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Badge, Modal } from '../ui/Modal.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const PAGE_SIZE = 15;
const LOW_STOCK = 10;

interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** Set when an optimistic-lock 409 needs an explicit retry from the user. */
  readonly conflict: boolean;
}

const initialFormState: FormState = { error: null, fieldErrors: {}, conflict: false };

/**
 * `/admin/inventory` — concessions CRUD.
 *
 * `PUT` sets an **absolute** quantity, never a delta, and `Inventory` carries a
 * JPA `@Version`, so a concurrent edit loses with `409`. That case is surfaced
 * as an explicit refetch-and-retry prompt rather than a silent overwrite.
 */
export default function AdminInventory() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<InventorySortField>>('productName,asc');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<InventoryResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowError, setRowError] = useState<unknown>(null);

  const resource = useResource<Page<InventoryResponse>>(
    (signal) =>
      listInventory(
        {
          page,
          size: PAGE_SIZE,
          sort,
          ...(category ? { category } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
        { signal },
      ),
    [page, sort, category, search],
  );

  const remove = async (item: InventoryResponse) => {
    if (!window.confirm(`Delete “${item.productName}”?`)) return;
    setRowError(null);
    try {
      await deleteInventoryItem(item.uuid);
    } catch (error) {
      // 409 when a past reservation line still references the product.
      setRowError(error);
    } finally {
      resource.refetch();
    }
  };

  const columns: readonly Column<InventoryResponse>[] = [
    {
      key: 'productName',
      header: 'Product',
      sortField: 'productName',
      cell: (item) => <span className="font-medium">{item.productName}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      sortField: 'category',
      cell: (item) => <Badge>{productCategoryLabels[item.category]}</Badge>,
    },
    {
      key: 'cost',
      header: 'Unit price',
      sortField: 'cost',
      className: 'tabular-nums',
      cell: (item) => formatMoney(item.cost),
    },
    {
      key: 'quantity',
      header: 'In stock',
      sortField: 'quantity',
      className: 'tabular-nums',
      cell: (item) =>
        item.quantity === 0 ? (
          <Badge tone="danger">Out of stock</Badge>
        ) : item.quantity <= LOW_STOCK ? (
          <Badge tone="warning">{item.quantity} left</Badge>
        ) : (
          item.quantity
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (item) => (
        <div className="flex justify-end gap-1">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={() => setEditing(item)}>
            Edit
          </button>
          <button
            type="button"
            className="cine-btn cine-btn-danger"
            onClick={() => void remove(item)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [InventorySortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Concessions"
      description="Stock is decremented when a reservation is created and restored when it is cancelled."
      action={
        <button
          type="button"
          className="cine-btn cine-btn-primary"
          onClick={() => setCreating(true)}
        >
          New product
        </button>
      }
    >
      <AdminToolbar>
        <div className="min-w-56 flex-1">
          <label htmlFor="inv-search" className="cine-label">
            Search
          </label>
          <input
            id="inv-search"
            type="search"
            className="cine-input"
            value={search}
            placeholder="Product name contains…"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="min-w-48">
          <label htmlFor="inv-category" className="cine-label">
            Category
          </label>
          <select
            id="inv-category"
            className="cine-input"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as ProductCategory | '');
              setPage(0);
            }}
          >
            <option value="">All categories</option>
            {productCategoryValues.map((value) => (
              <option key={value} value={value}>
                {productCategoryLabels[value]}
              </option>
            ))}
          </select>
        </div>
      </AdminToolbar>

      {rowError !== null && <ErrorBanner error={rowError} onRetry={resource.refetch} />}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(item) => item.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No products"
        emptyDescription="Add snacks and drinks so customers can order them at checkout."
        activeSort={{ field: sortField, direction: sortDirection }}
        onSort={(field) => {
          setSort(
            (current) =>
              (current === `${field},asc`
                ? `${field},desc`
                : `${field},asc`) as SortSpec<InventorySortField>,
          );
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />

      {(creating || editing !== null) && (
        <InventoryFormModal
          item={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            resource.refetch();
          }}
          onRefreshed={setEditing}
        />
      )}
    </AdminPage>
  );
}

function InventoryFormModal({
  item,
  onClose,
  onSaved,
  onRefreshed,
}: {
  readonly item: InventoryResponse | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onRefreshed: (item: InventoryResponse) => void;
}) {
  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const body: CreateInventoryRequest = {
      productName: String(formData.get('productName') ?? '').trim(),
      category: String(formData.get('category') ?? '') as ProductCategory,
      cost: Number(formData.get('cost') ?? 0),
      quantity: Number(formData.get('quantity') ?? 0),
    };

    try {
      if (item) await updateInventoryItem(item.uuid, body);
      else await createInventoryItem(body);
      onSaved();
      return initialFormState;
    } catch (error) {
      // A 409 on PUT is either a duplicate name or an optimistic-lock failure.
      // Both are resolved by refetching, so offer that as the next step.
      const conflict = isApiErrorWithStatus(error, 409) && item !== null;
      return { error, fieldErrors: toFieldErrors(error), conflict };
    }
  }, initialFormState);

  const reload = async () => {
    if (!item) return;
    onRefreshed(await getInventoryItem(item.uuid));
  };

  // Re-key on the item's values so a reload after a conflict actually refreshes
  // the uncontrolled inputs.
  const formKey = item
    ? `${item.uuid}:${item.productName}:${item.category}:${item.cost}:${item.quantity}`
    : 'new';

  return (
    <Modal open onClose={onClose} title={item ? 'Edit product' : 'New product'}>
      <form key={formKey} action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />

        {state.conflict && (
          <div className="border-gold-500/40 bg-gold-500/10 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
            <span>
              Someone else changed this product while you were editing. Reload the current values,
              then apply your change again.
            </span>
            <button type="button" className="cine-btn cine-btn-secondary" onClick={() => void reload()}>
              Reload
            </button>
          </div>
        )}

        <TextInput
          label="Product name"
          name="productName"
          required
          maxLength={100}
          defaultValue={item?.productName ?? ''}
          hint="Must be unique, ignoring case."
          error={state.fieldErrors['productName']}
        />

        <SelectInput
          label="Category"
          name="category"
          required
          defaultValue={item?.category ?? productCategoryValues[0]}
          error={state.fieldErrors['category']}
        >
          {productCategoryValues.map((value) => (
            <option key={value} value={value}>
              {productCategoryLabels[value]}
            </option>
          ))}
        </SelectInput>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Unit price"
            name="cost"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={item?.cost ?? ''}
            error={state.fieldErrors['cost']}
          />
          <TextInput
            label="Quantity in stock"
            name="quantity"
            type="number"
            min={0}
            required
            defaultValue={item?.quantity ?? ''}
            hint="Absolute value, not an adjustment."
            error={state.fieldErrors['quantity']}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton pendingLabel="Saving…">{item ? 'Save changes' : 'Create'}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
