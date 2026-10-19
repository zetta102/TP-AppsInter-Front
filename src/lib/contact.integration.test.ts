import { afterAll, describe, expect, it } from 'vitest';
import {
  deleteContactMessage,
  getMyContactMessage,
  listAdminContactMessages,
  listMyContactMessages,
  openContactMessage,
  sendContactMessage,
  updateContactMessage,
} from './api/contact-messages.ts';
import { deleteUser } from './api/users.ts';
import { login, logout, register } from './auth-store.ts';
import { ApiError } from './problem.ts';
import type { Uuid } from './types.ts';

/**
 * Formulario de contacto contra el backend real (backend-status-for-frontend.md §5.13):
 * el cliente envía y edita, el admin abre (lo marca como leído) y desde ahí el autor ya no
 * puede editar; al final el admin borra el mensaje y da de baja al cliente desechable.
 *
 * Necesita `QA_ADMIN_EMAIL` / `QA_ADMIN_PASSWORD`; sin ellas, la suite se omite.
 */

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const adminEmail = env?.['QA_ADMIN_EMAIL'];
const adminPassword = env?.['QA_ADMIN_PASSWORD'];
const stamp = Date.now();
const customerEmail = `qa.front.contact+${stamp}@example.com`;
const customerPassword = 'Contrasena-QA-1';

async function expectApiError(promise: Promise<unknown>, status: number, code?: string) {
  const error = await promise.then(
    () => {
      throw new Error(`Se esperaba ${status}${code ? ` ${code}` : ''} pero la llamada tuvo éxito`);
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  if (code) expect((error as ApiError).code).toBe(code);
  return error as ApiError;
}

describe.skipIf(!adminEmail || !adminPassword)('mensajes de contacto', () => {
  let customerId: Uuid;
  let messageId: Uuid;

  afterAll(async () => {
    await logout();
  });

  it('cliente: valida, envía y edita mientras nadie lo leyó', async () => {
    await register({
      firstName: 'QA',
      lastName: 'Contacto',
      email: customerEmail,
      password: customerPassword,
    });
    customerId = (await login({ email: customerEmail, password: customerPassword })).uuid;

    const invalid = await expectApiError(
      sendContactMessage({ category: 'GENERAL', subject: ' ', body: 'x'.repeat(5001) }),
      400,
      'VALIDATION_FAILED',
    );
    expect(invalid.fieldError('subject')).toBeDefined();
    expect(invalid.fieldError('body')).toBeDefined();

    const { data, location } = await sendContactMessage({
      category: 'SUGGESTION',
      subject: 'QA asunto',
      body: 'QA cuerpo',
    });
    messageId = data.uuid;
    expect(location).toContain(messageId);
    expect(data.author.email).toBe(customerEmail);
    expect(data.readAt).toBeNull();

    const edited = await updateContactMessage(messageId, {
      category: 'COMPLAINT',
      subject: 'QA asunto editado',
      body: 'QA cuerpo editado',
    });
    expect(edited.category).toBe('COMPLAINT');
    expect(edited.updatedAt).not.toBeNull();

    const mine = await listMyContactMessages({ category: 'COMPLAINT', sort: 'createdAt,desc' });
    expect(mine.content.map((m) => m.uuid)).toEqual([messageId]);
    await logout();
  });

  it('admin: listar no lo marca como leído; abrirlo sí', async () => {
    await login({ email: adminEmail!, password: adminPassword! });

    const unread = await listAdminContactMessages({ email: customerEmail, read: false });
    expect(unread.content.map((m) => m.uuid)).toEqual([messageId]);
    expect(unread.content[0]!.readAt).toBeNull();

    const opened = await openContactMessage(messageId);
    expect(opened.readAt).not.toBeNull();

    const read = await listAdminContactMessages({ email: customerEmail, read: true });
    expect(read.content.map((m) => m.uuid)).toEqual([messageId]);
    await logout();
  });

  it('cliente: un mensaje leído queda bloqueado', async () => {
    await login({ email: customerEmail, password: customerPassword });
    expect((await getMyContactMessage(messageId)).readAt).not.toBeNull();

    const error = await expectApiError(
      updateContactMessage(messageId, { category: 'GENERAL', subject: 'Tarde', body: 'Tarde' }),
      422,
      'MESSAGE_ALREADY_READ',
    );
    expect(error.userMessage).toBe(
      'Un administrador ya leyó este mensaje, así que no se puede editar.',
    );
    await logout();
  });

  it('admin: borra el mensaje y da de baja al cliente desechable', async () => {
    await login({ email: adminEmail!, password: adminPassword! });
    await deleteContactMessage(messageId);
    await expectApiError(openContactMessage(messageId), 404, 'NOT_FOUND');
    await deleteUser(customerId);
  });
});
