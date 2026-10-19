import { useDeferredValue, useState, useTransition } from 'react';
import {
  deleteContactMessage,
  listAdminContactMessages,
  openContactMessage,
  type AdminContactMessageSortField,
} from '../../lib/api/contact-messages.ts';
import { useKeyedResource, useResource } from '../../lib/use-resource.ts';
import { formatDateTime } from '../../lib/format.ts';
import { toUserMessage } from '../../lib/problem.ts';
import {
  contactCategoryLabels,
  contactCategoryValues,
  isEnumValue,
  type ContactCategory,
} from '../../lib/enums.ts';
import type { ContactMessage, Page, Uuid } from '../../lib/types.ts';
import { parseSort, toggleSort, type SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Badge, Modal } from '../ui/Modal.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { LoadingBlock } from '../ui/SubmitButton.tsx';

const PAGE_SIZE = 20;

const readFilterValues = ['', 'false', 'true'] as const;
type ReadFilter = (typeof readFilterValues)[number];
const readFilterLabels = {
  '': 'Todos',
  false: 'Sin leer',
  true: 'Leídos',
} as const satisfies Readonly<Record<ReadFilter, string>>;

/**
 * `/admin/contact` — bandeja de mensajes de contacto (backend-status-for-frontend.md §5.13).
 *
 * Listar no marca nada como leído; abrir un mensaje sí (`GET /api/admin/contact-messages/{id}`
 * setea `readAt` la primera vez), y desde ese momento el autor ya no puede editarlo. Por eso el
 * detalle se pide solo cuando el admin lo abre explícitamente. Borrar es definitivo.
 */
