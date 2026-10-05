import { requireNativeModule } from 'expo-modules-core';
import type { HubRequest, HubTransport } from '@dude/api-client';
import { MobileHubError, type MobileHubTarget, type MobileSigner } from './types';

export type NativeSocketEvent = { readonly id: string; readonly kind: 'open' | 'message' | 'close' | 'failure'; readonly text?: string; readonly code?: number; readonly error?: string };
interface NativeHubModule {
  prepareKey(environmentId: string, installId: string): Promise<string>;
  publicKey(keyRef: string): Promise<string>;
  signEnrollment(keyRef: string, hubInstanceId: string, pairingCode: string, deviceId: string): Promise<string>;
  signChallenge(keyRef: string, hubInstanceId: string, nonce: string, deviceId: string): Promise<string>;
  deleteKey(keyRef: string): Promise<void>;
  randomBytes(length: number): Promise<string>;
  randomBytesSync(length: number): string;
  certificatePin(pem: string): Promise<string>;
  request(origin: string, pins: readonly string[], method: string, path: string, headers: Record<string, string>, body: string | null): Promise<{ status: number; headers: Record<string, string>; body: string }>;
  openSocket(id: string, origin: string, pins: readonly string[], token: string): Promise<void>;
  sendSocket(id: string, text: string): Promise<boolean>;
  closeSocket(id: string): Promise<void>;
  addListener(name: 'socket', listener: (event: NativeSocketEvent) => void): { remove(): void };
}
// Resolve lazily: importing pure orchestration never requires an Android bridge or silently falls back to fetch.
const native = (): NativeHubModule => requireNativeModule<NativeHubModule>('DudeHub');
async function identityCall<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'ERR_KEY_UNAVAILABLE') throw new MobileHubError('key-unavailable', 'The Android signing key is unavailable. Review a new pairing to repair this device.');
    throw new MobileHubError('invalid-pairing', 'The native identity proof could not be prepared.');
  }
}
export const androidSigner: MobileSigner = {
  prepareKey: scope => identityCall(() => native().prepareKey(scope.environmentId, scope.installId)),
  publicKey: ref => identityCall(() => native().publicKey(ref)),
  signEnrollment: (ref, hub, code, device) => identityCall(() => native().signEnrollment(ref, hub, code, device)),
  signChallenge: (ref, hub, nonce, device) => identityCall(() => native().signChallenge(ref, hub, nonce, device)),
  deleteKey: ref => identityCall(() => native().deleteKey(ref)),
  randomBytes: length => native().randomBytes(length),
};
export const androidCertificatePin = (pem: string): Promise<string> => native().certificatePin(pem);
/** Public CSPRNG bytes for UUIDv7 ids, never signing material. The native port enforces 1..128 bytes. */
export function androidRandomBytes(length: number): Uint8Array {
  const encoded = native().randomBytesSync(length);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (!Number.isInteger(length) || length < 1 || length > 128 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid native randomness.');
  const bytes: number[] = []; let bits = 0; let value = 0;
  for (const char of encoded) {
    value = (value << 6) | alphabet.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 255); }
  }
  if (bytes.length !== length) throw new Error('Native randomness has an invalid length.');
  return Uint8Array.from(bytes);
}
export function androidHubTransport(target: MobileHubTarget): HubTransport {
  return { request: async (req: HubRequest) => {
    try {
      const response = await native().request(target.hubUrl, target.pins, req.method, req.path, req.headers ?? {}, req.body === undefined ? null : JSON.stringify(req.body));
      return { ...response, body: JSON.parse(response.body) as unknown };
    } catch (error) {
      if (error instanceof Error && error.message.includes('tls-pin-mismatch')) throw new MobileHubError('pin-mismatch', 'The Hub certificate does not match its pinned identity.');
      throw new Error('The pinned Hub request could not be completed.');
    }
  } };
}
export interface MobileRealtimeSocket { send(text: string): Promise<boolean>; close(): Promise<void> }
export interface MobileRealtimePort {
  open(id: string, target: MobileHubTarget, token: string, listener: (event: NativeSocketEvent) => void): Promise<MobileRealtimeSocket>;
}
export const androidRealtime: MobileRealtimePort = {
  open: async (id, target, token, listener) => {
    const bridge = native();
    const subscription = bridge.addListener('socket', event => { if (event.id === id) listener(event); });
    try { await bridge.openSocket(id, target.hubUrl, target.pins, token); }
    catch (error) { subscription.remove(); throw error; }
    return { send: text => bridge.sendSocket(id, text), close: async () => { subscription.remove(); await bridge.closeSocket(id); } };
  },
};
