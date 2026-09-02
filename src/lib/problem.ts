import type { ProblemDetail } from './types.ts';

/**
 * The frontend-facing status contract (frontend-spec.md §5).
 *
 * 409 is always retryable after a refetch; 422 never is without changing the
 * request. Never match on `detail` or on `errors` values — bean-validation
 * messages are server-localised. Key off status codes and field names.
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

/** Generic, user-safe copy per status. `422` details are user-facing verbatim. */
const fallbackMessages = {
  validation: 'Please check the highlighted fields and try again.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You are not permitted to perform this action.',
  notFound: 'We could not find what you were looking for.',
  conflict: 'Someone else changed this while you were working. Refresh and try again.',
  businessRule: 'This action is not allowed right now.',
  server: 'Something went wrong on our side. Please try again.',
  network: 'We could not reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
} as const satisfies Readonly<Record<ApiErrorKind, string>>;

/**
 * A failed API call. Wraps the RFC 7807 payload and, when the failure came from
 * a rejected `fetch`, chains the original error through `Error.cause`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly problem: ProblemDetail | null;
  readonly instance: string | undefined;
  /** Flat field -> message map from bean validation; empty when absent. */
  readonly fieldErrors: Readonly<Record<string, string>>;

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
  }

  /** True when the server supplied a human-readable, user-facing `detail`. */
  get hasServerDetail(): boolean {
    return Boolean(this.problem?.detail?.trim());
  }

  /** Copy safe to render directly to the user. */
  get userMessage(): string {
    // 422 `detail` is authored for end users; 400/409 details are useful too.
    return this.hasServerDetail ? this.message : fallbackMessages[this.kind];
  }

  /** Generic message ignoring any server text, for terse inline slots. */
  get genericMessage(): string {
    return fallbackMessages[this.kind];
  }

  fieldError(field: string): string | undefined {
    return this.fieldErrors[field];
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }

  /** 409 means "refetch and let the user retry"; nothing else is blind-retryable. */
  get isRetryable(): boolean {
    return this.kind === 'conflict' || this.kind === 'network' || this.kind === 'server';
  }

  static network(cause: unknown): ApiError {
    const aborted =
      cause instanceof DOMException && (cause.name === 'AbortError' || cause.name === 'TimeoutError');
    return new ApiError(
      0,
      {
        title: aborted ? 'Request Timed Out' : 'Network Error',
        detail: aborted
          ? 'The request took too long and was cancelled.'
          : 'The server could not be reached.',
      },
      { cause, kind: 'network' },
    );
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Narrows to an `ApiError` with one of the given statuses. */
export function isApiErrorWithStatus(
  error: unknown,
  ...statuses: readonly number[]
): error is ApiError {
  return isApiError(error) && statuses.includes(error.status);
}

/** Any thrown value rendered as user-safe copy. */
export function toUserMessage(error: unknown): string {
  if (isApiError(error)) return error.userMessage;
  if (error instanceof Error && error.message) return error.message;
  return fallbackMessages.unknown;
}

/** Extracts bean-validation field errors from any thrown value. */
export function toFieldErrors(error: unknown): Readonly<Record<string, string>> {
  return isApiError(error) ? error.fieldErrors : {};
}

/**
 * Parses an `application/problem+json` body. Returns `null` for empty or
 * unparseable bodies rather than throwing — an error path must never throw.
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
