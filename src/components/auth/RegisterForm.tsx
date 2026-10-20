import { navigate } from 'astro:transitions/client';
import { useActionState } from 'react';
import {
  fieldErrors,
  formError,
  formRaw,
  formText,
  initialFormState,
  type FormState,
} from '../../lib/form.ts';
import { DEFAULT_AFTER_LOGIN } from '../../lib/login-redirect.ts';
import { isApiErrorWithCode, toUserMessage } from '../../lib/problem.ts';
import type { RegisterRequest } from '../../lib/types.ts';
import { useAuth } from '../../lib/use-auth.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';

/**
 * El registro siempre crea un `CUSTOMER` — no existe un alta de
 * administrador en autoservicio. Un `ADMIN` solo existe si el backend arrancó con
 * `CINE_ADMIN_EMAIL` y `CINE_ADMIN_PASSWORD`.
 */
export default function RegisterForm() {
  const { register, login } = useAuth();

  const [state, formAction] = useActionState(async (_prev: FormState, formData: FormData) => {
    const payload: RegisterRequest = {
      firstName: formText(formData, 'firstName'),
      lastName: formText(formData, 'lastName'),
      email: formText(formData, 'email'),
      password: formRaw(formData, 'password'),
    };

    try {
      await register(payload);
    } catch (error) {
      // `409 EMAIL_TAKEN`: se muestra en el campo de email, donde se puede corregir.
      if (isApiErrorWithCode(error, 'EMAIL_TAKEN')) {
        return fieldErrors({ email: toUserMessage(error) });
      }
      return formError(error);
    }

    try {
      await login({ email: payload.email, password: payload.password });
      void navigate(DEFAULT_AFTER_LOGIN);
    } catch {
      // La cuenta existe; solo falló el inicio de sesión automático.
      void navigate('/login');
    }
    return initialFormState;
  }, initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-4 cine-card p-6" noValidate>
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
          label="Apellido"
          name="lastName"
          autoComplete="family-name"
          required
          error={state.fieldErrors['lastName']}
        />
      </div>

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
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
        hint="Entre 8 y 72 caracteres."
        error={state.fieldErrors['password']}
      />

      <SubmitButton pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>

      <p className="text-center text-sm text-ink-500">
        ¿Ya tenés una cuenta?{' '}
        <a href="/login" className="text-brand-400 hover:underline">
          Iniciá sesión
        </a>
      </p>
    </form>
  );
}
