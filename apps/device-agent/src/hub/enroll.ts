import { sign } from 'node:crypto';
import { HubApiError, HubProtocolError, createHubClient } from '@dude/api-client';
import type { HubTransport } from '@dude/api-client';
import type { AgentHubEnrollError, AgentHubStatus } from '@dude/contracts';
import { DEVICE_CAPABILITIES, HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, enrollMessage, parsePairingString } from '@dude/contracts/hub';
import type { DeviceCapability, DeviceRegistryPlatform } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';
import { getEnrollment, saveEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { createDeviceKey, loadDeviceKey } from '../native/device-key.js';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { HubManagerError } from './errors.js';
import type { HubConnectionManager, ManagedDevice } from './hub-client.js';
import { PIN_MISMATCH_CODE, createPinnedTransport } from './pinned-transport.js';
import type { PinnedTarget } from './pinned-transport.js';
import { probePin } from './probe.js';
import type { PinProbe } from './probe.js';
import { getReconcileRequired, resetHubBookkeeping } from '../store/repos/sync-state.repo.js';
import { takeRecoverySnapshot } from '../sync/first-sync.js';

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

export interface ReconnectDeps extends EnrollDeps {
  /** Where the `reconnect-<ts>.db` recovery snapshot goes; without it no snapshot is taken. */
  backupDir?: string;
}

const fail = (code: AgentHubEnrollError, message: string): HubManagerError => new HubManagerError(code, message);
const isTls = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === PIN_MISMATCH_CODE || (typeof code === 'string' && /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_)/.test(code));
};

type ParsedPairing = NonNullable<ReturnType<typeof parsePairingString>>;

function parseOrFail(pairingString: string): ParsedPairing {
  const parsed = typeof pairingString === 'string' ? parsePairingString(pairingString) : null;
  if (parsed === null) throw fail('invalid-pairing-string', 'That is not a valid DUDE pairing string.');
  return parsed;
}

/** Everything the pairing steps produce before anything is sent that consumes the code or written locally. */
interface PreparedPairing {
  parsed: ParsedPairing;
  probe: PinProbe;
  api: ReturnType<typeof createHubClient>;
  hello: Awaited<ReturnType<ReturnType<typeof createHubClient>['hello']>>;
  device: ManagedDevice;
  key: Awaited<ReturnType<typeof createDeviceKey>>;
  signature: string;
}

/** Shared by enrolling and reconnecting: pin probe, protocol compatibility, a fresh device key and the signed enrollment proof. Nothing local changes. */
async function preparePairing(parsed: ParsedPairing, deps: EnrollDeps): Promise<PreparedPairing> {
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
  return { parsed, probe, api, hello, device, key, signature };
}

type EnrollResponse = Awaited<ReturnType<ReturnType<typeof createHubClient>['enroll']>>;

/** Step 4: presents the proof; the Hub consumes the pairing code (and, for a re-attach code, attaches the key to the existing device row). */
function submitPairing(prepared: PreparedPairing): Promise<EnrollResponse> {
  const { parsed, api, device, key, signature } = prepared;
  return guarded(() => api.enroll({
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
}

/** One transaction: the enrollment row is replaced and the Hub bookkeeping reset; entities and the outbox are never deleted. */
function commitPairing(prepared: PreparedPairing, response: EnrollResponse, deps: EnrollDeps): void {
  const { parsed, probe, key, hello } = prepared;
  transaction(deps.db, () => {
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
      authorityEpoch: hello.authorityEpoch ?? 1,
    }, deps.now());
    // Revisions, bases and the cursor belonged to any previous enrollment; the first sync preview runs again for this one.
    resetHubBookkeeping(deps.db);
  });
}

/** Pairs this device with a Hub from a `dude-pair:v1:...` string; on success the manager is started. */
export async function enrollDevice(pairingString: string, deps: EnrollDeps): Promise<AgentHubStatus> {
  const parsed = parseOrFail(pairingString);
  if (getEnrollment(deps.db) !== null) throw fail('already-enrolled', 'This device is already enrolled. Remove the enrollment first.');
  const prepared = await preparePairing(parsed, deps);
  commitPairing(prepared, await submitPairing(prepared), deps);
  deps.manager.start();
  return deps.manager.status();
}

/** Connection states in which the device cannot talk to its Hub as enrolled: reconnecting is the way out (never re-key a healthy enrollment). */
const RECONNECTABLE_STATES: ReadonlySet<AgentHubStatus['state']> = new Set(['authority-changed', 'untrusted-tls', 'revoked', 'incompatible']);

/**
 * Reconnects an ENROLLED device to a changed Hub (PD-073) with a new pairing code, keeping its device id, data and outbox.
 * Allowed only while the connection is blocked (authority changed, certificate untrusted, revoked, incompatible, or the
 * persisted reconcile flag is set). Order: everything that can fail without side effects first (pin probe, compatibility, key,
 * signature); then stop the connection loop, take a recovery snapshot, present the proof, and replace the enrollment and
 * reset the Hub bookkeeping in one transaction. A failure after the loop stopped restarts it so the device returns to its
 * previous (blocked) state, with nothing local changed.
 */
export async function reconnectDevice(pairingString: string, deps: ReconnectDeps): Promise<AgentHubStatus> {
  const parsed = parseOrFail(pairingString);
  const enrollment = getEnrollment(deps.db);
  if (enrollment === null) throw fail('not-enrolled', 'This device is not enrolled with a Hub, so there is nothing to reconnect. Pair it instead.');
  if (!RECONNECTABLE_STATES.has(deps.manager.status().state) && enrollment.state !== 'revoked' && getReconcileRequired(deps.db) === null) {
    throw fail('not-reconnectable', 'This device is connected to its Hub as expected, so there is nothing to reconnect.');
  }
  const prepared = await preparePairing(parsed, deps);

  deps.manager.stop();
  try {
    if (deps.backupDir) {
      try {
        takeRecoverySnapshot(deps.db, deps.backupDir, deps.now(), 'reconnect');
      } catch {
        throw fail('snapshot-failed', 'A recovery snapshot could not be taken, so nothing was changed. Free some disk space and try again.');
      }
    }
    commitPairing(prepared, await submitPairing(prepared), deps);
  } catch (error) {
    deps.manager.start();
    throw error;
  }
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
