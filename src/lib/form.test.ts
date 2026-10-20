import { describe, expect, it } from 'vitest';
import {
  fieldErrors,
  formError,
  formOptionalText,
  formRaw,
  formText,
  initialFormState,
} from './form.ts';
import { ApiError } from './problem.ts';

function data(entries: Record<string, string | Blob>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(entries)) formData.append(name, value);
  return formData;
}

describe('lectura de FormData', () => {
  it('formText recorta y formRaw conserva los espacios', () => {
    const formData = data({ name: '  Ada  ', password: ' secreta ' });
    expect(formText(formData, 'name')).toBe('Ada');
    expect(formRaw(formData, 'password')).toBe(' secreta ');
  });

  it('un campo ausente o un archivo se leen como texto vacío', () => {
    const formData = data({ file: new Blob(['x']) });
    expect(formText(formData, 'missing')).toBe('');
    expect(formRaw(formData, 'file')).toBe('');
  });

  it('formOptionalText devuelve null para un campo vacío', () => {
    const formData = data({ director: '   ', certification: 'PG-13' });
    expect(formOptionalText(formData, 'director')).toBeNull();
    expect(formOptionalText(formData, 'certification')).toBe('PG-13');
  });
});

describe('estado de formulario', () => {
  it('formError arma el banner y los errores por campo desde un ApiError', () => {
    const error = new ApiError(400, {
      code: 'VALIDATION_FAILED',
      violations: [{ field: 'email', code: 'Email', params: {} }],
    });
    expect(formError(error)).toEqual({
      error,
      fieldErrors: { email: 'Ingresá un email válido.' },
    });
  });

  it('fieldErrors no muestra banner', () => {
    expect(fieldErrors({ startsAt: 'Completá este campo.' })).toEqual({
      ...initialFormState,
      fieldErrors: { startsAt: 'Completá este campo.' },
    });
  });
});
