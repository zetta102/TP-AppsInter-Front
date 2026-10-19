import { describe, expect, it } from 'vitest';
import { cx } from './cx.ts';
import { delay } from './delay.ts';
import { contactCategoryValues, isEnumValue, movieGenreValues } from './enums.ts';

describe('cx', () => {
  it('une las clases e ignora los valores falsy sin dejar espacios sobrantes', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
    expect(cx()).toBe('');
  });
});

describe('isEnumValue', () => {
  it('acepta solo valores de la lista', () => {
    expect(isEnumValue(movieGenreValues, 'DRAMA')).toBe(true);
    expect(isEnumValue(movieGenreValues, 'drama')).toBe(false);
    expect(isEnumValue(movieGenreValues, 42)).toBe(false);
    expect(isEnumValue(movieGenreValues, null)).toBe(false);
    expect(isEnumValue(contactCategoryValues, 'COMPLAINT')).toBe(true);
    expect(isEnumValue(contactCategoryValues, 'complaint')).toBe(false);
  });
});

describe('delay', () => {
  it('resuelve después del tiempo indicado', async () => {
    await expect(delay(1)).resolves.toBeUndefined();
  });

  it('rechaza con el motivo del abort y no deja el listener colgado', async () => {
    const controller = new AbortController();
    const pending = delay(10_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rechaza de inmediato si la señal ya estaba abortada', async () => {
    await expect(delay(10_000, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('quita el listener de abort cuando gana el timeout', async () => {
    const controller = new AbortController();
    let listeners = 0;
    const { signal } = controller;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (...args: Parameters<typeof add>) => {
      listeners++;
      add(...args);
    };
    signal.removeEventListener = (...args: Parameters<typeof remove>) => {
      listeners--;
      remove(...args);
    };

    await delay(1, signal);
    expect(listeners).toBe(0);
  });
});
