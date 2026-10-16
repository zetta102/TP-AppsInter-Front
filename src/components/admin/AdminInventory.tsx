import { useActionState, useState } from 'react';
import {
  adjustInventory,
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  listInventory,
  listInventoryAdjustments,
  setInventoryArchived,
  updateInventoryItem,
  type InventorySortField,
} from '../../lib/api/inventory.ts';
import { useResource } from '../../lib/use-resource.ts';
import { isApiErrorWithCode, isApiErrorWithStatus, toFieldErrors, toUserMessage } from '../../lib/problem.ts';
import { productCategoryLabels, productCategoryValues, type ProductCategory } from '../../lib/enums.ts';
import { formatDateTime, formatMoney } from '../../lib/format.ts';
import type { CreateInventoryRequest, InventoryResponse, Page } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { ArchivedBadge, ShowArchivedToggle, useArchiveActions } from './archive.tsx';
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
  /** Se establece cuando un 409 por bloqueo optimista requiere un reintento explícito del usuario. */
  readonly conflict: boolean;
}

const initialFormState: FormState = { error: null, fieldErrors: {}, conflict: false };

/**
 * `/admin/inventory` — CRUD de confitería.
 *
 * `PUT` establece una cantidad **absoluta**, nunca una variación, y `Inventory`
 * usa un `@Version` de JPA, por lo que una edición concurrente falla con `409`.
 * Ese caso se muestra como una solicitud explícita de recarga y reintento, en
 * lugar de una sobrescritura silenciosa.
 */
