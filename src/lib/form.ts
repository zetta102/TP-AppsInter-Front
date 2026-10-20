import { toFieldErrors } from './problem.ts';

/**
 * Piezas compartidas por los formularios que se envían con Actions de React 19
 * (`useActionState` + `<form action>`).
 */

/** Resultado de una Action de formulario: el error general y los errores por campo. */
export interface FormState {
  readonly error: unknown;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

export const initialFormState: FormState = { error: null, fieldErrors: {} };

/** Estado de formulario a partir de un error lanzado: banner + errores vinculados a cada campo. */
export function formError(error: unknown): FormState {
  return { error, fieldErrors: toFieldErrors(error) };
}

/** Un error solo de campos, validado en el cliente (sin banner). */
export function fieldErrors(errors: Readonly<Record<string, string>>): FormState {
  return { error: null, fieldErrors: errors };
}

/** El valor de texto de un campo, recortado; `''` si falta o es un archivo. */
export function formText(formData: FormData, name: string): string {
  return formRaw(formData, name).trim();
}

/** El valor de texto de un campo sin recortar (contraseñas: los espacios cuentan). */
export function formRaw(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** El texto recortado, o `null` si quedó vacío (campos opcionales que el backend espera nulos). */
export function formOptionalText(formData: FormData, name: string): string | null {
  return formText(formData, name) || null;
}
