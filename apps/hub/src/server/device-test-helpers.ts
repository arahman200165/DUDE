import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { deviceAuthMessage, enrollMessage } from '@dude/contracts/hub';
import type { AuthHub, ApiResult, Signed } from './auth-test-helpers.js';

export interface SimDevice {
  deviceId: string;
  publicKey: string;
  privateKey: KeyObject;
  sign(message: string): string;
}

/** A simulated device: a fresh Ed25519 key pair and a UUID. */
export function newDevice(deviceId: string = randomUUID()): SimDevice {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const x = (publicKey.export({ format: 'jwk' }) as { x: string }).x;
  return { deviceId, publicKey: x, privateKey, sign: (message) => sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64url') };
}

export const deviceMeta = (deviceId: string, over: Record<string, unknown> = {}) => ({
  deviceId, displayName: 'Test laptop', platform: 'windows', appVersion: '1.2.3', protocolVersion: 1, capabilities: ['desktop', 'filesystem'], ...over,
});

export async function createPairingCode(h: AuthHub, owner: Signed, host?: string): Promise<ApiResult> {
  return h.call('POST', '/pairing-codes', { cookie: owner.cookie, csrf: owner.csrf, body: host === undefined ? {} : { host } });
}

export interface EnrollOptions { code: string; hubInstanceId?: string; meta?: Record<string, unknown>; signWith?: SimDevice; publicKey?: string; headers?: Record<string, string>; origin?: boolean }

/** Enrolls like the Desktop Agent: no Origin, no cookies. */
export function enroll(h: AuthHub, device: SimDevice, options: EnrollOptions): Promise<ApiResult> {
  const hubInstanceId = options.hubInstanceId ?? h.hub.hub.hubInstanceId;
  const publicKey = options.publicKey ?? device.publicKey;
  const signer = options.signWith ?? device;
  const signature = signer.sign(enrollMessage({ hubInstanceId, pairingCode: options.code, deviceId: device.deviceId, publicKey }));
  return h.call('POST', '/devices/enroll', {
    noOrigin: options.origin !== true,
    ...(options.headers ? { headers: options.headers } : {}),
    body: { pairingCode: options.code, device: deviceMeta(device.deviceId, options.meta), publicKey, signature },
  });
}

/** Challenge, sign and exchange for a `ddt_` token. */
export async function deviceToken(h: AuthHub, device: SimDevice): Promise<{ token: string; res: ApiResult }> {
  const challenge = await h.call('POST', '/auth/device/challenge', { noOrigin: true, body: { deviceId: device.deviceId } });
  if (challenge.status !== 200) throw new Error(`challenge failed: ${challenge.status}`);
  const nonce = challenge.json.nonce as string;
  const signature = device.sign(deviceAuthMessage({ hubInstanceId: h.hub.hub.hubInstanceId, nonce, deviceId: device.deviceId }));
  const res = await h.call('POST', '/auth/device/token', { noOrigin: true, body: { deviceId: device.deviceId, nonce, signature } });
  return { token: (res.json?.accessToken as string | undefined) ?? '', res };
}

/** Pairing code, enroll and token for a new device. */
export async function enrolled(h: AuthHub, owner: Signed, device: SimDevice = newDevice()): Promise<{ device: SimDevice; token: string; enroll: ApiResult }> {
  const code = (await createPairingCode(h, owner)).json.pairingCode as string;
  const result = await enroll(h, device, { code });
  if (result.status !== 200) throw new Error(`enroll failed: ${result.status} ${result.raw.body}`);
  return { device, token: (await deviceToken(h, device)).token, enroll: result };
}
