import { useActionState, useState } from 'react';
import {
  createRoom,
  deleteRoom,
  listRooms,
  updateRoom,
  type RoomSortField,
} from '../../lib/api/rooms.ts';
import { useResource } from '../../lib/use-resource.ts';
import { toFieldErrors } from '../../lib/problem.ts';
import { screenRoomTypeLabels, screenRoomTypeValues } from '../../lib/enums.ts';
import type { CreateScreenRoomRequest, Page, ScreenRoomResponse } from '../../lib/types.ts';
import type { SortSpec } from '../../lib/query.ts';
import { AdminPage } from './AdminPage.tsx';
import { DataTable, type Column } from '../ui/DataTable.tsx';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { Badge, Modal } from '../ui/Modal.tsx';
import { SelectInput, TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { Pagination } from '../ui/Pagination.tsx';

const PAGE_SIZE = 15;

interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const initialFormState: FormState = { error: null, fieldErrors: {} };

/** `/admin/rooms` — room CRUD plus the entry point to the seat builder. */
export default function AdminRooms() {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec<RoomSortField>>('roomName,asc');
  const [editing, setEditing] = useState<ScreenRoomResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowError, setRowError] = useState<unknown>(null);

  const resource = useResource<Page<ScreenRoomResponse>>(
    (signal) => listRooms({ page, size: PAGE_SIZE, sort }, { signal }),
    [page, sort],
  );

  const remove = async (room: ScreenRoomResponse) => {
    if (!window.confirm(`Delete “${room.roomName}”? Its seats go with it.`)) return;
    setRowError(null);
    try {
      await deleteRoom(room.uuid);
    } catch (error) {
      // 409 when screenings still reference the room.
      setRowError(error);
    } finally {
      resource.refetch();
    }
  };

  const columns: readonly Column<ScreenRoomResponse>[] = [
    {
      key: 'roomName',
      header: 'Room',
      sortField: 'roomName',
      cell: (room) => <span className="font-medium">{room.roomName}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      sortField: 'screenRoomType',
      cell: (room) => <Badge>{screenRoomTypeLabels[room.screenRoomType]}</Badge>,
    },
    {
      key: 'seats',
      header: 'Seats',
      cell: (room) => (
        <a href={`/admin/rooms/seats?id=${room.uuid}`} className="text-brand-400 hover:underline">
          Manage layout
        </a>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (room) => (
        <div className="flex justify-end gap-1">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={() => setEditing(room)}>
            Edit
          </button>
          <button
            type="button"
            className="cine-btn cine-btn-danger"
            onClick={() => void remove(room)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const [sortField, sortDirection] = sort.split(',') as [RoomSortField, 'asc' | 'desc'];

  return (
    <AdminPage
      title="Screen rooms"
      description="Rooms and their projection format. Seats are managed per room."
      action={
        <button
          type="button"
          className="cine-btn cine-btn-primary"
          onClick={() => setCreating(true)}
        >
          New room
        </button>
      }
    >
      {rowError !== null && <ErrorBanner error={rowError} onRetry={resource.refetch} />}

      <DataTable
        rows={resource.data?.content ?? null}
        columns={columns}
        rowKey={(room) => room.uuid}
        isLoading={resource.isLoading || resource.isRefreshing}
        error={resource.error}
        onRetry={resource.refetch}
        emptyTitle="No rooms"
        emptyDescription="Create a room before scheduling screenings."
        activeSort={{ field: sortField, direction: sortDirection }}
        onSort={(field) => {
          setSort(
            (current) =>
              (current === `${field},asc`
                ? `${field},desc`
                : `${field},asc`) as SortSpec<RoomSortField>,
          );
          setPage(0);
        }}
      />

      <Pagination page={resource.data} onPageChange={setPage} />

      <RoomFormModal
        open={creating || editing !== null}
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
    </AdminPage>
  );
}

function RoomFormModal({
  open,
  room,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly room: ScreenRoomResponse | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const body = {
      roomName: String(formData.get('roomName') ?? '').trim(),
      screenRoomType: String(formData.get('screenRoomType') ?? ''),
    } as CreateScreenRoomRequest;

    try {
      if (room) await updateRoom(room.uuid, body);
      else await createRoom(body);
      onSaved();
      return initialFormState;
    } catch (error) {
      // 409 means the name is taken; the check excludes the room itself on PUT.
      return { error, fieldErrors: toFieldErrors(error) };
    }
  }, initialFormState);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={room ? 'Edit room' : 'New room'}>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />

        <TextInput
          label="Room name"
          name="roomName"
          required
          maxLength={50}
          defaultValue={room?.roomName ?? ''}
          hint="Must be unique, ignoring case."
          error={state.fieldErrors['roomName']}
        />

        <SelectInput
          label="Projection type"
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
            Cancel
          </button>
          <SubmitButton pendingLabel="Saving…">{room ? 'Save changes' : 'Create'}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
