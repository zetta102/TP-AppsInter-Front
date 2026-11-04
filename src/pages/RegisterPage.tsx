import RegisterForm from '../components/auth/RegisterForm.tsx';

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 cine-plate">
        <h1 className="mb-1 text-lg sm:text-2xl">Creá tu cuenta</h1>
        <p className="text-sm text-ink-500">
          Las cuentas nuevas siempre son de cliente. El acceso de administrador se otorga desde el
          servidor.
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
