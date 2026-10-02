import { installEngineHost as installSourceHost } from '../packages/crypto/src/host';
import xxhash from 'xxhash-wasm';
import type { EngineHostPorts } from '@dude/contracts/engine-host';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { installEngineHost } from '@dude/crypto/host';
let purifier: ReturnType<typeof createDOMPurify> | undefined;
let entityDocument: Document | undefined;
const ports: EngineHostPorts = {
  htmlEntities: (input, mode) => {
    entityDocument ??= new JSDOM('').window.document;
    if (mode === 'decode') {
      const textarea = entityDocument.createElement('textarea');
      textarea.innerHTML = input;
      return textarea.value;
    }
    const container = entityDocument.createElement('div');
    container.textContent = input;
    return container.innerHTML;
  },
  xxhash,
  crypto: () => globalThis.crypto,
  request: (...args) => globalThis.fetch(...args),
  compression: (format, decompress) => decompress ? new DecompressionStream(format) : new CompressionStream(format),
  decodeImage: (bytes, mime) => createImageBitmap(new Blob([bytes as BlobPart], { type: mime })),
  sanitizeHtml: html => {
    purifier ??= createDOMPurify(new JSDOM('').window as unknown as Parameters<typeof createDOMPurify>[0]);
    return purifier.sanitize(html);
  },
};
installEngineHost(ports);
installSourceHost(ports);
