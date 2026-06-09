/**
 * Lecteurs de flux HTTP partagés (mutualisent la boucle reader + TextDecoder +
 * buffer + split précédemment dupliquée dans chaque consommateur streaming).
 * Pures : la gestion d'état (UI, timeouts, abort) reste côté appelant.
 */

/** Lit un flux SSE (`event: …` / `data: …`) et invoque `onEvent` par frame. */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: unknown) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          onEvent(currentEvent, JSON.parse(line.slice(6)));
        } catch {
          /* skip malformed */
        }
        currentEvent = '';
      }
    }
  }
}

/** Lit un flux NDJSON (une ligne = un objet JSON) et invoque `onMessage` par message. */
export async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onMessage: (msg: unknown) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const emit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') return;
    try {
      onMessage(JSON.parse(trimmed));
    } catch {
      /* skip malformed */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) emit(line);
  }
  emit(buffer);
}
