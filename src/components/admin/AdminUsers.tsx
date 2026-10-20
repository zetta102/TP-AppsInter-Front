import { useState, useTransition } from 'react';
import { deleteUser, listUsers, updateUserRole, type UserSortField } from '../../lib/api/users.ts';
import { isEnumValue, Role, roleLabels, roleValues } from '../../lib/enums.ts';
import { isApiErrorWithCode, toUserMessage } from '../../lib/problem.ts';
import { parseSort, toggleSort, type SortSpec } from '../../lib/query.ts';
import type { Page, User } from '../../lib/types.ts';
import { useAuth } from '../../lib/use-auth.ts';
import { useDebouncedSearch } from '../../lib/use-debounced-search.ts';
import { useResource } from '../../lib/use-resource.ts';
import { Badge } from '../ui/Badge.tsx';
import { useConfirm, type ConfirmOptions } from '../ui/ConfirmDialog.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';

const PAGE_SIZE = 20;

/**
 * `/admin/users` — cambios de rol y bajas lógicas.
 *
 * Degradarse a uno mismo o al último administrador restante, y eliminarse a sí
 * mismo o al último administrador restante, devuelve `422 LAST_ADMIN`;
 * eliminar a un usuario que todavía tiene reservas futuras devuelve
 * `409 RESOURCE_IN_USE`. Ambos casos se muestran en línea en lugar de un
 * banner genérico de error.
 *
 * La búsqueda filtra en el servidor por subcadena de email y de nombre (nombre, apellido o
 * nombre completo), sin distinguir mayúsculas.
 */
export default function AdminUsers() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<UserSortField>>('email,asc');
  const [role, setRole] = useState<Role | ''>('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  // Una sola petición cuando se deja de escribir, no una por tecla.
  const debouncedEmail = useDebouncedSearch(email);
  const debouncedName = useDebouncedSearch(name);
  const [rowError, setRowError] = useState<unknown>(null);
  const { confirm, dialog } = useConfirm();

  const resource = useResource<Page<User>>(
    (signal) =>
      listUsers(
        {
          page,
          size: PAGE_SIZE,
          sort,
          ...(role ? { role } : {}),
          ...(debouncedEmail ? { email: debouncedEmail } : {}),
          ...(debouncedName ? { name: debouncedName } : {}),
        },
        { signal },
      ),
    [page, sort, role, debouncedEmail, debouncedName],
  );

  const columns: readonly Column<User, UserSortField>[] = [
    {
      key: 'email',
      header: 'Email',
      sortField: 'email',
      cell: (user) => <span className="font-medium">{user.email}</span>,
    },
    {
      key: 'firstName',
      header: 'Nombre',
      sortField: 'firstName',
      cell: (user) => user.firstName,
    },
    { key: 'lastName', header: 'Apellido', sortField: 'lastName', cell: (user) => user.lastName },
    {
      key: 'role',
      header: 'Rol',
      sortField: 'role',
      cell: (user) => (
        <Badge tone={user.role === Role.ADMIN ? 'premium' : 'neutral'}>
          {roleLabels[user.role]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (user) => (
        <UserRowActions
          user={user}
          isSelf={user.uuid === me?.uuid}
          confirm={confirm}
          onError={setRowError}
          onDone={resource.refetch}
        />
      ),
    },
  ];

  return (
    <AdminPage
      title="Usuarios"
      description="Cuentas registradas. Cambiá el rol para otorgar o revocar acceso de administrador; eliminar realiza una baja lógica."
    >
      {dialog}

      <AdminToolbar>
        <TextInput
          label="Email"
          fieldClassName="min-w-48 flex-1"
          type="search"
          value={email}
          placeholder="El email contiene…"
          onChange={(event) => {
            setEmail(event.target.value);
            setPage(0);
          }}
        />

        <TextInput
          label="Nombre"
          fieldClassName="min-w-48 flex-1"
          type="search"
          value={name}
          placeholder="Nombre o apellido…"
          onChange={(event) => {
            setName(event.target.value);
            setPage(0);
          }}
        />

        <SelectInput
          label="Rol"
          fieldClassName="min-w-48"
          value={role}
          onChange={(event) => {
            const { value } = event.target;
            setRole(isEnumValue(roleValues, value) ? value : '');
            setPage(0);
          }}
        >
          <option value="">Todos los roles</option>
          {roleValues.map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </SelectInput>
      </AdminToolbar>

      {rowError !== null && (
        <div role="alert" className="cine-alert-warning px-4 py-3 text-sm">
          {isApiErrorWithCode(rowError, 'LAST_ADMIN')
            ? 'Siempre debe existir al menos un administrador; no podés degradarte ni eliminarte a vos mismo, ni tampoco al último administrador restante.'
            : isApiErrorWithCode(rowError, 'RESOURCE_IN_USE')
              ? 'Este usuario todavía tiene reservas para una función próxima y aún no puede eliminarse.'
              : toUserMessage(rowError)}
        </div>
      )}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(user) => user.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No hay usuarios"
        emptyDescription="Ninguna cuenta coincide con este filtro."
        activeSort={parseSort(sort)}
        onSort={(field) => {
          setSort((current) => toggleSort(current, field));
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />
    </AdminPage>
  );
}

/** Acciones de una fila, con su propia transición: solo esa fila queda pendiente. */
function UserRowActions({
  user,
  isSelf,
  confirm,
  onError,
  onDone,
}: {
  readonly user: User;
  readonly isSelf: boolean;
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
  readonly onError: (error: unknown) => void;
  readonly onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const nextRole = user.role === Role.ADMIN ? Role.CUSTOMER : Role.ADMIN;

  const run = async (options: ConfirmOptions, action: () => Promise<unknown>) => {
    if (!(await confirm(options))) return;
    onError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        onError(error);
      } finally {
        onDone();
      }
    });
  };

  // Un botón deshabilitado no recibe foco, así que su `title` no llega al teclado ni a los
  // lectores: para la propia cuenta se muestra el motivo como texto visible.
  if (isSelf) {
    return (
      <p className="text-right text-xs text-ink-500">
        Tu cuenta: no podés cambiar tu rol ni eliminarla.
      </p>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className="cine-btn cine-btn-ghost px-2 py-1 text-xs"
        disabled={isPending}
        onClick={() =>
          void run(
            {
              title: 'Cambiar rol',
              message: `¿Cambiar el rol de ${user.email} a ${roleLabels[nextRole]}?`,
              confirmLabel: 'Cambiar rol',
            },
            () => updateUserRole(user.uuid, { role: nextRole }),
          )
        }
      >
        Asignar rol de {roleLabels[nextRole]}
      </button>
      <button
        type="button"
        className="cine-btn cine-btn-danger px-2 py-1 text-xs"
        disabled={isPending}
        onClick={() =>
          void run(
            {
              title: 'Eliminar usuario',
              message: `¿Eliminar ${user.email}? Esta acción no se puede deshacer desde acá.`,
              confirmLabel: 'Eliminar',
              tone: 'danger',
            },
            () => deleteUser(user.uuid),
          )
        }
      >
        Eliminar
      </button>
    </div>
  );
}
