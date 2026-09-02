import { isApiError, toUserMessage } from '../../lib/problem.ts';

/**
 * Status-aware error presentation (frontend-spec.md §5).
 *
 * The mapping is deliberate:
 *  - `422` details are authored for end users, so we render them verbatim;
 *  - `409` is always retryable after a refetch, so we offer the retry action;
 *  - `403` means the control should not have been visible in the first place;
 *  - validation messages are localised server-side, so we never surface the
 *    `errors` map here — it belongs bound to individual fields.
 */

const toneByKind = {
  validation: 'border-gold-500/40 bg-gold-500/10 text-gold-400',
  unauthorized: 'border-gold-500/40 bg-gold-500/10 text-gold-400',
  forbidden: 'border-gold-500/40 bg-gold-500/10 text-gold-400',
  notFound: 'border-ink-700 bg-ink-800/60 text-ink-300',
  conflict: 'border-gold-500/40 bg-gold-500/10 text-gold-400',
  businessRule: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
  server: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
  network: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
  unknown: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
} as const;

const headingByKind = {
  validation: 'Check your details',
  unauthorized: 'Sign in required',
  forbidden: 'Not permitted',
  notFound: 'Not found',
  conflict: 'Someone got there first',
  businessRule: 'Cannot continue',
  server: 'Server error',
  network: 'Connection problem',
  unknown: 'Something went wrong',
} as const;

export interface ErrorBannerProps {
  readonly error: unknown;
  /** Rendered as a retry control; shown automatically for retryable errors. */
  readonly onRetry?: (() => void) | undefined;
  readonly retryLabel?: string;
  readonly className?: string;
}

export function ErrorBanner({
  error,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}: ErrorBannerProps) {
  if (!error) return null;

  const kind = isApiError(error) ? error.kind : 'unknown';
  const showRetry = Boolean(onRetry) && (!isApiError(error) || error.isRetryable);

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${toneByKind[kind]} ${className}`}
    >
      <div className="min-w-0">
        <p className="font-semibold">{headingByKind[kind]}</p>
        <p className="text-ink-300 mt-0.5 break-words">{toUserMessage(error)}</p>
      </div>
      {showRetry && (
        <button type="button" onClick={onRetry} className="cine-btn cine-btn-secondary shrink-0">
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Compact single-line variant for inline slots such as table rows. */
export function InlineError({ error }: { readonly error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-brand-400 text-sm">
      {toUserMessage(error)}
    </p>
  );
}
