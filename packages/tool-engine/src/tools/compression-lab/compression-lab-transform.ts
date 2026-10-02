import { hostCompression } from "@dude/crypto/host";
/**
 * Only formats the native Compression Streams API actually supports. Brotli and zstd are
 * deliberately out of scope — there is no standard `CompressionStream` format string for either,
 * and no small, well-maintained pure-JS/wasm *compressor* (not just decoder) for zstd exists at a
 * size that clears the dependency-minimal bar.
 */
export type CompressionFormat = 'gzip' | 'deflate' | 'deflate-raw';

export const COMPRESSION_FORMATS: Record<CompressionFormat, string> = {
  gzip: 'gzip',
  deflate: 'deflate (zlib)',
  'deflate-raw': 'deflate (raw)',
};

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

/**
 * Drains the piped stream manually via its reader rather than going through `Blob`/`Response` —
 * jsdom's `Blob` doesn't implement `.stream()`, which the unit tests run under.
 */
function pipeThroughStream(input: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  // lib.dom's CompressionStream/DecompressionStream types declare `writable: WritableStream<BufferSource>`,
  // which TS's generic variance check doesn't consider assignable from `ReadableStream<Uint8Array>` — safe at runtime.
  const transform = stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  return readAll(toReadableStream(input).pipeThrough(transform));
}

export function compressBytes(input: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  return pipeThroughStream(input, hostCompression(format, false));
}

export function decompressBytes(input: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  return pipeThroughStream(input, hostCompression(format, true));
}

export interface CompressionStats {
  readonly inputBytes: number;
  readonly outputBytes: number;
  /** Output size as a fraction of input size — below 1 means it shrank. Null when input is empty. */
  readonly ratio: number | null;
}

export function computeStats(inputBytes: number, outputBytes: number): CompressionStats {
  return { inputBytes, outputBytes, ratio: inputBytes === 0 ? null : outputBytes / inputBytes };
}
