// Must be the first import of the app entry: engines assume URL, TextEncoder/TextDecoder and crypto exist.
import 'react-native-url-polyfill/auto';
import 'fast-text-encoding';
import { getRandomValues, randomUUID } from 'expo-crypto';
import { installCryptoPolyfill } from './crypto-polyfill';

installCryptoPolyfill({ getRandomValues: <T extends ArrayBufferView>(array: T) => getRandomValues(array as unknown as Uint8Array) as unknown as T, randomUUID });
