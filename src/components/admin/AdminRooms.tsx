import { useActionState, useState } from 'react';
import {
  createRoom,
  deleteRoom,
  listRooms,
  setRoomArchived,
  updateRoom,
  type RoomSortField,
} from '../../lib/api/rooms.ts';
import { isEnumValue, screenRoomTypeLabels, screenRoomTypeValues } from '../../lib/enums.ts';
import {
  fieldErrors,
  formError,
  formText,
  initialFormState,
  type FormState,
} from '../../lib/form.ts';
import { parseSort, toggleSort, type SortSpec } from '../../lib/query.ts';
import type { Page, Room, RoomRequest } from '../../lib/types.ts';
import { useResource } from '../../lib/use-resource.ts';
import { Badge } from '../ui/Badge.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { Modal } from '../ui/Modal.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { AdminPage, AdminToolbar } from './AdminPage.tsx';
import { ArchivedBadge, ShowArchivedToggle, useArchiveActions } from './archive.tsx';

const PAGE_SIZE = 15;

/** `/admin/rooms` — CRUD de salas más el punto de entrada al constructor de asientos. */
export default function AdminRooms() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<RoomSortField>>('roomName,asc');
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const resource = useResource<Page<Room>>(
    (signal) =>
      listRooms({ page, size: PAGE_SIZE, sort, includeArchived: showArchived }, { signal }),
    [page, sort, showArchived],
  );

  // Una sala con funciones o entradas vendidas no se puede borrar (409): se archiva.
  const actions = useArchiveActions<Room>({
    remove: deleteRoom,
    setArchived: setRoomArchived,
    refetch: resource.refetch,
    confirmDelete: (room) => `¿Eliminar “${room.roomName}”? Sus asientos también se eliminarán.`,
    name: (room) => room.roomName,
  });

  const columns: readonly Column<Room, RoomSortField>[] = [
    {
      key: 'roomName',
      header: 'Sala',
      sortField: 'roomName',
      cell: (room) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{room.roomName}</span>
          <ArchivedBadge archived={room.archived} />
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      sortField: 'screenRoomType',
      cell: (room) => <Badge>{screenRoomTypeLabels[room.screenRoomType]}</Badge>,
    },
    {
      key: 'seats',
      header: 'Asientos',
      cell: (room) => (
        <a href={`/admin/rooms/seats?id=${room.uuid}`} className="text-brand-400 hover:underline">
          Gestionar distribución
        </a>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (room) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="cine-btn cine-btn-ghost"
            onClick={() => setEditing(room)}
          >
            Editar
          </button>
          {actions.buttons(room)}
        </div>
      ),
    },
  ];

  return (
    <AdminPage
      title="Salas"
      description="Salas y su formato de proyección. Los asientos se administran por sala."
      action={
        <button
          type="button"
          className="cine-btn cine-btn-primary"
          onClick={() => setCreating(true)}
        >
          Nueva sala
        </button>
      }
    >
      <AdminToolbar>
        <ShowArchivedToggle
          checked={showArchived}
          onChange={(checked) => {
            setShowArchived(checked);
            setPage(0);
          }}
        />
      </AdminToolbar>

      {actions.feedback}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(room) => room.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No hay salas"
        emptyDescription="Creá una sala antes de programar funciones."
        activeSort={parseSort(sort)}
        onSort={(field) => {
          setSort((current) => toggleSort(current, field));
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />

      {/* Montado solo mientras está abierto (y con `key` por sala): cerrar descarta el estado. */}
      {(creating || editing !== null) && (
        <RoomFormModal
          key={editing?.uuid ?? 'new'}
          room={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            resource.refetch();
          }}
        />
      )}
    </AdminPage>
  );
}

function RoomFormModal({
  room,
  onClose,
  onSaved,
}: {
  readonly room: Room | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const screenRoomType = formData.get('screenRoomType');
    if (!isEnumValue(screenRoomTypeValues, screenRoomType)) {
      return fieldErrors({ screenRoomType: 'Elegí un tipo de proyección.' });
    }
    const body: RoomRequest = { roomName: formText(formData, 'roomName'), screenRoomType };

    try {
      if (room) await updateRoom(room.uuid, body);
      else await createRoom(body);
      onSaved();
      return initialFormState;
    } catch (error) {
      // 409 significa que el nombre ya existe; en PUT la validación excluye a la propia sala.
      return formError(error);
    }
  }, initialFormState);

  return (
    <Modal onClose={onClose} title={room ? 'Editar sala' : 'Nueva sala'}>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />

        <TextInput
          label="Nombre de la sala"
          name="roomName"
          required
          maxLength={50}
          defaultValue={room?.roomName ?? ''}
          hint="Debe ser único, sin distinguir mayúsculas y minúsculas."
          error={state.fieldErrors['roomName']}
        />

        <SelectInput
          label="Tipo de proyección"
          name="screenRoomType"
          required
          defaultValue={room?.screenRoomType ?? screenRoomTypeValues[0]}
          error={state.fieldErrors['screenRoomType']}
        >
          {screenRoomTypeValues.map((type) => (
            <option key={type} value={type}>
              {screenRoomTypeLabels[type]}
            </option>
          ))}
        </SelectInput>

        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton pendingLabel="Guardando…">
            {room ? 'Guardar cambios' : 'Crear'}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
