import { useActionState } from 'react';
import { useAuth } from '../../lib/auth-context.tsx';
import { changeMyPassword, updateMyProfile } from '../../lib/api/users.ts';
import { isApiErrorWithCode, toFieldErrors, toUserMessage } from '../../lib/problem.ts';
import { logout } from '../../lib/auth-store.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { TextInput } from '../ui/Field.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';
import { AuthGuard } from '../ui/Guards.tsx';

/**
 * `/account` (frontend-spec.md §8.9) — perfil y contraseña en autoservicio.
 *
 * No forma parte de la tabla de rutas sugerida en §10; se añadió por decisión
 * de producto para dar a cada usuario autenticado una forma de editar su nombre
 * y cambiar su contraseña sin pasar por un administrador.
 */
export default function Account() {
  return (
    <AuthGuard message="Inicia sesión para gestionar tu cuenta.">
      <AccountPanel />
    </AuthGuard>
  );
}

interface ProfileState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly success: boolean;
}

const initialProfileState: ProfileState = { error: null, fieldErrors: {}, success: false };

interface PasswordState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly success: boolean;
}

const initialPasswordState: PasswordState = { error: null, fieldErrors: {}, success: false };

function AccountPanel() {
  const { user, tokens, setUser } = useAuth();

  const [profileState, profileAction] = useActionState(
    async (_prev: ProfileState, formData: FormData) => {
      const firstName = String(formData.get('firstName') ?? '').trim();
      const lastName = String(formData.get('lastName') ?? '').trim();
      try {
        const updated = await updateMyProfile({ firstName, lastName });
        setUser(updated);
        return { error: null, fieldErrors: {}, success: true };
      } catch (error) {
        return { error, fieldErrors: toFieldErrors(error), success: false };
      }
    },
    initialProfileState,
  );

  const [passwordState, passwordAction] = useActionState(
    async (_prev: PasswordState, formData: FormData) => {
      const currentPassword = String(formData.get('currentPassword') ?? '');
      const newPassword = String(formData.get('newPassword') ?? '');
      const confirmPassword = String(formData.get('confirmPassword') ?? '');
      const signOutEverywhere = formData.get('signOutEverywhere') === 'on';

      if (newPassword !== confirmPassword) {
        return {
          error: null,
          fieldErrors: { confirmPassword: 'Las contraseñas no coinciden.' },
          success: false,
        };
      }

      try {
        await changeMyPassword({
          currentPassword,
          newPassword,
          // Pasa el refresh token de la sesión actual para seguir con la sesión
          // iniciada aquí mientras se cierran las demás; omítelo para cerrar
          // sesión en todas partes, incluida la pestaña actual.
          ...(!signOutEverywhere && tokens?.refreshToken
            ? { refreshToken: tokens.refreshToken }
            : {}),
        });

        if (signOutEverywhere) {
          await logout();
          window.location.assign('/login');
          return { error: null, fieldErrors: {}, success: true };
        }

        return { error: null, fieldErrors: {}, success: true };
      } catch (error) {
        // El 401 significa que currentPassword es incorrecta; vincúlalo a ese campo.
        if (isApiErrorWithCode(error, 'INVALID_CREDENTIALS')) {
          return {
            error: null,
            fieldErrors: { currentPassword: toUserMessage(error) },
            success: false,
          };
        }
        return { error, fieldErrors: toFieldErrors(error), success: false };
      }
    },
    initialPasswordState,
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <section className="cine-card flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">Perfil</h2>

        <ErrorBanner error={profileState.error} />
        {profileState.success && (
          <p
            role="status"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm"
          >
            Perfil actualizado.
          </p>
        )}

        <p className="text-ink-500 text-sm">
          Has iniciado sesión como <span className="text-ink-200">{user?.email}</span>
        </p>

        <form action={profileAction} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Nombre"
              name="firstName"
              autoComplete="given-name"
              defaultValue={user?.firstName}
              required
              error={profileState.fieldErrors['firstName']}
            />
            <TextInput
              label="Apellidos"
              name="lastName"
              autoComplete="family-name"
              defaultValue={user?.lastName}
              required
              error={profileState.fieldErrors['lastName']}
            />
          </div>
          <SubmitButton pendingLabel="Guardando…">Guardar perfil</SubmitButton>
        </form>
      </section>

      <section className="cine-card flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>

        <ErrorBanner error={passwordState.error} />
        {passwordState.success && (
          <p
            role="status"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm"
          >
            Contraseña actualizada.
          </p>
        )}

        <form action={passwordAction} className="flex flex-col gap-4" noValidate>
          <TextInput
            label="Contraseña actual"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            error={passwordState.fieldErrors['currentPassword']}
          />
          <TextInput
            label="Nueva contraseña"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            hint="Entre 8 y 72 caracteres."
            error={passwordState.fieldErrors['newPassword']}
          />
          <TextInput
            label="Confirmar nueva contraseña"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            error={passwordState.fieldErrors['confirmPassword']}
          />

          <label className="text-ink-300 flex items-center gap-2 text-sm">
            <input type="checkbox" name="signOutEverywhere" className="size-4" />
            Cerrar también la sesión en este dispositivo
          </label>
          <p className="text-ink-600 -mt-2 text-xs">
            Al cambiar la contraseña siempre se cerrará la sesión en los demás dispositivos. Déjalo
            desmarcado para seguir con la sesión iniciada aquí.
          </p>

          <SubmitButton pendingLabel="Cambiando…">Cambiar contraseña</SubmitButton>
        </form>
      </section>
    </div>
  );
}
