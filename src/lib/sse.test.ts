import { describe, expect, it } from 'vitest';
import { createSseParser, readSse, type SseEvent } from './sse.ts';

function collect(chunks: readonly string[]): SseEvent[] {
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  for (const chunk of chunks) parser.push(chunk);
  return events;
}

describe('createSseParser', () => {
  it('parsea el formato del backend e ignora los comentarios', () => {
    expect(
      collect([
        ':connected\n\nevent:seats\ndata:[{"seatId":"a","available":false,"held":true}]\n\n:keep-alive\n\n',
      ]),
    ).toEqual([{ event: 'seats', data: '[{"seatId":"a","available":false,"held":true}]' }]);
  });

  it('arma eventos partidos entre fragmentos', () => {
    expect(collect(['eve', 'nt: seats\nda', 'ta: [1]', '\n', '\n'])).toEqual([
      { event: 'seats', data: '[1]' },
    ]);
  });

  it('une varias líneas `data:` y usa `message` por defecto', () => {
    expect(collect(['data: a\ndata: b\n\n'])).toEqual([{ event: 'message', data: 'a\nb' }]);
  });

  it('acepta CRLF, también partido entre fragmentos', () => {
    expect(collect(['event: seats\r', '\ndata: x\r\n\r', '\n'])).toEqual([
      { event: 'seats', data: 'x' },
    ]);
  });

  it('no emite un evento sin `data` ni uno incompleto', () => {
    expect(collect(['event: seats\n\n', 'data: pendiente'])).toEqual([]);
  });
});

describe('readSse', () => {
  it('decodifica UTF-8 partido entre lecturas', async () => {
    const bytes = new TextEncoder().encode('data: función\n\n');
    const split = bytes.indexOf(0xc3) + 1; // en medio de la "ó"
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    const events: SseEvent[] = [];
    await readSse(body, (event) => events.push(event));
    expect(events).toEqual([{ event: 'message', data: 'función' }]);
  });
});
