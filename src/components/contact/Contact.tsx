import { useActionState, useId, useState } from 'react';
import {
  listMyContactMessages,
  sendContactMessage,
  updateContactMessage,
} from '../../lib/api/contact-messages.ts';
import { useResource, type Resource } from '../../lib/use-resource.ts';
import { formatDateTime, formatNumber } from '../../lib/format.ts';
import {
  ContactCategory,
  contactCategoryLabels,
  contactCategoryValues,
  isEnumValue,
} from '../../lib/enums.ts';
import { isApiErrorWithCode, toFieldErrors } from '../../lib/problem.ts';
import type { ContactMessage, ContactMessageRequest, Page } from '../../lib/types.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { SelectInput, TextArea, TextInput } from '../ui/Field.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { Badge, Modal } from '../ui/Modal.tsx';
import { Pagination } from '../ui/Pagination.tsx';
import { EmptyState, LoadingBlock, Spinner, SubmitButton } from '../ui/SubmitButton.tsx';

const PAGE_SIZE = 10;
const SUBJECT_MAX = 150;
const BODY_MAX = 5000;

/**
 * `/contact` (backend-status-for-frontend.md §5.13) — formulario de contacto y mensajes propios.
 *
 * El autor sale de la sesión, así que hace falta iniciar sesión para escribir. Un mensaje se
 * puede editar hasta que un admin lo abre (`readAt`); desde ahí queda bloqueado y un `PUT`
 * devuelve `422 MESSAGE_ALREADY_READ`. Los autores no pueden borrar sus mensajes.
 */
export default function Contact() {
  return (
    <AuthGuard message="Iniciá sesión para escribirnos: tu mensaje queda asociado a tu cuenta.">
      <ContactPanel />
    </AuthGuard>
  );
}

interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
  /**
   * Lo enviado. React resetea el formulario al terminar cada Action, también ante un error; los
   * `defaultValue` salen de aquí para no perder lo escrito cuando el servidor rechaza el envío.
   */
  readonly values: ContactMessageRequest;
  readonly success: boolean;
}

const emptyValues: ContactMessageRequest = {
  category: ContactCategory.GENERAL,
  subject: '',
  body: '',
};

function readValues(formData: FormData): ContactMessageRequest {
  const category = formData.get('category');
  return {
    // El `<select>` solo ofrece valores válidos; el fallback cubre un valor manipulado.
    category: isEnumValue(contactCategoryValues, category) ? category : ContactCategory.GENERAL,
    subject: String(formData.get('subject') ?? '').trim(),
    body: String(formData.get('body') ?? '').trim(),
  };
}

