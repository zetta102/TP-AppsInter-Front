import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  // Timers falsos: las esperas de 10 s no hacen esperar a la suite.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resuelve después del tiempo indicado, no antes', async () => {
    const onResolved = vi.fn();
    const pending = delay(10_000).then(onResolved);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(onResolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(onResolved).toHaveBeenCalledOnce();
  });

  it('rechaza con el motivo del abort y limpia el timer', async () => {
    const controller = new AbortController();
    const pending = delay(10_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rechaza de inmediato si la señal ya estaba abortada', async () => {
    await expect(delay(10_000, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('quita el listener de abort cuando gana el timeout', async () => {
    const { signal } = new AbortController();
    const add = vi.spyOn(signal, 'addEventListener');
    const remove = vi.spyOn(signal, 'removeEventListener');

    const pending = delay(1, signal);
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
  });
});
