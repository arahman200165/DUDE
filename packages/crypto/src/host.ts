import type { EngineHostPorts } from "@dude/contracts/engine-host";

let ports: EngineHostPorts | undefined;

export class HostFacilityUnavailableError extends Error {
  constructor(facility: string) { super(`Host facility unavailable: ${facility}`); this.name = 'HostFacilityUnavailableError'; }
}

/** Composition roots install adapters before executing engines, including in worker realms. */
export function installEngineHost(next: EngineHostPorts): void { ports = next; }
function host(): EngineHostPorts { if (!ports) throw new HostFacilityUnavailableError('engine host'); return ports; }
export function hostCrypto(): Crypto { return host().crypto(); }
export const hostFetch: typeof fetch = (...args) => host().request(...args);
export function hostCompression(format: CompressionFormat, decompress = false): CompressionStream | DecompressionStream { return host().compression(format, decompress); }
export function hostSanitizeHtml(html: string): string { return host().sanitizeHtml(html); }
export function hostHtmlEntities(input: string, mode: 'encode' | 'decode'): string { return host().htmlEntities(input, mode); }
export function hostDecodeImage(bytes: Uint8Array, mime: string): ReturnType<EngineHostPorts['decodeImage']> { return host().decodeImage(bytes, mime); }

export function hostXxhash(): ReturnType<EngineHostPorts['xxhash']> { return host().xxhash(); }