function ContactPanel() {
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState<ContactCategory | ''>('');
  const [editing, setEditing] = useState<ContactMessage | null>(null);

  const resource = useResource<Page<ContactMessage>>(
    (signal) =>
      listMyContactMessages(
        { page, size: PAGE_SIZE, sort: 'createdAt,desc', ...(category ? { category } : {}) },
        { signal },
      ),
    [page, category],
  );
  const { refetch } = resource;

  return (
    <div className="flex flex-col gap-8">
      <ContactForm
        onSent={() => {
          setPage(0);
          refetch();
        }}
      />

      <MyMessages
        resource={resource}
        category={category}
        onCategoryChange={(value) => {
          setCategory(value);
          setPage(0);
        }}
        onPageChange={setPage}
        onEdit={setEditing}
      />

      {editing && (
        <EditMessageModal
          message={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
          onLocked={refetch}
        />
      )}
    </div>
  );
}

function ContactMessageFields({
  values,
  fieldErrors,
}: {
  readonly values: ContactMessageRequest;
  readonly fieldErrors: Readonly<Record<string, string>>;
}) {
  return (
    <>
      <SelectInput
        label="Motivo"
        name="category"
        required
        defaultValue={values.category}
        error={fieldErrors['category']}
      >
        {contactCategoryValues.map((value) => (
          <option key={value} value={value}>
            {contactCategoryLabels[value]}
          </option>
        ))}
      </SelectInput>
      <TextInput
        label="Asunto"
        name="subject"
        required
        maxLength={SUBJECT_MAX}
        defaultValue={values.subject}
        hint={`Hasta ${formatNumber(SUBJECT_MAX)} caracteres.`}
        error={fieldErrors['subject']}
      />
      <TextArea
        label="Mensaje"
        name="body"
        required
        rows={8}
        maxLength={BODY_MAX}
        defaultValue={values.body}
        hint={`Hasta ${formatNumber(BODY_MAX)} caracteres.`}
        error={fieldErrors['body']}
      />
    </>
  );
}

function ContactForm({ onSent }: { readonly onSent: () => void }) {
  const [state, formAction] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const values = readValues(formData);
      try {
        await sendContactMessage(values);
        onSent();
        return { error: null, fieldErrors: {}, values: emptyValues, success: true };
      } catch (error) {
        return { error, fieldErrors: toFieldErrors(error), values, success: false };
      }
    },
    { error: null, fieldErrors: {}, values: emptyValues, success: false },
  );

  return (
    <section className="flex flex-col gap-4 cine-card p-6">
      <div>
        <h2 className="text-lg font-semibold">Escribinos</h2>
        <p className="mt-1 text-sm text-ink-500">
          Consultas, problemas con una reserva, reclamos o sugerencias. Vas a poder editar tu
          mensaje hasta que el equipo lo lea.
        </p>
      </div>

      <ErrorBanner error={state.error} />
      {state.success && (
        <p role="status" className="cine-alert-success px-4 py-2 text-sm">
          Mensaje enviado. Lo vas a ver en “Mis mensajes”, más abajo.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ContactMessageFields values={state.values} fieldErrors={state.fieldErrors} />
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Enviando…">Enviar mensaje</SubmitButton>
        </div>
      </form>
    </section>
  );
}

function MyMessages({
  resource,
  category,
  onCategoryChange,
  onPageChange,
  onEdit,
}: {
  readonly resource: Resource<Page<ContactMessage>>;
  readonly category: ContactCategory | '';
  readonly onCategoryChange: (value: ContactCategory | '') => void;
  readonly onPageChange: (page: number) => void;
  readonly onEdit: (message: ContactMessage) => void;
}) {
  const headingId = useId();
  const rows = resource.data?.content ?? [];

  let content;
  if (resource.isLoading) {
    content = <LoadingBlock label="Cargando tus mensajes…" />;
  } else if (resource.error) {
    content = <ErrorBanner error={resource.error} onRetry={resource.refetch} />;
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        title={category ? 'No tenés mensajes con este motivo' : 'Todavía no nos escribiste'}
        {...(category
          ? { description: 'Probá con otro motivo o mostrá todos.' }
          : { description: 'Los mensajes que envíes aparecerán aquí.' })}
      />
    );
  } else {
    content = (
      <ul className="flex flex-col gap-3">
        {rows.map((message) => (
          <MessageItem key={message.uuid} message={message} onEdit={onEdit} />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold">
          Mis mensajes
        </h2>
        <SelectInput
          label="Motivo"
          fieldClassName="min-w-48"
          value={category}
          onChange={(event) => {
            const { value } = event.target;
            onCategoryChange(isEnumValue(contactCategoryValues, value) ? value : '');
          }}
        >
          <option value="">Todos los motivos</option>
          {contactCategoryValues.map((value) => (
            <option key={value} value={value}>
              {contactCategoryLabels[value]}
            </option>
          ))}
        </SelectInput>
      </div>

      {content}

      {resource.isRefreshing && (
        <p className="flex items-center justify-center gap-2 text-xs text-ink-500">
          <Spinner /> Actualizando…
        </p>
      )}

      <Pagination page={resource.data} onPageChange={onPageChange} />
    </section>
  );
}

function MessageItem({
  message,
  onEdit,
}: {
  readonly message: ContactMessage;
  readonly onEdit: (message: ContactMessage) => void;
}) {
  const locked = message.readAt !== null;

  return (
    <li className="flex flex-col gap-3 cine-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold wrap-break-word">{message.subject}</h3>
          <p className="text-xs text-ink-500">
            Enviado el {formatDateTime(message.createdAt)}
            {message.updatedAt && <> · editado el {formatDateTime(message.updatedAt)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{contactCategoryLabels[message.category]}</Badge>
          {locked ? <Badge tone="success">Leído</Badge> : <Badge>Sin leer</Badge>}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-300 hover:text-ink-100">Ver mensaje</summary>
        <p className="mt-2 wrap-break-word whitespace-pre-wrap text-ink-300">{message.body}</p>
      </details>

      <div className="flex items-center justify-end gap-2">
        {locked ? (
          <p className="text-xs text-ink-500">
            El equipo ya lo leyó el {formatDateTime(message.readAt)}; no se puede editar.
          </p>
        ) : (
          <button type="button" className="cine-btn cine-btn-ghost" onClick={() => onEdit(message)}>
            Editar
          </button>
        )}
      </div>
    </li>
  );
}

function EditMessageModal({
  message,
  onClose,
  onSaved,
  onLocked,
}: {
  readonly message: ContactMessage;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  /** Un admin lo abrió mientras se editaba: la lista debe mostrarlo bloqueado. */
  readonly onLocked: () => void;
}) {
  const initialValues: ContactMessageRequest = {
    category: message.category,
    subject: message.subject,
    body: message.body,
  };

  const [state, formAction] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const values = readValues(formData);
      try {
        await updateContactMessage(message.uuid, values);
        onSaved();
        return { error: null, fieldErrors: {}, values, success: true };
      } catch (error) {
        if (isApiErrorWithCode(error, 'MESSAGE_ALREADY_READ')) onLocked();
        return { error, fieldErrors: toFieldErrors(error), values, success: false };
      }
    },
    { error: null, fieldErrors: {}, values: initialValues, success: false },
  );

  const locked = isApiErrorWithCode(state.error, 'MESSAGE_ALREADY_READ');

  return (
    <Modal onClose={onClose} title="Editar mensaje" wide>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ErrorBanner error={state.error} />
        <ContactMessageFields values={state.values} fieldErrors={state.fieldErrors} />
        <div className="flex justify-end gap-2">
          <button type="button" className="cine-btn cine-btn-ghost" onClick={onClose}>
            {locked ? 'Cerrar' : 'Cancelar'}
          </button>
          <SubmitButton pendingLabel="Guardando…" disabled={locked}>
            Guardar cambios
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
