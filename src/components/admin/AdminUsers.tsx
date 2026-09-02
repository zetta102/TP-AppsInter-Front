import { useState } from 'react';
import { listUsers, type UserSortField } from '../../lib/api/users.ts';
import { useResource } from '../../lib/use-resource.ts';
import { Role, roleLabels, roleValues } from '../../lib/enums.ts';
import type { Page, UserResponse } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { Badge } from '../ui/Modal.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const PAGE_SIZE = 20;

/**
 * `/admin/users` — read-only.
 *
 * The backend exposes no user mutation endpoints, so roles cannot be changed
 * from here; admins exist only through the `CINE_ADMIN_*` bootstrap. See
 * `backend-spec.md`.
 */
export default function AdminUsers() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<UserSortField>>('email,asc');
  const [role, setRole] = useState<Role | ''>('');

  const resource = useResource<Page<UserResponse>>(
    (signal) => listUsers({ page, size: PAGE_SIZE, sort, ...(role ? { role } : {}) }, { signal }),
    [page, sort, role],
  );

  const columns: readonly Column<UserResponse>[] = [
    {
      key: 'email',
      header: 'Email',
      sortField: 'email',
      cell: (user) => <span className="font-medium">{user.email}</span>,
    },
    {
      key: 'firstName',
      header: 'First name',
      sortField: 'firstName',
      cell: (user) => user.firstName,
    },
    { key: 'lastName', header: 'Last name', sortField: 'lastName', cell: (user) => user.lastName },
    {
      key: 'role',
      header: 'Role',
      sortField: 'role',
      cell: (user) => (
        <Badge tone={user.role === Role.ADMIN ? 'premium' : 'neutral'}>{roleLabels[user.role]}</Badge>
      ),
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [UserSortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Users"
      description="Registered accounts. Roles are assigned at bootstrap and cannot be changed through the API."
    >
      <AdminToolbar>
        <div className="min-w-48">
          <label htmlFor="user-role" className="cine-label">
            Role
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
            <option value="">All roles</option>
            {roleValues.map((value) => (
              <option key={value} value={value}>
                {roleLabels[value]}
              </option>
            ))}
          </select>
        </div>
      </AdminToolbar>

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(user) => user.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No users"
        emptyDescription="No account matches this filter."
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
