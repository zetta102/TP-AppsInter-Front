import { describe, expect, it } from 'vitest';
import { ApiError, isApiErrorWithCode, parseProblem, toFieldErrors, toUserMessage } from './problem.ts';

describe('ApiError', () => {
  it('clasifica por estado HTTP', () => {
    expect(new ApiError(400, null).kind).toBe('validation');
    expect(new ApiError(401, null).kind).toBe('unauthorized');
    expect(new ApiError(409, null).kind).toBe('conflict');
    expect(new ApiError(422, null).kind).toBe('businessRule');
    expect(new ApiError(503, null).kind).toBe('server');
    expect(new ApiError(415, null).kind).toBe('request');
    expect(new ApiError(418, null).kind).toBe('unknown');
  });

  it('traduce por `code` en lugar de mostrar el `detail` en inglés del servidor', () => {
    const error = new ApiError(422, {
      status: 422,
      detail: 'Current password is incorrect',
      code: 'WRONG_PASSWORD',
    });
    expect(error.userMessage).toBe('La contraseña actual no es correcta.');
    // El detalle original se conserva para depurar.
    expect(error.message).toBe('Current password is incorrect');
  });

  it('cae al mensaje por estado ante un `code` desconocido', () => {
    const error = new ApiError(409, { detail: 'Something new', code: 'SOMETHING_NEW' });
    expect(error.userMessage).toBe(error.genericMessage);
    expect(error.isRetryable).toBe(true);
  });

  it('expone errores de campo y contexto', () => {
    const error = new ApiError(400, {
      code: 'VALIDATION_FAILED',
      errors: { email: 'must be a well-formed email address' },
      context: { property: 'email' },
    });
    expect(error.hasFieldErrors).toBe(true);
    expect(error.fieldError('email')).toBe('must be a well-formed email address');
    expect(toFieldErrors(error)).toEqual({ email: 'must be a well-formed email address' });
    expect(error.context).toEqual({ property: 'email' });
  });

  it('distingue un timeout de un fallo de red', () => {
    const timeout = ApiError.network(new DOMException('timed out', 'TimeoutError'));
    const offline = ApiError.network(new TypeError('Failed to fetch'));
    expect(timeout.kind).toBe('network');
    expect(timeout.userMessage).toContain('tardó demasiado');
    expect(offline.userMessage).toContain('No pudimos conectarnos');
    expect(offline.cause).toBeInstanceOf(TypeError);
  });
});

describe('helpers', () => {
  it('isApiErrorWithCode restringe por código', () => {
    const error = new ApiError(409, { code: 'SEATS_UNAVAILABLE' });
    expect(isApiErrorWithCode(error, 'SEATS_UNAVAILABLE')).toBe(true);
    expect(isApiErrorWithCode(error, 'NAME_TAKEN')).toBe(false);
    expect(isApiErrorWithCode(new Error('x'), 'SEATS_UNAVAILABLE')).toBe(false);
  });

  it('toUserMessage acepta cualquier valor lanzado', () => {
    expect(toUserMessage(new Error('boom'))).toBe('boom');
    expect(toUserMessage('nope')).toBe('Algo salió mal. Intentá de nuevo.');
  });
});

describe('parseProblem', () => {
  it('parsea un body problem+json', async () => {
    const response = new Response(JSON.stringify({ status: 404, code: 'NOT_FOUND' }), {
      status: 404,
    });
    expect(await parseProblem(response)).toEqual({ status: 404, code: 'NOT_FOUND' });
  });

  it('devuelve null para bodies vacíos o inválidos en lugar de lanzar', async () => {
    expect(await parseProblem(new Response(null, { status: 500 }))).toBeNull();
    expect(await parseProblem(new Response('<html>', { status: 502 }))).toBeNull();
    expect(await parseProblem(new Response('42', { status: 500 }))).toBeNull();
  });
});

describe('violations', () => {
  it('traduce cada restricción y tiene prioridad sobre el texto de `errors`', () => {
    const error = new ApiError(400, {
      code: 'VALIDATION_FAILED',
      errors: { password: 'size must be between 8 and 72', email: 'must be a well-formed email' },
      violations: [
        { field: 'password', code: 'Size', params: { min: 8, max: 72 } },
        { field: 'email', code: 'Email', params: { regexp: '.*' } },
        { field: 'posterUrl', code: 'HttpUrl', params: {} },
      ],
    });
    expect(error.fieldError('password')).toBe('Tiene que tener entre 8 y 72 caracteres.');
    expect(error.fieldError('email')).toBe('Ingresá un email válido.');
    expect(error.fieldError('posterUrl')).toBe(
      'Ingresá una URL completa que empiece con http:// o https://.',
    );
  });

  it('usa la primera violación por campo y cae a `errors` ante un código desconocido', () => {
    const error = new ApiError(400, {
      code: 'VALIDATION_FAILED',
      errors: { name: 'something custom' },
      violations: [
        { field: 'name', code: 'SomethingNew', params: {} },
        { field: 'runtime', code: 'Positive', params: {} },
        { field: 'runtime', code: 'NotNull', params: {} },
      ],
    });
    expect(error.fieldError('name')).toBe('something custom');
    expect(error.fieldError('runtime')).toBe('Tiene que ser mayor que cero.');
  });

  it('nombra el código nuevo RESOURCE_ARCHIVED', () => {
    expect(new ApiError(422, { code: 'RESOURCE_ARCHIVED' }).userMessage).toBe(
      'Ya no está disponible porque fue archivado.',
    );
  });
});
