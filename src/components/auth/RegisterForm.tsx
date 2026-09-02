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
 * Registration always creates a `CUSTOMER` — there is no self-service admin
 * signup. An `ADMIN` only exists if the backend booted with
 * `CINE_ADMIN_EMAIL` and `CINE_ADMIN_PASSWORD`.
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
      // 409 means the email is taken; bind it to the email field so the user
      // sees it where they can fix it, without matching on the message text.
      if (isApiError(error) && error.status === 409) {
        return { error, fieldErrors: { email: 'That email is already registered.' } };
      }
      return { error, fieldErrors: toFieldErrors(error) };
    }

    try {
      await login({ email: payload.email, password: payload.password });
      window.location.assign('/reservations');
      return initialState;
    } catch {
      // The account exists; only the convenience sign-in failed.
      window.location.assign('/login');
      return initialState;
    }
  }, initialState);

  return (
    <form action={formAction} className="cine-card flex flex-col gap-4 p-6" noValidate>
      <ErrorBanner error={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          error={state.fieldErrors['firstName']}
        />
        <TextInput
          label="Last name"
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
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
        hint="Between 8 and 72 characters."
        error={state.fieldErrors['password']}
      />

      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>

      <p className="text-ink-500 text-center text-sm">
        Already have an account?{' '}
        <a href="/login" className="text-brand-400 hover:underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
