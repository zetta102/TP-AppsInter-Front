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
  validation: 'border-gold-500/40 bg-gold-500/10 text-gold-400',
  unauthorized: 'border-gold-500/40 bg-gold-500/10 text-gold-400',
  forbidden: 'border-gold-500/40 bg-gold-500/10 text-gold-400',
  notFound: 'border-ink-700 bg-ink-800/60 text-ink-300',
  conflict: 'border-gold-500/40 bg-gold-500/10 text-gold-400',
  businessRule: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
  request: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
  server: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
  network: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
  unknown: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
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

/** Variante compacta de una sola línea para espacios inline como filas de tabla. */
export function InlineError({ error }: { readonly error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-brand-400 text-sm">
      {toUserMessage(error)}
    </p>
  );
}
