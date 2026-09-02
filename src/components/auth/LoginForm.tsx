import { useActionState } from 'react';
import { useAuth } from '../../lib/auth-context.tsx';
import { toFieldErrors } from '../../lib/problem.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';

interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const initialState: FormState = { error: null, fieldErrors: {} };

/** Where to return after signing in; defaults to the account area. */
function nextDestination(): string {
  if (typeof window === 'undefined') return '/reservations';
  const next = new URLSearchParams(window.location.search).get('next');
  // Only same-origin relative paths, so `?next=` cannot become an open redirect.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/reservations';
}

export default function LoginForm() {
  const { login } = useAuth();

  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    try {
      await login({ email, password });
      window.location.assign(nextDestination());
      return initialState;
    } catch (error) {
      // 400 binds to fields; 401 "Invalid credentials" surfaces in the banner.
      return { error, fieldErrors: toFieldErrors(error) };
    }
  }, initialState);

  return (
    <form action={formAction} className="cine-card flex flex-col gap-4 p-6" noValidate>
      <ErrorBanner error={state.error} />

      <TextInput
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors['email']}
      />

      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors['password']}
      />

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>

      <p className="text-ink-500 text-center text-sm">
        No account?{' '}
        <a href="/register" className="text-brand-400 hover:underline">
          Create one
        </a>
      </p>
    </form>
  );
}
