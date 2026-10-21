import type { EngineHostPorts } from '@dude/contracts/engine-host';
import { HostFacilityUnavailableError, installEngineHost } from '@dude/crypto/host';
import { createSubtleSubset } from './subtle-subset';

type RandomCrypto = Pick<Crypto, 'getRandomValues' | 'randomUUID'>;
const unavailable = (facility: string) => (): never => { throw new HostFacilityUnavailableError(facility); };
const unavailableAsync = (facility: string) => (): Promise<never> => Promise.reject(new HostFacilityUnavailableError(facility));

/** Crypto-like host object: native/polyfilled random sources plus a digest/HMAC SubtleCrypto subset. */
export function createMobileCrypto(random: () => RandomCrypto = () => globalThis.crypto): Crypto {
  const subtle = createSubtleSubset();
  return {
    subtle,
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => random().getRandomValues(array as ArrayBufferView<ArrayBuffer>) as T,
    randomUUID: () => random().randomUUID(),
  } as unknown as Crypto;
}

/** Facilities Hermes cannot provide fail explicitly instead of being discovered ad hoc by engines. */
export function createMobileEngineHostPorts(random?: () => RandomCrypto): EngineHostPorts {
  const hostCrypto = createMobileCrypto(random);
  return {
    crypto: () => hostCrypto,
    request: unavailableAsync('request') as unknown as typeof fetch,
    compression: unavailable('compression'),
    sanitizeHtml: unavailable('sanitizeHtml'),
    htmlEntities: unavailable('htmlEntities'),
    decodeImage: unavailableAsync('decodeImage'),
    xxhash: unavailableAsync('xxhash'),
  };
}

let installed = false;
/** Installed once at app entry, after polyfills; repeated calls are no-ops. */
export function installMobileEngineHost(): void {
  if (installed) return;
  installed = true;
  installEngineHost(createMobileEngineHostPorts());
}
