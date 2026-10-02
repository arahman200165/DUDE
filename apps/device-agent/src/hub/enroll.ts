import { sign } from 'node:crypto';
import { HubApiError, HubProtocolError, createHubClient } from '@dude/api-client';
import type { HubTransport } from '@dude/api-client';
import type { AgentHubEnrollError, AgentHubStatus } from '@dude/contracts';
import { DEVICE_CAPABILITIES, HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, enrollMessage, parsePairingString } from '@dude/contracts/hub';
import type { DeviceCapability, DeviceRegistryPlatform } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { getEnrollment, saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { createDeviceKey, loadDeviceKey } from '../native/device-key.js';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { HubManagerError } from './errors.js';
import type { HubConnectionManager, ManagedDevice } from './hub-client.js';
import { PIN_MISMATCH_CODE, createPinnedTransport } from './pinned-transport.js';
import type { PinnedTarget } from './pinned-transport.js';
import { probePin } from './probe.js';
import type { PinProbe } from './probe.js';

/** Store `DeviceCapabilities` booleans to the Hub vocabulary (documented in the contracts): `secureStorage` -> 'secure-storage'. */
const CAPABILITY_MAP: Readonly<Record<string, DeviceCapability>> = {
  desktop: 'desktop', filesystem: 'filesystem', processes: 'processes', secureStorage: 'secure-storage',
};

export function toHubCapabilities(capabilities: Record<string, boolean>): DeviceCapability[] {
  const out = new Set<DeviceCapability>();
  for (const [key, enabled] of Object.entries(capabilities)) {
    const mapped = CAPABILITY_MAP[key];
    if (enabled && mapped !== undefined && (DEVICE_CAPABILITIES as readonly string[]).includes(mapped)) out.add(mapped);
  }
  return [...out];
}

export interface EnrollDeps {
  db: Db;
  dpapi: DpapiPort;
  now: () => Date;
  device: () => ManagedDevice;
  manager: HubConnectionManager;
  /** Test seams. */
  probe?: (host: string, port: number, spki: string) => Promise<PinProbe>;
  createTransport?: (target: PinnedTarget) => HubTransport;
}

const fail = (code: AgentHubEnrollError, message: string): HubManagerError => new HubManagerError(code, message);
const isTls = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === PIN_MISMATCH_CODE || (typeof code === 'string' && /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_)/.test(code));
};

/** Pairs this device with a Hub from a `dude-pair:v1:...` string; on success the manager is started. */
export async function enrollDevice(pairingString: string, deps: EnrollDeps): Promise<AgentHubStatus> {
  const parsed = typeof pairingString === 'string' ? parsePairingString(pairingString) : null;
  if (parsed === null) throw fail('invalid-pairing-string', 'That is not a valid DUDE pairing string.');
  if (getEnrollment(deps.db) !== null) throw fail('already-enrolled', 'This device is already enrolled. Remove the enrollment first.');

  // 1. Pin check on a raw socket that carries no application bytes.
  let probe: PinProbe;
  try {
    probe = await (deps.probe ?? probePin)(parsed.host, parsed.port, parsed.spkiSha256);
  } catch (error) {
    throw fail('hub-unreachable', error instanceof Error ? error.message : 'The Hub could not be reached.');
  }
  if (!probe.matches) throw fail('tls-pin-mismatch', 'The Hub presented a different certificate than the pairing string pins. Nothing was sent.');

  // 2. Pinned channel: protocol compatibility.
  const target: PinnedTarget = { host: parsed.host, port: parsed.port, ca: [probe.certPem], pins: [parsed.spkiSha256] };
  const api = createHubClient((deps.createTransport ?? ((t) => createPinnedTransport(t)))(target), { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL });
  const hello = await guarded(() => api.hello());
  if (api.compatibility(hello) !== 'compatible') throw fail('incompatible', 'This Hub and this DUDE build speak incompatible protocol versions.');
  if (hello.tls.spkiSha256 !== parsed.spkiSha256) throw fail('tls-pin-mismatch', 'The Hub reports a different key than the pairing string pins.');

  // 3. Fresh device key, DPAPI-wrapped; sign the enrollment proof.
  const device = deps.device();
  let key: Awaited<ReturnType<typeof createDeviceKey>>;
  let signature: string;
  try {
    key = await createDeviceKey(deps.dpapi);
    const publicKeyB64 = Buffer.from(key.publicKeyRaw).toString('base64url');
    const privateKey = await loadDeviceKey(deps.dpapi, key.wrappedPrivateKey);
    const message = enrollMessage({ hubInstanceId: hello.hubInstanceId, pairingCode: parsed.code, deviceId: device.deviceId, publicKey: publicKeyB64 });
    signature = sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64url');
  } catch {
    throw fail('dpapi-unavailable', 'Windows data protection is not available, so a device key cannot be created on this account.');
  }

  // 4. Enroll.
  const response = await guarded(() => api.enroll({
    pairingCode: parsed.code,
    device: {
      deviceId: device.deviceId,
      displayName: device.displayName,
      platform: device.platform as DeviceRegistryPlatform,
      appVersion: device.appVersion || 'dev',
      protocolVersion: HUB_PROTOCOL_VERSION,
      capabilities: toHubCapabilities(device.capabilities),
    },
    publicKey: Buffer.from(key.publicKeyRaw).toString('base64url'),
    signature,
  }), true);

  saveEnrollment(deps.db, {
    hubInstanceId: response.hubInstanceId,
    environmentId: response.environmentId,
    hubUrl: `https://${parsed.host}:${parsed.port}`,
    protocolVersion: HUB_PROTOCOL_VERSION,
    spkiActive: parsed.spkiSha256,
    certActivePem: probe.certPem,
    keyId: response.keyId,
    publicKey: key.publicKeyRaw,
    wrappedPrivateKey: key.wrappedPrivateKey,
    enrolledAt: response.registeredAt,
  }, deps.now());
  deps.manager.start();
  return deps.manager.status();
}

async function guarded<T>(fn: () => Promise<T>, enrolling = false): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HubApiError) {
      if (enrolling) {
        if (error.status === 409) throw fail('conflict', error.message);
        throw fail('pairing-rejected', error.status === 401 ? 'The pairing code was not accepted. It may have expired or been used.' : error.message);
      }
      throw fail('hub-unreachable', error.message);
    }
    if (error instanceof HubProtocolError) throw fail('incompatible', 'The server did not answer like a DUDE Hub.');
    if (isTls(error)) throw fail('tls-pin-mismatch', 'The Hub certificate does not match the pairing string.');
    throw fail('hub-unreachable', error instanceof Error ? error.message : 'The Hub could not be reached.');
  }
}
