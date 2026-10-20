import type { ProblemPayload, Violation } from './types.ts';

/**
 * El contrato de errores de cara al frontend.
 *
 * 409 siempre permite reintentar después de un refetch; 422 nunca sin cambiar
 * la solicitud. Nunca hagas matching sobre `detail` ni sobre los valores de
 * `errors`: guiate por `code`, el estado HTTP y los nombres de campo.
 *
 * El texto del servidor (`detail`, `errors`) nunca se muestra tal cual: el texto visible se
 * traduce en el cliente a partir de `code` (y de `violations` para los campos) y, en su defecto,
 * del estado.
 */
export type ApiErrorKind =
  | 'validation' // 400
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'notFound' // 404
  | 'conflict' // 409
  | 'businessRule' // 422
  | 'request' // 405, 406, 415: la app armó mal la solicitud
  | 'server' // 5xx
  | 'network' // fetch rechazado / abortado
  | 'unknown';

/**
 * El registro completo de `code`.
 *
 * Tratá cualquier cadena `code` que no esté en esta unión según su estado HTTP:
 * los códigos nuevos nunca deben romper el cliente.
 */
export const apiErrorCodes = [
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'INVALID_SORT_PROPERTY',
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'TOKEN_REVOKED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'NOT_ACCEPTABLE',
  'EMAIL_TAKEN',
  'NAME_TAKEN',
  'SEATS_UNAVAILABLE',
  'SCREENING_OVERLAP',
  'RESOURCE_IN_USE',
  'OPTIMISTIC_LOCK',
  'CONFLICT',
  'UNSUPPORTED_MEDIA_TYPE',
  'INSUFFICIENT_STOCK',
  'SCREENING_STARTED',
  'ALREADY_CANCELLED',
  'SEATS_WRONG_ROOM',
  'LAST_ADMIN',
  'WRONG_PASSWORD',
  'RESOURCE_ARCHIVED',
  'MESSAGE_ALREADY_READ',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

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
    case 405:
    case 406:
    case 415:
      // Errores de programación del cliente: el usuario no puede corregir nada en el formulario.
      return 'request';
    default:
      return status >= 500 ? 'server' : 'unknown';
  }
}

/** Texto genérico y seguro para el usuario según el estado. */
const fallbackMessages = {
  validation: 'Revisá los campos resaltados e intentá de nuevo.',
  unauthorized: 'Tu sesión expiró. Iniciá sesión nuevamente.',
  forbidden: 'No tenés permiso para realizar esta acción.',
  notFound: 'No pudimos encontrar lo que buscabas.',
  conflict: 'Otra persona cambió esto mientras trabajabas. Actualizá e intentá de nuevo.',
  businessRule: 'Esta acción no está permitida en este momento.',
  request: 'No pudimos procesar la solicitud. Recargá la página e intentá de nuevo.',
  server: 'Algo salió mal de nuestro lado. Intentá de nuevo.',
  network: 'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.',
  unknown: 'Algo salió mal. Intentá de nuevo.',
} as const satisfies Readonly<Record<ApiErrorKind, string>>;

/**
 * Mensajes en español por `code`; tienen prioridad sobre el `detail` del servidor. El `satisfies`
 * exige un mensaje para cada código del registro.
 */
