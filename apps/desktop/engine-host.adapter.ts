import xxhash from 'xxhash-wasm';
import { installEngineHost, HostFacilityUnavailableError } from "@dude/crypto/host";
installEngineHost({
  htmlEntities: () => { throw new HostFacilityUnavailableError('HTML entities in Electron main'); },
  xxhash,
  crypto: () => globalThis.crypto,
  request: (...args) => globalThis.fetch(...args),
  compression: (format, decompress) => decompress ? new DecompressionStream(format) : new CompressionStream(format),
  sanitizeHtml: () => { throw new HostFacilityUnavailableError('DOM sanitization in Electron main'); },
  decodeImage: () => { throw new HostFacilityUnavailableError('image decoding in Electron main'); },
});
