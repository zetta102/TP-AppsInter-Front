import { navigate } from 'astro:transitions/client';
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

/** A dónde volver tras iniciar sesión; por defecto, al área de la cuenta. */
function nextDestination(): string {
  if (typeof window === 'undefined') return '/reservations';
  const next = new URLSearchParams(window.location.search).get('next');
  // Solo rutas relativas del mismo origen, para que `?next=` no pueda convertirse en una redirección abierta.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/reservations';
}

export default function LoginForm() {
  const { login } = useAuth();

  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    try {
      await login({ email, password });
      void navigate(nextDestination());
      return initialState;
    } catch (error) {
      // El 400 se vincula a los campos; el 401 "Invalid credentials" aparece en el banner.
      return { error, fieldErrors: toFieldErrors(error) };
    }
  }, initialState);

  return (
    <form action={formAction} className="cine-card flex flex-col gap-4 p-6" noValidate>
      <ErrorBanner error={state.error} />

      <TextInput
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors['email']}
      />

      <TextInput
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors['password']}
      />

      <SubmitButton pendingLabel="Iniciando sesión…">Iniciar sesión</SubmitButton>

      <p className="text-ink-500 text-center text-sm">
        ¿No tenés cuenta?{' '}
        <a href="/register" className="text-brand-400 hover:underline">
          Creá una
        </a>
      </p>
    </form>
  );
}
