import { useDeferredValue, useState } from 'react';
import { useAuth } from '../../lib/auth-context.tsx';
import { deleteUser, listUsers, updateUserRole, type UserSortField } from '../../lib/api/users.ts';
import { useResource } from '../../lib/use-resource.ts';
import { isApiErrorWithCode, toUserMessage } from '../../lib/problem.ts';
import { Role, roleLabels, roleValues } from '../../lib/enums.ts';
import type { Page, UserResponse } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { Badge } from '../ui/Modal.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const PAGE_SIZE = 20;
/**
 * `/admin/users` — cambios de rol y bajas lógicas (backend-status-for-frontend.md §5.3).
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
  // Se difieren para no disparar una petición por cada tecla mientras se escribe.
  const deferredEmail = useDeferredValue(email.trim());
  const deferredName = useDeferredValue(name.trim());
  const [rowError, setRowError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const resource = useResource<Page<UserResponse>>(
    (signal) =>
      listUsers(
        {
          page,
          size: PAGE_SIZE,
          sort,
          ...(role ? { role } : {}),
          ...(deferredEmail ? { email: deferredEmail } : {}),
          ...(deferredName ? { name: deferredName } : {}),
        },
        { signal },
      ),
    [page, sort, role, deferredEmail, deferredName],
  );

  const toggleRole = async (target: UserResponse) => {
    const next = target.role === Role.ADMIN ? Role.CUSTOMER : Role.ADMIN;
    if (
      !window.confirm(`¿Cambiar el rol de ${target.email} a ${roleLabels[next]}?`)
    ) {
      return;
    }
    setRowError(null);
    setBusyId(target.uuid);
    try {
      await updateUserRole(target.uuid, { role: next });
    } catch (error) {
      setRowError(error);
    } finally {
      setBusyId(null);
      resource.refetch();
    }
  };

  const remove = async (target: UserResponse) => {
    if (!window.confirm(`¿Eliminar ${target.email}? Esta acción no se puede deshacer desde aquí.`)) return;
    setRowError(null);
    setBusyId(target.uuid);
    try {
      await deleteUser(target.uuid);
    } catch (error) {
      setRowError(error);
    } finally {
      setBusyId(null);
      resource.refetch();
    }
  };

  const columns: readonly Column<UserResponse>[] = [
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
        <Badge tone={user.role === Role.ADMIN ? 'premium' : 'neutral'}>{roleLabels[user.role]}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (user) => {
        const isSelf = user.uuid === me?.uuid;
        return (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="cine-btn cine-btn-ghost px-2 py-1 text-xs"
              disabled={busyId === user.uuid || isSelf}
              title={isSelf ? 'No podés cambiar tu propio rol.' : undefined}
              onClick={() => void toggleRole(user)}
            >
              Asignar rol de {user.role === Role.ADMIN ? roleLabels[Role.CUSTOMER] : roleLabels[Role.ADMIN]}
            </button>
            <button
              type="button"
              className="cine-btn cine-btn-danger px-2 py-1 text-xs"
              disabled={busyId === user.uuid || isSelf}
              title={isSelf ? 'No podés eliminar tu propia cuenta.' : undefined}
              onClick={() => void remove(user)}
            >
              Eliminar
            </button>
          </div>
        );
      },
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [UserSortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Usuarios"
      description="Cuentas registradas. Cambiá el rol para otorgar o revocar acceso de administrador; eliminar realiza una baja lógica."
    >
      <AdminToolbar>
        <div className="min-w-48 flex-1">
          <label htmlFor="user-email" className="cine-label">
            Email
          </label>
          <input
            id="user-email"
            type="search"
            className="cine-input"
            value={email}
            placeholder="El email contiene…"
            onChange={(event) => {
              setEmail(event.target.value);
              setPage(0);
            }}
          />
        </div>

        <div className="min-w-48 flex-1">
          <label htmlFor="user-name" className="cine-label">
            Nombre
          </label>
          <input
            id="user-name"
            type="search"
            className="cine-input"
            value={name}
            placeholder="Nombre o apellido…"
            onChange={(event) => {
              setName(event.target.value);
              setPage(0);
            }}
          />
        </div>

        <div className="min-w-48">
          <label htmlFor="user-role" className="cine-label">
            Rol
          </label>
          <select
            id="user-role"
            className="cine-input"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as Role | '');
              setPage(0);
            }}
          >
            <option value="">Todos los roles</option>
            {roleValues.map((value) => (
              <option key={value} value={value}>
                {roleLabels[value]}
              </option>
            ))}
          </select>
        </div>
      </AdminToolbar>

      {rowError !== null && (
        <div className="border-gold-500/40 bg-gold-500/10 text-gold-400 rounded-lg border px-4 py-3 text-sm">
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
        activeSort={{ field: sortField, direction: sortDirection }}
        onSort={(field) => {
          setSort(
            (current) =>
              (current === `${field},asc`
                ? `${field},desc`
                : `${field},asc`) as SortSpec<UserSortField>,
          );
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />
    </AdminPage>
  );
}
