import { navigate } from 'astro:transitions/client';
import { useActionState } from 'react';
import { formError, formRaw, formText, initialFormState, type FormState } from '../../lib/form.ts';
import { safeNext } from '../../lib/login-redirect.ts';
import { useAuth } from '../../lib/use-auth.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';

/** Adónde volver tras iniciar sesión: el `?next=` validado o, por defecto, las reservas. */
function nextDestination(): string {
  if (typeof window === 'undefined') return safeNext(null);
  return safeNext(new URLSearchParams(window.location.search).get('next'));
}

export default function LoginForm() {
  const { login } = useAuth();

  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    try {
      await login({ email: formText(formData, 'email'), password: formRaw(formData, 'password') });
      void navigate(nextDestination());
      return initialFormState;
    } catch (error) {
      // El 400 se vincula a los campos; el 401 `INVALID_CREDENTIALS` aparece en el banner.
      return formError(error);
    }
  }, initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-4 cine-card p-6" noValidate>
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
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors['password']}
      />

      <SubmitButton pendingLabel="Iniciando sesión…">Iniciar sesión</SubmitButton>

      <p className="text-center text-sm text-ink-500">
        ¿No tenés cuenta?{' '}
        <a href="/register" className="text-brand-400 hover:underline">
          Creá una
        </a>
      </p>
    </form>
  );
}
