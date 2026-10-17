/**
 * Parser mínimo de Server-Sent Events (formato de WHATWG), para leer el stream de asientos con
 * `fetch` en lugar de `EventSource`, que no puede enviar el header `Authorization`
 * (backend-status-for-frontend.md §7.6).
 *
 * Se alimenta con fragmentos de texto arbitrarios: una línea o un evento pueden llegar
 * partidos entre dos fragmentos. Soporta `\n`, `\r\n` y `\r`, `data:` en varias líneas y
 * comentarios (`:keep-alive`), que se ignoran. `id:` y `retry:` no se usan en este backend.
 */

export interface SseEvent {
  /** `message` cuando el evento no declara `event:`. */
  readonly event: string;
  readonly data: string;
}

export interface SseParser {
  /** Procesa un fragmento y emite cada evento completo. */
  push(chunk: string): void;
}

export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = '';
  let eventName = '';
  let data: string[] = [];
  // Un `\r` al final de un fragmento puede ser la mitad de un `\r\n`.
  let pendingCr = false;

  function dispatch(): void {
    if (data.length > 0) onEvent({ event: eventName || 'message', data: data.join('\n') });
    eventName = '';
    data = [];
  }

  function line(text: string): void {
    if (text === '') {
      dispatch();
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value;
    else if (field === 'data') data.push(value);
  }

  return {
    push(chunk) {
      let text = chunk;
      if (pendingCr && text.startsWith('\n')) text = text.slice(1);
      pendingCr = false;
      buffer += text;

      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char !== '\n' && char !== '\r') continue;
        line(buffer.slice(start, i));
        if (char === '\r') {
          if (i + 1 === buffer.length) pendingCr = true;
          else if (buffer[i + 1] === '\n') i++;
        }
        start = i + 1;
      }
      buffer = buffer.slice(start);
    },
  };
}

/** Lee un body de `fetch` como SSE hasta que el servidor lo cierre o se aborte la lectura. */
export async function readSse(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const parser = createSseParser(onEvent);
  // `TextDecoderStream` conserva entre fragmentos los caracteres UTF-8 partidos. Se lee con un
  // reader explícito porque Safari todavía no soporta `for await` sobre un `ReadableStream`.
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      parser.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