const codeMessages = {
  VALIDATION_FAILED: fallbackMessages.validation,
  BAD_REQUEST: 'La solicitud no es válida. Revisá los datos e intentá de nuevo.',
  INVALID_SORT_PROPERTY: 'No se puede ordenar por ese campo.',
  INVALID_CREDENTIALS: 'El email o la contraseña no son correctos.',
  TOKEN_EXPIRED: fallbackMessages.unauthorized,
  TOKEN_REVOKED: 'Tu sesión se cerró por seguridad. Iniciá sesión nuevamente.',
  FORBIDDEN: fallbackMessages.forbidden,
  NOT_FOUND: fallbackMessages.notFound,
  EMAIL_TAKEN: 'Ya existe una cuenta con ese email.',
  NAME_TAKEN: 'Ya existe un elemento con ese nombre o posición.',
  SEATS_UNAVAILABLE: 'Uno o más asientos ya no están disponibles. Elegí otros e intentá de nuevo.',
  SCREENING_OVERLAP: 'La sala ya tiene una función en ese horario.',
  RESOURCE_IN_USE:
    'No se puede modificar ni eliminar porque está en uso. Si querés ocultarlo, archivalo.',
  OPTIMISTIC_LOCK: fallbackMessages.conflict,
  CONFLICT: fallbackMessages.conflict,
  INSUFFICIENT_STOCK: 'No hay stock suficiente para esa cantidad.',
  SCREENING_STARTED: 'La función ya comenzó.',
  ALREADY_CANCELLED: 'La reserva ya estaba cancelada.',
  SEATS_WRONG_ROOM: 'Los asientos no pertenecen a la sala de esta función.',
  LAST_ADMIN: 'No se puede quitar al último administrador ni degradarte a vos mismo.',
  WRONG_PASSWORD: 'La contraseña actual no es correcta.',
  RESOURCE_ARCHIVED: 'Ya no está disponible porque fue archivado.',
  MESSAGE_ALREADY_READ: 'Un administrador ya leyó este mensaje, así que no se puede editar.',
  METHOD_NOT_ALLOWED: fallbackMessages.request,
  NOT_ACCEPTABLE: fallbackMessages.request,
  UNSUPPORTED_MEDIA_TYPE: fallbackMessages.request,
  INTERNAL_ERROR: fallbackMessages.server,
} as const satisfies Readonly<Record<ApiErrorCode, string>>;

function isKnownCode(code: string | undefined): code is ApiErrorCode {
  return code !== undefined && (apiErrorCodes as readonly string[]).includes(code);
}

/**
 * Una llamada fallida a la API. Envuelve el payload RFC 7807 y, cuando el fallo
 * proviene de un `fetch` rechazado, encadena el error original mediante `Error.cause`.
 *
 * `message` conserva el `detail` original del servidor (útil para depurar);
 * para la UI usá `userMessage`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly problem: ProblemPayload | null;
  readonly instance: string | undefined;
  /**
   * Mapa plano campo -> mensaje en español. Se arma desde `violations` (traducidas en el cliente)
   * y, para los campos sin violación reconocible, desde `errors`. Vacío cuando no existe.
   */
  readonly fieldErrors: Readonly<Record<string, string>>;
  /**
   * Código de fallo legible por máquina. Conviene ramificar sobre esto antes que
   * solo sobre `status`, por ejemplo para distinguir `409 NAME_TAKEN` de
   * `409 SEATS_UNAVAILABLE`, o `422 LAST_ADMIN` de `422 INSUFFICIENT_STOCK`.
   */
  readonly code: ApiErrorCode | (string & {}) | undefined;
  /** Datos extra estructurados cuyas claves dependen de `code`. */
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    problem: ProblemPayload | null,
    options?: { readonly cause?: unknown; readonly kind?: ApiErrorKind },
  ) {
    const kind = options?.kind ?? kindFor(status);
    super(problem?.detail?.trim() || fallbackMessages[kind], { cause: options?.cause });
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.problem = problem;
    this.instance = problem?.instance;
    this.fieldErrors = fieldErrorsOf(problem);
    this.code = problem?.code;
    this.context = problem?.context ?? {};
  }

  /** Restringe por el `code` legible por máquina, la forma preferida de clasificar un fallo. */
  hasCode(...codes: readonly ApiErrorCode[]): boolean {
    return this.code !== undefined && (codes as readonly string[]).includes(this.code);
  }

  /** Texto en español, seguro para renderizar directamente al usuario. */
  get userMessage(): string {
    if (this.kind === 'network') return this.message;
    return isKnownCode(this.code) ? codeMessages[this.code] : fallbackMessages[this.kind];
  }

  fieldError(field: string): string | undefined {
    return this.fieldErrors[field];
  }

  /**
   * Reintentable sin cambiar la solicitud: `409` (refetch y dejar reintentar al usuario), un fallo
   * de red o un `5xx`. Un `4xx` distinto solo se resuelve cambiando lo que se envía.
   */
  get isRetryable(): boolean {
    return this.kind === 'conflict' || this.kind === 'network' || this.kind === 'server';
  }

  static network(cause: unknown): ApiError {
    const aborted =
      cause instanceof DOMException &&
      (cause.name === 'AbortError' || cause.name === 'TimeoutError');
    return new ApiError(
      0,
      {
        title: aborted ? 'Tiempo de espera agotado' : 'Error de red',
        detail: aborted
          ? 'La solicitud tardó demasiado y fue cancelada.'
          : fallbackMessages.network,
      },
      { cause, kind: 'network' },
    );
  }
}

