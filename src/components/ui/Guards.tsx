import type { ReactNode } from 'react';
import { useAuth } from '../../lib/auth-context.tsx';
import { LoadingBlock } from './SubmitButton.tsx';

/**
 * Client-side route gating.
 *
 * The backend is the only real gate — these guards exist to avoid rendering
 * doomed requests and to give a sensible signed-out experience. Every screen
 * still handles `403` defensively, because the role check here comes from
 * `GET /api/users/me` and can be stale.
 */

function SignInPrompt({ message }: { readonly message: string }) {
  const next =
    typeof window === 'undefined'
      ? '/'
      : `${window.location.pathname}${window.location.search}`;

  return (
    <div className="cine-card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-12 text-center">
      <p className="text-ink-100 text-lg font-semibold">Sign in to continue</p>
      <p className="text-ink-500 text-sm">{message}</p>
      <a href={`/login?next=${encodeURIComponent(next)}`} className="cine-btn cine-btn-primary">
        Sign in
      </a>
    </div>
  );
}

export function AuthGuard({
  children,
  message = 'You need an account to view this page.',
}: {
  readonly children: ReactNode;
  readonly message?: string;
}) {
  const { ready, isAuthenticated } = useAuth();

  if (!ready) return <LoadingBlock label="Checking your session…" />;
  if (!isAuthenticated) return <SignInPrompt message={message} />;
  return <>{children}</>;
}

export function AdminGuard({ children }: { readonly children: ReactNode }) {
  const { ready, isAuthenticated, isAdmin } = useAuth();

  if (!ready) return <LoadingBlock label="Checking your session…" />;
  if (!isAuthenticated) {
    return <SignInPrompt message="Administrator access is required for this console." />;
  }
  if (!isAdmin) {
    return (
      <div className="cine-card mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-ink-100 text-lg font-semibold">Not permitted</p>
        <p className="text-ink-500 text-sm">
          This console is restricted to administrators. There is no self-service admin signup — an
          admin is only created at startup from <code>CINE_ADMIN_EMAIL</code> and{' '}
          <code>CINE_ADMIN_PASSWORD</code>.
        </p>
        <a href="/" className="cine-btn cine-btn-secondary">
          Back to the cinema
        </a>
      </div>
    );
  }
  return <>{children}</>;
}
