import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from 'react';

/**
 * Form primitives that bind the backend's flat `errors` map to inputs.
 *
 * Binding is by **field name only**. Bean-validation messages are localised
 * server-side (a Spanish-locale server returns `"no debe estar vacío"`), so the
 * message text is never matched on — we render the server string as supplementary
 * detail beneath our own copy where useful, and rely on the key for placement.
 */

export interface FieldProps {
  readonly label: string;
  readonly children: (props: { readonly id: string; readonly describedBy: string | undefined }) => ReactNode;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly required?: boolean;
  readonly className?: string;
}

export function Field({ label, children, error, hint, required, className = '' }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="cine-label">
        {label}
        {required && <span className="text-brand-400 ml-1">*</span>}
      </label>
      {children({ id, describedBy })}
      {error ? (
        <p id={errorId} role="alert" className="text-brand-400 mt-1 text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-ink-500 mt-1 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  /** React 19: refs are plain props, no `forwardRef` wrapper needed. */
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

type TextAreaProps = Omit<
  InputHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'type'
> & {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly ref?: Ref<HTMLTextAreaElement>;
  readonly rows?: number;
};

export function TextArea({ label, error, hint, ref, rows = 4, required, ...props }: TextAreaProps) {
  return (
    <Field label={label} error={error} hint={hint} {...(required === undefined ? {} : { required })}>
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