/** Texto en español para una restricción violada; `undefined` si el código no se conoce. */
export function violationMessage(violation: Violation): string | undefined {
  const p = violation.params;
  const num = (key: string) => (typeof p[key] === 'number' ? (p[key] as number) : undefined);
  switch (violation.code) {
    case 'NotBlank':
    case 'NotNull':
    case 'NotEmpty':
      return 'Completá este campo.';
    case 'Size': {
      const min = num('min');
      const max = num('max');
      if (min !== undefined && min > 0 && max !== undefined && max < 2_147_483_647)
        return `Tiene que tener entre ${min} y ${max} caracteres.`;
      if (max !== undefined && max < 2_147_483_647)
        return `Tiene que tener como máximo ${max} caracteres.`;
      if (min !== undefined && min > 0) return `Tiene que tener al menos ${min} caracteres.`;
      return 'La longitud no es válida.';
    }
    case 'Min':
      return num('value') === undefined
        ? 'El valor es demasiado chico.'
        : `Tiene que ser como mínimo ${num('value')}.`;
    case 'Max':
      return num('value') === undefined
        ? 'El valor es demasiado grande.'
        : `Tiene que ser como máximo ${num('value')}.`;
    case 'Positive':
      return 'Tiene que ser mayor que cero.';
    case 'PositiveOrZero':
      return 'No puede ser negativo.';
    case 'DecimalMin':
      return p['inclusive'] === false
        ? `Tiene que ser mayor que ${String(p['value'])}.`
        : `Tiene que ser como mínimo ${String(p['value'])}.`;
    case 'Email':
      return 'Ingresá un email válido.';
    case 'Pattern':
      return 'El formato no es válido.';
    case 'HttpUrl':
      return 'Ingresá una URL completa que empiece con http:// o https://.';
    case 'AssertTrue':
      return violation.field === 'releaseYearInRange'
        ? 'El año de estreno está fuera del rango permitido.'
        : 'El valor no es válido.';
    case 'Future':
      return 'Tiene que ser una fecha futura.';
    case 'OneOf':
      return 'El valor no está entre las opciones permitidas.';
    case 'typeMismatch':
      return 'El valor tiene un formato incorrecto.';
    default:
      return undefined;
  }
}

/** Primera violación traducible por campo; los campos restantes caen al texto de `errors`. */
function fieldErrorsOf(problem: ProblemPayload | null): Readonly<Record<string, string>> {
  const result: Record<string, string> = { ...problem?.errors };
  const translated = new Set<string>();
  for (const violation of problem?.violations ?? []) {
    if (translated.has(violation.field)) continue;
    const message = violationMessage(violation);
    if (message === undefined) continue;
    result[violation.field] = message;
    translated.add(violation.field);
  }
  return result;
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
export async function parseProblem(response: Response): Promise<ProblemPayload | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as ProblemPayload;
  } catch {
    return null;
  }
}
