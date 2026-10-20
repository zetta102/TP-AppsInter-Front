import { navigate } from 'astro:transitions/client';
import { useActionState } from 'react';
import { changeMyPassword, updateMyProfile } from '../../lib/api/users.ts';
import { fieldErrors, formError, formRaw, formText, type FormState } from '../../lib/form.ts';
import { isApiErrorWithCode, toUserMessage } from '../../lib/problem.ts';
import { useAuth } from '../../lib/use-auth.ts';
import { ErrorBanner } from '../ui/ErrorBanner.tsx';
import { TextInput } from '../ui/Field.tsx';
import { AuthGuard } from '../ui/Guards.tsx';
import { SubmitButton } from '../ui/SubmitButton.tsx';

/**
 * `/account` — perfil y contraseña en autoservicio.
 *
 * Le da a cada usuario autenticado una forma de editar su nombre y cambiar su contraseña
 * sin pasar por un administrador.
 */
export default function Account() {
  return (
    <AuthGuard message="Iniciá sesión para gestionar tu cuenta.">
      <AccountPanel />
    </AuthGuard>
  );
}

/** Un formulario que, además de los errores, informa si el último envío salió bien. */
interface SavedFormState extends FormState {
  readonly success: boolean;
}

const initialState: SavedFormState = { error: null, fieldErrors: {}, success: false };
const savedState: SavedFormState = { ...initialState, success: true };

function AccountPanel() {
  const { user, tokens, setUser, logout } = useAuth();

  const [profileState, profileAction] = useActionState(
    async (_prev: SavedFormState, formData: FormData): Promise<SavedFormState> => {
      try {
        const updated = await updateMyProfile({
          firstName: formText(formData, 'firstName'),
          lastName: formText(formData, 'lastName'),
        });
        setUser(updated);
        return savedState;
      } catch (error) {
        return { ...formError(error), success: false };
      }
    },
    initialState,
  );

  const [passwordState, passwordAction] = useActionState(
    async (_prev: SavedFormState, formData: FormData): Promise<SavedFormState> => {
      const currentPassword = formRaw(formData, 'currentPassword');
      const newPassword = formRaw(formData, 'newPassword');
      const signOutEverywhere = formData.get('signOutEverywhere') === 'on';

      if (newPassword !== formRaw(formData, 'confirmPassword')) {
        return {
          ...fieldErrors({ confirmPassword: 'Las contraseñas no coinciden.' }),
          success: false,
        };
      }

      try {
        await changeMyPassword({
          currentPassword,
          newPassword,
          // Con el refresh token de esta sesión, la sesión sigue iniciada acá mientras se cierran
          // las demás; sin él, se cierra en todas partes, incluida esta pestaña.
          ...(!signOutEverywhere && tokens?.refreshToken
            ? { refreshToken: tokens.refreshToken }
            : {}),
        });

        if (signOutEverywhere) {
          await logout();
          void navigate('/login');
        }
        return savedState;
      } catch (error) {
        // `422 WRONG_PASSWORD`: la contraseña actual es incorrecta, pero la sesión sigue
        // siendo válida. Se vincula a ese campo y no se cierra la sesión.
        if (isApiErrorWithCode(error, 'WRONG_PASSWORD')) {
          return { ...fieldErrors({ currentPassword: toUserMessage(error) }), success: false };
        }
        return { ...formError(error), success: false };
      }
    },
    initialState,
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <section className="flex flex-col gap-4 cine-card p-6">
        <h2 className="text-lg font-semibold">Perfil</h2>

        <ErrorBanner error={profileState.error} />
        {profileState.success && (
          <p role="status" className="cine-alert-success px-4 py-2 text-sm">
            Perfil actualizado.
          </p>
        )}

        <p className="text-sm text-ink-500">
          Iniciaste sesión como <span className="text-ink-200">{user?.email}</span>
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
              label="Apellido"
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

      <section className="flex flex-col gap-4 cine-card p-6">
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>

        <ErrorBanner error={passwordState.error} />
        {passwordState.success && (
          <p role="status" className="cine-alert-success px-4 py-2 text-sm">
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

          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input type="checkbox" name="signOutEverywhere" className="size-4" />
            Cerrar también la sesión en este dispositivo
          </label>
          <p className="-mt-2 text-xs text-ink-500">
            Al cambiar la contraseña siempre se cierra la sesión en los demás dispositivos. Dejalo
            desmarcado para seguir con la sesión iniciada acá.
          </p>

          <SubmitButton pendingLabel="Cambiando…">Cambiar contraseña</SubmitButton>
        </form>
      </section>
    </div>
  );
}
