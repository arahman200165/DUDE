import { installEngineHost, HostFacilityUnavailableError } from "@dude/crypto/host";
installEngineHost({
  htmlEntities: () => { throw new HostFacilityUnavailableError('HTML entities in workers'); },
  xxhash: () => import('xxhash-wasm').then(module => module.default()),
  crypto: () => globalThis.crypto,
  request: (...args) => globalThis.fetch(...args),
  compression: (format, decompress) => decompress ? new DecompressionStream(format) : new CompressionStream(format),
  sanitizeHtml: () => { throw new HostFacilityUnavailableError('DOM sanitization in workers'); },
  decodeImage: (bytes, mime) => createImageBitmap(new Blob([bytes as BlobPart], { type: mime })),
});
