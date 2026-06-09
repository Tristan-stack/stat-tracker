import { describe, it, expect } from 'vitest';
import { readSseStream, readNdjsonStream } from './stream';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

describe('readSseStream', () => {
  it('parse les frames event/data, y compris coupées entre chunks', async () => {
    const events: Array<{ event: string; data: unknown }> = [];
    await readSseStream(
      streamFromChunks(['event: ping\ndata: {"a":1}\n\n', 'event: done\nda', 'ta: {"b":2}\n\n']),
      (event, data) => events.push({ event, data })
    );
    expect(events).toEqual([
      { event: 'ping', data: { a: 1 } },
      { event: 'done', data: { b: 2 } },
    ]);
  });
});

describe('readNdjsonStream', () => {
  it('parse une ligne JSON par message + flush la dernière ligne sans \\n', async () => {
    const msgs: unknown[] = [];
    await readNdjsonStream(
      streamFromChunks(['{"a":1}\n{"b":', '2}\n{"c":3}']),
      (m) => msgs.push(m)
    );
    expect(msgs).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('ignore les lignes vides/malformées', async () => {
    const msgs: unknown[] = [];
    await readNdjsonStream(streamFromChunks(['\n{"ok":true}\nnot-json\n']), (m) => msgs.push(m));
    expect(msgs).toEqual([{ ok: true }]);
  });
});
