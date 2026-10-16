import { navigate } from 'astro:transitions/client';
import { useActionState } from 'react';
import { useAuth } from '../../lib/auth-context.tsx';
import { isApiError, toFieldErrors } from '../../lib/problem.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';

interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const initialState: FormState = { error: null, fieldErrors: {} };

/**
 * El registro siempre crea un `CUSTOMER` — no existe un alta de
 * administrador en autoservicio. Un `ADMIN` solo existe si el backend arrancó con
 * `CINE_ADMIN_EMAIL` y `CINE_ADMIN_PASSWORD`.
 */
export default function RegisterForm() {
  const { register, login } = useAuth();

  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const payload = {
      firstName: String(formData.get('firstName') ?? '').trim(),
      lastName: String(formData.get('lastName') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
    };

    try {
      await register(payload);
    } catch (error) {
      // El 409 significa que el correo ya está en uso; vincúlalo al campo de correo
      // para que el usuario lo vea donde puede corregirlo, sin depender del texto del mensaje.
      if (isApiError(error) && error.status === 409) {
        return { error, fieldErrors: { email: 'Ese correo electrónico ya está registrado.' } };
      }
      return { error, fieldErrors: toFieldErrors(error) };
    }

    try {
      await login({ email: payload.email, password: payload.password });
      void navigate('/reservations');
      return initialState;
    } catch {
      // La cuenta existe; solo ha fallado el inicio de sesión automático.
      void navigate('/login');
      return initialState;
    }
  }, initialState);

  return (
    <form action={formAction} className="cine-card flex flex-col gap-4 p-6" noValidate>
      <ErrorBanner error={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Nombre"
          name="firstName"
          autoComplete="given-name"
          required
          error={state.fieldErrors['firstName']}
        />
        <TextInput
          label="Apellidos"
          name="lastName"
          autoComplete="family-name"
          required
          error={state.fieldErrors['lastName']}
        />
      </div>

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
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
        hint="Entre 8 y 72 caracteres."
        error={state.fieldErrors['password']}
      />

      <SubmitButton pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>

      <p className="text-ink-500 text-center text-sm">
        ¿Ya tenés una cuenta?{' '}
        <a href="/login" className="text-brand-400 hover:underline">
          Iniciá sesión
        </a>
      </p>
    </form>
  );
}
