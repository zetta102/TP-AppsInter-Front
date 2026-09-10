import type { ProblemDetail } from './types.ts';

/**
 * El contrato de estados de cara al frontend (frontend-spec.md §5).
 *
 * 409 siempre permite reintentar después de un refetch; 422 nunca sin cambiar
 * la solicitud. Nunca hagas matching sobre `detail` ni sobre los valores de
 * `errors`: los mensajes de bean validation se localizan en el servidor.
 * Guíate por los códigos de estado y los nombres de campo.
 */
export type ApiErrorKind =
  | 'validation' // 400
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'notFound' // 404
  | 'conflict' // 409
  | 'businessRule' // 422
  | 'server' // 5xx
  | 'network' // fetch rejected / aborted
  | 'unknown';

/**
 * El registro completo de `code` (frontend-spec.md §5), incluidas las desviaciones
 * señaladas en §13: `BAD_REQUEST`, `INVALID_SORT_PROPERTY`, `CONFLICT`,
 * `SEATS_WRONG_ROOM` y `LAST_ADMIN` además de la especificación base.
 *
 * Trata cualquier cadena `code` que no esté en esta unión según su estado HTTP:
 * los códigos nuevos nunca deben romper el cliente.
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'BAD_REQUEST'
  | 'INVALID_SORT_PROPERTY'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'NAME_TAKEN'
  | 'SEATS_UNAVAILABLE'
  | 'SCREENING_OVERLAP'
  | 'RESOURCE_IN_USE'
  | 'OPTIMISTIC_LOCK'
  | 'CONFLICT'
  | 'SCREENING_STARTED'
  | 'SEATS_WRONG_ROOM'
  | 'INSUFFICIENT_STOCK'
  | 'ALREADY_CANCELLED'
  | 'LAST_ADMIN';

function kindFor(status: number): ApiErrorKind {
  switch (status) {
    case 400:
      return 'validation';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 422:
      return 'businessRule';
    default:
      return status >= 500 ? 'server' : 'unknown';
  }
}

/** Texto genérico y seguro para el usuario según el estado. Los detalles `422` se muestran textualmente. */
const fallbackMessages = {
  validation: 'Revisa los campos resaltados e inténtalo de nuevo.',
  unauthorized: 'Tu sesión expiró. Inicia sesión nuevamente.',
  forbidden: 'No tienes permiso para realizar esta acción.',
  notFound: 'No pudimos encontrar lo que buscabas.',
  conflict: 'Otra persona cambió esto mientras trabajabas. Actualiza e inténtalo de nuevo.',
  businessRule: 'Esta acción no está permitida en este momento.',
  server: 'Algo salió mal de nuestro lado. Inténtalo de nuevo.',
  network: 'No pudimos conectarnos con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  unknown: 'Algo salió mal. Inténtalo de nuevo.',
} as const satisfies Readonly<Record<ApiErrorKind, string>>;

/**
 * Una llamada fallida a la API. Envuelve el payload RFC 7807 y, cuando el fallo
 * proviene de un `fetch` rechazado, encadena el error original mediante `Error.cause`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly problem: ProblemDetail | null;
  readonly instance: string | undefined;
  /** Mapa plano campo -> mensaje de bean validation; vacío cuando no existe. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  /**
   * Código de fallo legible por máquina (frontend-spec.md §5). Conviene ramificar
   * sobre esto antes que solo sobre `status`, por ejemplo para distinguir
   * `409 NAME_TAKEN` de `409 SEATS_UNAVAILABLE`, o `422 LAST_ADMIN` de `422 INSUFFICIENT_STOCK`.
   */
  readonly code: ApiErrorCode | (string & {}) | undefined;
  /** Datos extra estructurados cuyas claves dependen de `code`. */
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    problem: ProblemDetail | null,
    options?: { readonly cause?: unknown; readonly kind?: ApiErrorKind },
  ) {
    const kind = options?.kind ?? kindFor(status);
    super(problem?.detail?.trim() || fallbackMessages[kind], { cause: options?.cause });
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.problem = problem;
    this.instance = problem?.instance;
    this.fieldErrors = problem?.errors ?? {};
    this.code = problem?.code;
    this.context = problem?.context ?? {};
  }

  /** Restringe por el `code` legible por máquina, la forma preferida de clasificar un fallo. */
  hasCode(...codes: readonly ApiErrorCode[]): boolean {
    return this.code !== undefined && (codes as readonly string[]).includes(this.code);
  }

  /** True cuando el servidor proporcionó un `detail` legible y visible para el usuario. */
  get hasServerDetail(): boolean {
    return Boolean(this.problem?.detail?.trim());
  }

  /** Texto seguro para renderizar directamente al usuario. */
  get userMessage(): string {
    // El `detail` de 422 está redactado para usuarios finales; los detalles 400/409 también son útiles.
    return this.hasServerDetail ? this.message : fallbackMessages[this.kind];
  }

  /** Mensaje genérico que ignora el texto del servidor, para espacios inline breves. */
  get genericMessage(): string {
    return fallbackMessages[this.kind];
  }

  fieldError(field: string): string | undefined {
    return this.fieldErrors[field];
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }

  /** 409 significa "refetch y dejar reintentar al usuario"; nada más admite reintento ciego. */
  get isRetryable(): boolean {
    return this.kind === 'conflict' || this.kind === 'network' || this.kind === 'server';
  }

  static network(cause: unknown): ApiError {
    const aborted =
      cause instanceof DOMException && (cause.name === 'AbortError' || cause.name === 'TimeoutError');
    return new ApiError(
      0,
      {
        title: aborted ? 'Tiempo de espera agotado' : 'Error de red',
        detail: aborted
          ? 'La solicitud tardó demasiado y fue cancelada.'
          : 'No se pudo contactar al servidor.',
      },
      { cause, kind: 'network' },
    );
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Restringe a un `ApiError` con uno de los estados indicados. */
export function isApiErrorWithStatus(
  error: unknown,
  ...statuses: readonly number[]
): error is ApiError {
  return isApiError(error) && statuses.includes(error.status);
}

/** Restringe a un `ApiError` que lleva uno de los `code` indicados. */
export function isApiErrorWithCode(
  error: unknown,
  ...codes: readonly ApiErrorCode[]
): error is ApiError {
  return isApiError(error) && error.hasCode(...codes);
}

/** Cualquier valor lanzado renderizado como texto seguro para el usuario. */
export function toUserMessage(error: unknown): string {
  if (isApiError(error)) return error.userMessage;
  if (error instanceof Error && error.message) return error.message;
  return fallbackMessages.unknown;
}

/** Extrae errores de campo de bean validation desde cualquier valor lanzado. */
export function toFieldErrors(error: unknown): Readonly<Record<string, string>> {
  return isApiError(error) ? error.fieldErrors : {};
}

/**
 * Parsea un body `application/problem+json`. Devuelve `null` para bodies vacíos
 * o imposibles de parsear en lugar de lanzar: una ruta de error nunca debe fallar de nuevo.
 */
export async function parseProblem(response: Response): Promise<ProblemDetail | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as ProblemDetail;
  } catch {
    return null;
  }
}
