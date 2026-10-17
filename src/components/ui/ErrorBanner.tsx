import { cx } from '../../lib/cx.ts';
import { isApiError, toUserMessage } from '../../lib/problem.ts';

/**
 * Presentación de errores según el estado (backend-status-for-frontend.md §8).
 *
 * El mapeo es intencional:
 *  - el texto viene de `ApiError.userMessage`, traducido por `code` (el backend solo habla inglés);
 *  - `409` siempre permite reintentar tras recargar, por eso ofrecemos la acción de reintento;
 *  - `403` significa que el control no debería haber sido visible en primer lugar;
 *  - los mensajes de validación se localizan del lado del servidor, así que nunca mostramos aquí
 *    el mapa `errors`: pertenece a los campos individuales.
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

/** Variante compacta de una sola línea para espacios inline como filas de tabla. */
export function InlineError({ error }: { readonly error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-brand-400">
      {toUserMessage(error)}
    </p>
  );
}
