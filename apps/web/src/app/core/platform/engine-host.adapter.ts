import DOMPurify from 'dompurify';
import { htmlEntities } from './html-entities.adapter';
import { installEngineHost } from "@dude/crypto/host";

/** Browser and Electron renderer adapters share the same browser security boundaries. */
installEngineHost({
  htmlEntities,
  xxhash: () => import('xxhash-wasm').then(module => module.default()),
  crypto: () => globalThis.crypto,
  request: (...args) => globalThis.fetch(...args),
  compression: (format, decompress) => decompress ? new DecompressionStream(format) : new CompressionStream(format),
  sanitizeHtml: html => DOMPurify.sanitize(html),
  decodeImage: (bytes, mime) => createImageBitmap(new Blob([bytes as BlobPart], { type: mime })),
});
