import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from 'react';

/**
 * Primitivas de formulario que muestran los errores por campo (`ApiError.fieldErrors`) junto a
 * cada input.
 *
 * La vinculación se hace **solo por nombre de campo**. El texto sale de `problem.ts`, que lo arma
 * en español a partir de `violations` (`{ field, code, params }`); el texto de `errors` del
 * servidor depende de su idioma y solo se usa como respaldo para restricciones desconocidas.
 */

export interface FieldProps {
  readonly label: string;
  readonly children: (props: {
    readonly id: string;
    readonly describedBy: string | undefined;
  }) => ReactNode;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly required?: boolean;
  readonly className?: string;
}

export function Field({ label, children, error, hint, required, className = '' }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  // El error y la pista se anuncian juntos: el error no debe ocultar el formato esperado.
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="cine-label">
        {label}
        {/* El `required` nativo ya lo anuncia; el asterisco es solo visual. */}
        {required && (
          <span aria-hidden="true" className="ml-1 text-brand-400">
            *
          </span>
        )}
      </label>
      {children({ id, describedBy })}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-brand-400">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  /** React 19: las refs son props comunes; no hace falta un wrapper con `forwardRef`. */
  readonly ref?: Ref<HTMLInputElement>;
  readonly fieldClassName?: string;
};

export function TextInput({
  label,
  error,
  hint,
  ref,
  fieldClassName,
  required,
  ...inputProps
}: TextInputProps) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      {...(required === undefined ? {} : { required })}
      {...(fieldClassName === undefined ? {} : { className: fieldClassName })}
    >
      {({ id, describedBy }) => (
        <input
          {...inputProps}
          id={id}
          ref={ref}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="cine-input"
        />
      )}
    </Field>
  );
}

type SelectInputProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly ref?: Ref<HTMLSelectElement>;
  readonly fieldClassName?: string;
  readonly children: ReactNode;
};

export function SelectInput({
  label,
  error,
  hint,
  ref,
  fieldClassName,
  required,
  children,
  ...selectProps
}: SelectInputProps) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      {...(required === undefined ? {} : { required })}
      {...(fieldClassName === undefined ? {} : { className: fieldClassName })}
    >
      {({ id, describedBy }) => (
        <select
          {...selectProps}
          id={id}
          ref={ref}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="cine-input"
        >
          {children}
        </select>
      )}
    </Field>
  );
}

type TextAreaProps = Omit<InputHTMLAttributes<HTMLTextAreaElement>, 'className' | 'type'> & {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly ref?: Ref<HTMLTextAreaElement>;
  readonly rows?: number;
};

export function TextArea({ label, error, hint, ref, rows = 4, required, ...props }: TextAreaProps) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      {...(required === undefined ? {} : { required })}
    >
      {({ id, describedBy }) => (
        <textarea
          {...props}
          id={id}
          ref={ref}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="cine-input"
        />
      )}
    </Field>
  );
}
