import { hostCompression } from "@dude/crypto/host";
import { ArchiveEntry } from "./archive-tool-types.js";
import { createTar, extractTar, TarCreateResult } from "./archive-tool-tar.js";

function toReadableStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// Drains via the stream's reader rather than Blob/Response — jsdom's Blob has no .stream().
// The `as unknown as` cast works around a lib.dom generic-variance mismatch, safe at runtime.
function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const transform = hostCompression('gzip', false) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  return readAll(toReadableStream(bytes).pipeThrough(transform));
}

function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const transform = hostCompression('gzip', true) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  return readAll(toReadableStream(bytes).pipeThrough(transform));
}

export type TarGzCreateResult = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly error: string };

export async function createTarGz(entries: readonly ArchiveEntry[]): Promise<TarGzCreateResult> {
  const tarResult: TarCreateResult = createTar(entries);
  if (!tarResult.ok) return tarResult;
  return { ok: true, bytes: await gzip(tarResult.bytes) };
}

export async function extractTarGz(bytes: Uint8Array): Promise<readonly ArchiveEntry[]> {
  const tarBytes = await gunzip(bytes);
  return extractTar(tarBytes);
}