export default function AdminInventory() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<InventorySortField>>('productName,asc');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<InventoryResponse | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const resource = useResource<Page<InventoryResponse>>(
    (signal) =>
      listInventory(
        {
          page,
          size: PAGE_SIZE,
          sort,
          includeArchived: showArchived,
          ...(category ? { category } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
        { signal },
      ),
    [page, sort, category, search, showArchived],
  );

  // Un producto ya vendido no se puede borrar (409): se archiva y deja de ofrecerse.
  const actions = useArchiveActions<InventoryResponse>({
    remove: deleteInventoryItem,
    setArchived: setInventoryArchived,
    refetch: resource.refetch,
    confirmDelete: (item) => `¿Eliminar “${item.productName}”?`,
    name: (item) => item.productName,
  });

  const columns: readonly Column<InventoryResponse>[] = [
    {
      key: 'productName',
      header: 'Producto',
      sortField: 'productName',
      cell: (item) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{item.productName}</span>
          <ArchivedBadge archived={item.archived} />
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      sortField: 'category',
      cell: (item) => <Badge>{productCategoryLabels[item.category]}</Badge>,
    },
    {
      key: 'cost',
      header: 'Precio unitario',
      sortField: 'cost',
      className: 'tabular-nums',
      cell: (item) => formatMoney(item.cost),
    },
    {
      key: 'quantity',
      header: 'En stock',
      sortField: 'quantity',
      className: 'tabular-nums',
      cell: (item) =>
        item.quantity === 0 ? (
          <Badge tone="danger">Sin stock</Badge>
        ) : item.quantity <= LOW_STOCK ? (
          <Badge tone="warning">{item.quantity} disponibles</Badge>
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
          <button
            type="button"
            className="cine-btn cine-btn-secondary"
            onClick={() => setAdjusting(item)}
          >
            Ajustar
          </button>
          <button type="button" className="cine-btn cine-btn-ghost" onClick={() => setEditing(item)}>
            Editar
          </button>
          {actions.buttons(item)}
        </div>
      ),
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [InventorySortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Inventario"
      description="El stock se descuenta cuando se crea una reserva y se repone cuando se cancela."
      action={
        <button
          type="button"
          className="cine-btn cine-btn-primary"
          onClick={() => setCreating(true)}
        >
          Nuevo producto
        </button>
      }
    >
      <AdminToolbar>
        <div className="min-w-56 flex-1">
          <label htmlFor="inv-search" className="cine-label">
            Buscar
          </label>
          <input
            id="inv-search"
            type="search"
            className="cine-input"
            value={search}
            placeholder="El nombre del producto contiene…"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="min-w-48">
          <label htmlFor="inv-category" className="cine-label">
            Categoría
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
            <option value="">Todas las categorías</option>
            {productCategoryValues.map((value) => (
              <option key={value} value={value}>
                {productCategoryLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <ShowArchivedToggle
          checked={showArchived}
          onChange={(checked) => {
            setShowArchived(checked);
            setPage(0);
          }}
        />
      </AdminToolbar>

      {actions.banner}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(item) => item.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No hay productos"
        emptyDescription="Agregá snacks y bebidas para que los clientes puedan pedirlos al finalizar la compra."
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

      {adjusting !== null && (
        <AdjustStockModal
          item={adjusting}
          onClose={() => setAdjusting(null)}
          onAdjusted={() => resource.refetch()}
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
      // Un 409 en PUT indica un nombre duplicado o un fallo de bloqueo optimista.
      // Ambos se resuelven recargando los datos, así que se ofrece ese siguiente paso.
      const conflict = isApiErrorWithStatus(error, 409) && item !== null;
      return { error, fieldErrors: toFieldErrors(error), conflict };
    }
  }, initialFormState);

  const reload = async () => {
    if (!item) return;
    onRefreshed(await getInventoryItem(item.uuid));
  };

  // Se vuelve a crear la clave con los valores del producto para que una recarga
  // después de un conflicto realmente actualice los inputs no controlados.
  const formKey = item
    ? `${item.uuid}:${item.productName}:${item.category}:${item.cost}:${item.quantity}`
    : 'new';

  return (
    <Modal open onClose={onClose} title={item ? 'Editar producto' : 'Nuevo producto'}>
      <form key={formKey} action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />

        {state.conflict && (
          <div className="border-gold-500/40 bg-gold-500/10 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
            <span>
              Otra persona cambió este producto mientras lo estaba editando. Recargue los valores
              actuales y luego vuelva a aplicar su cambio.
            </span>
            <button type="button" className="cine-btn cine-btn-secondary" onClick={() => void reload()}>
              Recargar
            </button>
          </div>
        )}

        <TextInput
          label="Nombre del producto"
          name="productName"
          required
          maxLength={100}
          defaultValue={item?.productName ?? ''}
          hint="Debe ser único, sin distinguir mayúsculas y minúsculas."
          error={state.fieldErrors['productName']}
        />

        <SelectInput
          label="Categoría"
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
            label="Precio unitario"
            name="cost"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={item?.cost ?? ''}
            error={state.fieldErrors['cost']}
          />
          <TextInput
            label="Cantidad en stock"
            name="quantity"
            type="number"
            min={0}
            required
            defaultValue={item?.quantity ?? ''}
            hint="Valor absoluto, no un ajuste."
            error={state.fieldErrors['quantity']}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton pendingLabel="Guardando…">{item ? 'Guardar cambios' : 'Crear'}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

interface AdjustFormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const initialAdjustState: AdjustFormState = { error: null, fieldErrors: {} };

/**
 * Aplica variaciones de stock de forma atómica mediante
 * `POST /api/inventory/{uuid}/adjustments` (nunca con `PUT`, que competiría en
 * una secuencia de lectura-modificación-escritura) y muestra el historial de
 * auditoría asociado a este producto.
 */
function AdjustStockModal({
  item,
  onClose,
  onAdjusted,
}: {
  readonly item: InventoryResponse;
  readonly onClose: () => void;
  readonly onAdjusted: () => void;
}) {
  const [current, setCurrent] = useState(item);

  const history = useResource(
    (signal) =>
      listInventoryAdjustments(current.uuid, { page: 0, size: 10, sort: 'createdAt,desc' }, { signal }),
    [current.uuid],
  );

  const [state, formAction] = useActionState(async (_prev: AdjustFormState, formData: FormData) => {
    const delta = Number(formData.get('delta') ?? 0);
    const reason = String(formData.get('reason') ?? '').trim();

    try {
      const updated = await adjustInventory(current.uuid, { delta, reason });
      setCurrent(updated);
      onAdjusted();
      history.refetch();
      return initialAdjustState;
    } catch (error) {
      return { error, fieldErrors: toFieldErrors(error) };
    }
  }, initialAdjustState);

  return (
    <Modal open onClose={onClose} title={`Ajustar stock — ${current.productName}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutral-400">
          Actualmente hay <span className="font-medium text-neutral-100">{current.quantity}</span>{' '}
          unidades en stock. Ingresá una variación positiva para reponer o una negativa para
          descontar stock; ambas se aplican de forma atómica para que los ajustes concurrentes
          nunca se sobrescriban entre sí.
        </p>

        <form key={current.quantity} action={formAction} className="flex flex-col gap-4" noValidate>
          {state.error !== null && (
            <div className="border-gold-500/40 bg-gold-500/10 text-gold-400 rounded-lg border px-4 py-3 text-sm">
              {toUserMessage(state.error)}
              {isApiErrorWithCode(state.error, 'INSUFFICIENT_STOCK') &&
                typeof state.error.context.available === 'number' && (
                  <p className="text-ink-300 mt-1">Solo hay {state.error.context.available} disponibles.</p>
                )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Variación"
              name="delta"
              type="number"
              step="1"
              required
              hint="Positiva para agregar, negativa para descontar."
              error={state.fieldErrors['delta']}
            />
            <TextInput
              label="Motivo"
              name="reason"
              required
              maxLength={255}
              placeholder="p. ej. merma, reposición, corrección de conteo"
              error={state.fieldErrors['reason']}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
              Cerrar
            </button>
            <SubmitButton pendingLabel="Aplicando…">Aplicar ajuste</SubmitButton>
          </div>
        </form>

        <div className="border-t border-neutral-800 pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Ajustes recientes
          </h3>
          {history.error !== null && <ErrorBanner error={history.error} onRetry={history.refetch} />}
          {history.data !== null && history.data.content.length === 0 && (
            <p className="text-sm text-neutral-500">Todavía no hay ajustes registrados.</p>
          )}
          {history.data !== null && history.data.content.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {history.data.content.map((entry) => (
                <li
                  key={entry.uuid}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 px-3 py-2"
                >
                  <span>
                    <span className={entry.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {entry.delta >= 0 ? '+' : ''}
                      {entry.delta}
                    </span>{' '}
                    <span className="text-neutral-500">→ Quedan {entry.resultingStock}</span>
                    <span className="block text-xs text-neutral-500">
                      {entry.reason} · {entry.adjustedBy ?? 'sistema'}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-neutral-500">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
