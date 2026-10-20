import { getPage, requestCreated, requestJson, requestVoid, type CallOptions } from './shared.ts';
import type { PageParams } from '../query.ts';
import type { ContactCategory } from '../enums.ts';
import type { ContactMessage, ContactMessageRequest, Page, Uuid } from '../types.ts';

/**
 * Formulario de contacto: el autor bajo
 * `/api/contact-messages` y la bandeja de admin bajo `/api/admin/contact-messages`.
 *
 * El autor se toma de la sesión: la solicitud no lleva nombre ni email. Listar nunca
 * marca un mensaje como leído; solo lo hace abrirlo desde la bandeja de admin, y a partir
 * de ahí el autor ya no puede editarlo. Los autores no pueden borrar sus mensajes.
 */

export const contactMessageSortFields = ['createdAt', 'category'] as const;
export type ContactMessageSortField = (typeof contactMessageSortFields)[number];

export const adminContactMessageSortFields = [
  'createdAt',
  'readAt',
  'category',
  'userEmail',
] as const;
export type AdminContactMessageSortField = (typeof adminContactMessageSortFields)[number];

export type ContactMessageFilters = {
  readonly category?: ContactCategory;
};

export type ListContactMessagesParams = PageParams<ContactMessageSortField> & ContactMessageFilters;

export type AdminContactMessageFilters = ContactMessageFilters & {
  /** `true` solo leídos, `false` solo sin leer; omitido trae ambos. */
  readonly read?: boolean;
  /** Subcadena del email del autor, sin distinguir mayúsculas. */
  readonly email?: string;
};

export type ListAdminContactMessagesParams = PageParams<AdminContactMessageSortField> &
  AdminContactMessageFilters;

export function sendContactMessage(body: ContactMessageRequest) {
  return requestCreated<ContactMessage>('/api/contact-messages', { body, auth: true });
}

/** Siempre los mensajes del propio llamador. */
export function listMyContactMessages(
  params: ListContactMessagesParams = {},
  options: CallOptions = {},
): Promise<Page<ContactMessage>> {
  return getPage<ContactMessage>('/api/contact-messages', params, { ...options, auth: true });
}

/** `404` —no `403`— cuando el mensaje es de otra persona. */
export function getMyContactMessage(
  uuid: Uuid,
  options: CallOptions = {},
): Promise<ContactMessage> {
  return requestJson<ContactMessage>(`/api/contact-messages/${uuid}`, { ...options, auth: true });
}

/**
 * Reemplazo completo; setea `updatedAt`. `422 MESSAGE_ALREADY_READ` si un admin ya lo
 * abrió: el mensaje queda bloqueado para su autor.
 */
export function updateContactMessage(
  uuid: Uuid,
  body: ContactMessageRequest,
): Promise<ContactMessage> {
  return requestJson<ContactMessage>(`/api/contact-messages/${uuid}`, {
    method: 'PUT',
    body,
    auth: true,
  });
}

/** Solo ADMIN. No marca nada como leído. */
export function listAdminContactMessages(
  params: ListAdminContactMessagesParams = {},
  options: CallOptions = {},
): Promise<Page<ContactMessage>> {
  return getPage<ContactMessage>('/api/admin/contact-messages', params, {
    ...options,
    auth: true,
  });
}

/**
 * Solo ADMIN. **Marca el mensaje como leído** en la primera apertura (setea `readAt`), lo que
 * impide que el autor lo siga editando. No sirve para precargar ni para refrescar la lista.
 */
export function openContactMessage(uuid: Uuid, options: CallOptions = {}): Promise<ContactMessage> {
  return requestJson<ContactMessage>(`/api/admin/contact-messages/${uuid}`, {
    ...options,
    auth: true,
  });
}

/** Solo ADMIN. Borrado físico: no se puede deshacer. */
export function deleteContactMessage(uuid: Uuid): Promise<void> {
  return requestVoid(`/api/admin/contact-messages/${uuid}`, { method: 'DELETE', auth: true });
}
