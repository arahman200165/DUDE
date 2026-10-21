/** The subset of expo-crypto the polyfill needs; injected so the logic is testable without native modules. */
export interface RandomSource {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID(): string;
}

/** Installs globalThis.crypto.getRandomValues/randomUUID only when absent; a native implementation is never replaced. */
export function installCryptoPolyfill(source: RandomSource, target: { crypto?: unknown } = globalThis): void {
  let current = target.crypto as { getRandomValues?: unknown; randomUUID?: unknown } | undefined;
  if (!current) {
    current = {};
    Object.defineProperty(target, 'crypto', { value: current, configurable: true, writable: true, enumerable: false });
  }
  if (typeof current.getRandomValues !== 'function') {
    Object.defineProperty(current, 'getRandomValues', { value: <T extends ArrayBufferView>(array: T) => source.getRandomValues(array), configurable: true, writable: true });
  }
  if (typeof current.randomUUID !== 'function') {
    Object.defineProperty(current, 'randomUUID', { value: () => source.randomUUID(), configurable: true, writable: true });
  }
}
