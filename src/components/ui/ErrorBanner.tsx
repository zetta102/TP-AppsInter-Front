import { cx } from '../../lib/cx.ts';
import { isApiError, toUserMessage } from '../../lib/problem.ts';

/**
 * Presentación de errores según el estado.
 *
 * El mapeo es intencional:
 *  - el texto viene de `ApiError.userMessage`, traducido en el cliente a partir de `code`
 *    (el texto del servidor nunca se muestra tal cual);
 *  - `409`, los fallos de red y los `5xx` permiten reintentar, por eso ofrecemos esa acción;
 *  - `403` significa que el control no debería haber sido visible en primer lugar;
 *  - los errores por campo (`ApiError.fieldErrors`) nunca se muestran acá: pertenecen a
 *    cada campo del formulario (`Field.tsx`).
 */

const toneByKind = {
  validation: 'cine-alert-warning',
  unauthorized: 'cine-alert-warning',
  forbidden: 'cine-alert-warning',
  notFound: 'rounded-lg border border-ink-700 bg-ink-800/60 text-ink-300',
  conflict: 'cine-alert-warning',
  businessRule: 'rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-400',
  request: 'rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-400',
  server: 'rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-400',
  network: 'rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-400',
  unknown: 'rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-400',
} as const;

const headingByKind = {
  validation: 'Revisá tus datos',
  unauthorized: 'Inicio de sesión requerido',
  forbidden: 'No permitido',
  notFound: 'No encontrado',
  conflict: 'Alguien se adelantó',
  businessRule: 'No se puede continuar',
  request: 'Solicitud no válida',
  server: 'Error del servidor',
  network: 'Problema de conexión',
  unknown: 'Algo salió mal',
} as const;

export interface ErrorBannerProps {
  readonly error: unknown;
  /** Se renderiza como control de reintento; se muestra automáticamente para errores reintentables. */
  readonly onRetry?: (() => void) | undefined;
  readonly retryLabel?: string;
  readonly className?: string;
}

export function ErrorBanner({
  error,
  onRetry,
  retryLabel = 'Reintentar',
  className = '',
}: ErrorBannerProps) {
  if (!error) return null;

  const kind = isApiError(error) ? error.kind : 'unknown';
  const showRetry = Boolean(onRetry) && (!isApiError(error) || error.isRetryable);

  return (
    <div
      role="alert"
      className={cx(
        'flex items-start justify-between gap-4 px-4 py-3 text-sm',
        toneByKind[kind],
        className,
      )}
    >
      <div className="min-w-0">
        <p className="font-semibold">{headingByKind[kind]}</p>
        <p className="mt-0.5 wrap-break-word text-ink-300">{toUserMessage(error)}</p>
      </div>
      {showRetry && (
        <button type="button" onClick={onRetry} className="cine-btn shrink-0 cine-btn-secondary">
          {retryLabel}
        </button>
      )}
    </div>
  );
}