export default function AdminContactMessages() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<AdminContactMessageSortField>>('createdAt,desc');
  const [category, setCategory] = useState<ContactCategory | ''>('');
  const [read, setRead] = useState<ReadFilter>('');
  const [email, setEmail] = useState('');
  // Se difiere para no disparar una petición por cada tecla mientras se escribe.
  const deferredEmail = useDeferredValue(email.trim());
  const [openId, setOpenId] = useState<Uuid | null>(null);
  const [rowError, setRowError] = useState<unknown>(null);

  const resource = useResource<Page<ContactMessage>>(
    (signal) =>
      listAdminContactMessages(
        {
          page,
          size: PAGE_SIZE,
          sort,
          ...(category ? { category } : {}),
          ...(read ? { read: read === 'true' } : {}),
          ...(deferredEmail ? { email: deferredEmail } : {}),
        },
        { signal },
      ),
    [page, sort, category, read, deferredEmail],
  );
  const { refetch } = resource;

  const columns: readonly Column<ContactMessage, AdminContactMessageSortField>[] = [
    {
      key: 'createdAt',
      header: 'Recibido',
      sortField: 'createdAt',
      className: 'whitespace-nowrap',
      cell: (message) => formatDateTime(message.createdAt),
    },
    {
      key: 'author',
      header: 'Autor',
      sortField: 'userEmail',
      cell: (message) => (
        <div className="min-w-0">
          <p className="font-medium">
            {message.author.firstName} {message.author.lastName}
          </p>
          <p className="text-xs text-ink-500">{message.author.email}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Motivo',
      sortField: 'category',
      cell: (message) => <Badge>{contactCategoryLabels[message.category]}</Badge>,
    },
    {
      key: 'subject',
      header: 'Asunto',
      cell: (message) => <span className="line-clamp-2 max-w-xs">{message.subject}</span>,
    },
    {
      key: 'readAt',
      header: 'Estado',
      sortField: 'readAt',
      cell: (message) =>
        message.readAt === null ? (
          <Badge tone="warning">Nuevo</Badge>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <Badge>Leído</Badge>
            <span className="text-xs whitespace-nowrap text-ink-500">
              {formatDateTime(message.readAt)}
            </span>
          </div>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (message) => (
        <MessageRowActions
          message={message}
          onOpen={() => setOpenId(message.uuid)}
          onError={setRowError}
          onDone={refetch}
        />
      ),
    },
  ];

  return (
    <AdminPage
      title="Mensajes de contacto"
      description="Consultas enviadas por los clientes. Abrir un mensaje lo marca como leído y el autor ya no puede editarlo."
    >
      <AdminToolbar>
        <TextInput
          label="Email del autor"
          fieldClassName="min-w-48 flex-1"
          type="search"
          value={email}
          placeholder="El email contiene…"
          onChange={(event) => {
            setEmail(event.target.value);
            setPage(0);
          }}
        />

        <SelectInput
          label="Motivo"
          fieldClassName="min-w-48"
          value={category}
          onChange={(event) => {
            const { value } = event.target;
            setCategory(isEnumValue(contactCategoryValues, value) ? value : '');
            setPage(0);
          }}
        >
          <option value="">Todos los motivos</option>
          {contactCategoryValues.map((value) => (
            <option key={value} value={value}>
              {contactCategoryLabels[value]}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          label="Estado"
          fieldClassName="min-w-40"
          value={read}
          onChange={(event) => {
            const { value } = event.target;
            setRead(isEnumValue(readFilterValues, value) ? value : '');
            setPage(0);
          }}
        >
          {readFilterValues.map((value) => (
            <option key={value} value={value}>
              {readFilterLabels[value]}
            </option>
          ))}
        </SelectInput>
      </AdminToolbar>

      {rowError !== null && (
        <div role="alert" className="cine-alert-warning px-4 py-3 text-sm">
          {toUserMessage(rowError)}
        </div>
      )}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(message) => message.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={refetch}
        emptyTitle="No hay mensajes"
        emptyDescription="Ningún mensaje coincide con estos filtros."
        activeSort={parseSort(sort)}
        onSort={(field) => {
          setSort((current) => toggleSort(current, field));
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />

      {openId !== null && (
        <MessageModal
          uuid={openId}
          onClose={() => {
            setOpenId(null);
            // Abrirlo seteó `readAt`: la fila tiene que pasar a "Leído".
            refetch();
          }}
          onDeleted={() => {
            setOpenId(null);
            refetch();
          }}
        />
      )}
    </AdminPage>
  );
}

function confirmDelete(message: ContactMessage): boolean {
  return window.confirm(
    `¿Eliminar el mensaje “${message.subject}” de ${message.author.email}? No se puede deshacer.`,
  );
}

/** Acciones de una fila, con su propia transición: solo esa fila queda pendiente. */
function MessageRowActions({
  message,
  onOpen,
  onError,
  onDone,
}: {
  readonly message: ContactMessage;
  readonly onOpen: () => void;
  readonly onError: (error: unknown) => void;
  readonly onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    if (!confirmDelete(message)) return;
    onError(null);
    startTransition(async () => {
      try {
        await deleteContactMessage(message.uuid);
      } catch (error) {
        onError(error);
      } finally {
        onDone();
      }
    });
  };

  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className="cine-btn cine-btn-ghost px-2 py-1 text-xs"
        disabled={isPending}
        onClick={onOpen}
      >
        Abrir
      </button>
      <button
        type="button"
        className="cine-btn cine-btn-danger px-2 py-1 text-xs"
        disabled={isPending}
        onClick={remove}
      >
        Eliminar
      </button>
    </div>
  );
}

function MessageModal({
  uuid,
  onClose,
  onDeleted,
}: {
  readonly uuid: Uuid;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  // Esta lectura es la que marca el mensaje como leído.
  const resource = useKeyedResource(uuid, (id, signal) => openContactMessage(id, { signal }));
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [isDeleting, startTransition] = useTransition();
  const message = resource.data;

  const remove = () => {
    if (!message || !confirmDelete(message)) return;
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteContactMessage(message.uuid);
        onDeleted();
      } catch (error) {
        setDeleteError(error);
      }
    });
  };

  let content;
  if (resource.isLoading) {
    content = <LoadingBlock label="Abriendo el mensaje…" />;
  } else if (resource.error || !message) {
    content = <ErrorBanner error={resource.error} onRetry={resource.refetch} />;
  } else {
    const { author } = message;
    content = (
      <div className="flex flex-col gap-4">
        <ErrorBanner error={deleteError} />

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-500">De</dt>
          <dd>
            {author.firstName} {author.lastName} ·{' '}
            <a
              href={`mailto:${author.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
              className="text-brand-400 hover:underline"
            >
              {author.email}
            </a>
          </dd>
          <dt className="text-ink-500">Motivo</dt>
          <dd>{contactCategoryLabels[message.category]}</dd>
          <dt className="text-ink-500">Enviado</dt>
          <dd>
            {formatDateTime(message.createdAt)}
            {message.updatedAt && <> · editado el {formatDateTime(message.updatedAt)}</>}
          </dd>
          <dt className="text-ink-500">Leído</dt>
          <dd>{formatDateTime(message.readAt)}</dd>
        </dl>

        <div className="flex flex-col gap-2 border-t border-ink-800 pt-4">
          <h3 className="text-base font-semibold wrap-break-word">{message.subject}</h3>
          <p className="text-sm wrap-break-word whitespace-pre-wrap text-ink-300">{message.body}</p>
        </div>

        <p className="text-xs text-ink-500">
          Al abrirlo quedó marcado como leído: el autor ya no puede editarlo. Respondé por email.
        </p>
      </div>
    );
  }

  return (
    <Modal
      onClose={onClose}
      title="Mensaje de contacto"
      wide
      footer={
        <>
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            className="cine-btn cine-btn-danger"
            disabled={!message || isDeleting}
            onClick={remove}
          >
            Eliminar
          </button>
        </>
      }
    >
      {content}
    </Modal>
  );
}
