// Runs on the react-native-worklets 'dude-tools' worker runtime (never at app entry). A worker runtime is a bare Hermes with
// none of the globals installed on the React Native runtime, and neither expo native modules nor React Native's NativeModules
// exist there, so this installs only the pure-JS subset heavy engines need: TextEncoder/TextDecoder and the digest/HMAC engine
// host. Random sources throw. URL is deliberately absent: react-native-url-polyfill reads NativeModules.BlobModule, which does not
// exist on a worker runtime, so a task that needs URL is not an off-thread candidate.
import 'fast-text-encoding';
import { installCryptoPolyfill } from './crypto-polyfill';
import { installMobileEngineHost } from './mobile-engine-host';

const noRandom = (): never => { throw new Error('Random values are not available on the off-thread worker; generate them on the JS thread.'); };

/** Idempotent; the first thing the worker runtime executes (see src/kit/off-thread.ts). */
export function installWorkerHost(): void {
  installCryptoPolyfill({ getRandomValues: noRandom, randomUUID: noRandom });
  installMobileEngineHost();
}
