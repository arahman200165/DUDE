import { createHubClient, HubApiError } from '@dude/api-client';
import { EnrollDevice, EnrollRequest, HUB_PROTOCOL_VERSION, HUB_SYNC_MIN_PROTOCOL, parsePairingString } from '@dude/contracts/hub';
import { Value } from 'typebox/value';
import { MobileHubError, type MobileEnrollmentAttempt, type MobileHubEnrollment, type MobileHubPorts } from './types';
import { authenticateMobileDevice } from './session';
import { checkHello, verifyHelloPins } from './trust';

export function reviewMobilePairing(pairingString: string, displayName: string): { hubUrl: string; pin: string; displayName: string } {
  const parsed = parsePairingString(pairingString);
  const name = displayName.trim();
  if (!parsed || !name || name.length > 64) throw new MobileHubError('invalid-pairing', 'Enter a valid pairing string and a device name of 1–64 characters.');
  return { hubUrl: `https://${parsed.host}:${parsed.port}`, pin: parsed.spkiSha256, displayName: name };
}
export interface MobileEnrollmentDependencies extends MobileHubPorts {
  readonly installId: string;
  readonly deviceId: string;
  readonly appVersion: string;
  /** Explicit caller-owned recovery snapshot; must retain the device id, local records and outbox. No hidden reset occurs here. */
  readonly beforeReconnect?: (previous: MobileHubEnrollment) => Promise<void>;
  readonly onReconnected?: (previous: MobileHubEnrollment, next: MobileHubEnrollment) => Promise<void>;
}
export class MobileEnrollmentService {
  private busy = false;
  constructor(private readonly deps: MobileEnrollmentDependencies) {}
  async connect(input: { pairingString: string; displayName: string; acknowledged: true }, mode: 'enroll' | 'reconnect' = 'enroll'): Promise<MobileHubEnrollment> {
    if (this.busy) throw new MobileHubError('pending-attempt', 'A connection attempt is already running.');
    this.busy = true;
    try { return await this.connectOnce(input, mode); } finally { this.busy = false; }
  }
  private async connectOnce(input: { pairingString: string; displayName: string; acknowledged: true }, mode: 'enroll' | 'reconnect'): Promise<MobileHubEnrollment> {
    if (input.acknowledged !== true) throw new MobileHubError('invalid-pairing', 'Review the Hub endpoint and certificate pin before connecting.');
    const reviewed = reviewMobilePairing(input.pairingString, input.displayName);
    const parsed = parsePairingString(input.pairingString)!;
    const previous = await this.deps.persistence.readEnrollment();
    if (await this.deps.persistence.readPendingAttempt()) throw new MobileHubError('pending-attempt', 'Recover the pending registration before starting another attempt.');
    if (mode === 'enroll' && previous) throw new MobileHubError('already-enrolled', 'Use the explicit reconnect flow for an enrolled device.');
    if (mode === 'reconnect' && !previous) throw new MobileHubError('not-enrolled', 'There is no existing enrollment to reconnect.');
    if (previous && previous.deviceId !== this.deps.deviceId) throw new MobileHubError('invalid-pairing', 'Reconnect must preserve the existing device identity.');
    const target = { hubUrl: reviewed.hubUrl, pins: [reviewed.pin] };
    const api = createHubClient(this.deps.transport(target), { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_SYNC_MIN_PROTOCOL });
    const hello = await api.hello();
    const authorityEpoch = checkHello(hello);
    if (![hello.tls.spkiSha256, hello.tls.nextSpkiSha256, ...(hello.tls.proxySpkiSha256 ?? [])].includes(reviewed.pin)) throw new MobileHubError('pin-mismatch', 'The pairing pin disagrees with the pinned Hub hello.');
    const pins = await verifyHelloPins(api, hello, this.deps.certificatePin);
    const device = { deviceId: this.deps.deviceId, displayName: reviewed.displayName, platform: 'android' as const, appVersion: this.deps.appVersion, protocolVersion: HUB_PROTOCOL_VERSION, capabilities: ['secure-storage' as const] };
    if (!Value.Check(EnrollDevice, device)) throw new MobileHubError('invalid-pairing', 'The local device identity does not satisfy the Hub enrollment contract.');
    if (previous) {
      if (!this.deps.beforeReconnect || !this.deps.onReconnected) throw new Error('Reconnect requires explicit data-preserving lifecycle callbacks.');
      await this.deps.beforeReconnect(previous);
    }
    const keyRef = await this.deps.signer.prepareKey({ environmentId: hello.environmentId!, installId: this.deps.installId });
    let attemptSaved = false;
    let submitted = false;
    try {
      const publicKey = await this.deps.signer.publicKey(keyRef);
      const signature = await this.deps.signer.signEnrollment(keyRef, hello.hubInstanceId, parsed.code, device.deviceId);
      const body = { pairingCode: parsed.code, device, publicKey, signature };
      if (!Value.Check(EnrollRequest, body)) throw new MobileHubError('invalid-pairing', 'The native enrollment proof does not satisfy the Hub contract.');
      const attempt: MobileEnrollmentAttempt = { ...target, ...pins, deviceId: device.deviceId, displayName: reviewed.displayName, environmentId: hello.environmentId!, hubInstanceId: hello.hubInstanceId, authorityEpoch, keyRef, publicKey, mode, createdAt: new Date((this.deps.now ?? Date.now)()).toISOString() };
      await this.deps.persistence.savePendingAttempt(attempt);
      attemptSaved = true;
      submitted = true;
      const result = await api.enroll(body);
      if (result.deviceId !== attempt.deviceId || result.environmentId !== attempt.environmentId || result.hubInstanceId !== attempt.hubInstanceId) throw new MobileHubError('authority-changed', 'The enrollment acknowledgement belongs to a different authority.');
      const enrollment = this.enrollment(attempt, result.keyId, result.registeredAt);
      await this.deps.persistence.commitEnrollment(enrollment);
      if (previous) await this.deps.onReconnected!(previous, enrollment);
      return enrollment;
    } catch (error) {
      // A transport or local commit failure is ambiguous: retain the durable receipt and native key for recovery.
      if (!submitted || (error instanceof HubApiError && error.status >= 400 && error.status < 500)) {
        if (attemptSaved) await this.deps.persistence.clearPendingAttempt();
        await this.deps.signer.deleteKey(keyRef);
      }
      throw error;
    }
  }
  /** Restart recovery never re-consumes a code. It proves the SAME saved key and checks deviceSelf. */
  async recoverPending(): Promise<MobileHubEnrollment | null> {
    if (this.busy) throw new MobileHubError('pending-attempt', 'A connection attempt is already running.');
    this.busy = true;
    try {
      const attempt = await this.deps.persistence.readPendingAttempt();
      if (!attempt) return null;
      let fresh: Awaited<ReturnType<typeof authenticateMobileDevice>>;
      try { fresh = await authenticateMobileDevice(this.deps, attempt); }
      catch (error) {
        if (error instanceof MobileHubError && error.code === 'key-rejected') {
          throw new MobileHubError('pairing-input-required', 'The Hub did not confirm the pending key. Retry recovery or explicitly discard this attempt before pairing again.');
        }
        throw error;
      }
      const self = await fresh.api.deviceSelf(fresh.accessToken);
      if (self.deviceId !== attempt.deviceId || self.platform !== 'android' || self.kind !== 'desktop' || self.recoveryTrusted || self.revokedAt || self.unenrolledAt || self.needsRePair) throw new MobileHubError('pairing-input-required', 'The Hub did not confirm an active Android registration for this key.');
      const previous = await this.deps.persistence.readEnrollment();
      const enrollment = { ...this.enrollment(attempt, null, self.registeredAt), ...fresh.pins, authorityEpoch: fresh.epoch };
      await this.deps.persistence.commitEnrollment(enrollment);
      if (attempt.mode === 'reconnect' && previous) {
        if (!this.deps.onReconnected) throw new Error('Reconnect requires an explicit data-preserving lifecycle callback.');
        await this.deps.onReconnected(previous, enrollment);
      }
      return enrollment;
    } finally { this.busy = false; }
  }
  private enrollment(attempt: MobileEnrollmentAttempt, keyId: string | null, registeredAt: string): MobileHubEnrollment {
    const { displayName: _displayName, mode: _mode, createdAt: _createdAt, ...identity } = attempt;
    return { ...identity, keyId, registeredAt };
  }
  /** Caller must present an explicit discard action. No code replay or hidden identity replacement. */
  async discardPendingAttempt(): Promise<void> {
    if (this.busy) throw new MobileHubError('pending-attempt', 'A connection attempt is running.');
    this.busy = true;
    try {
      const attempt = await this.deps.persistence.readPendingAttempt();
      if (!attempt) return;
      await this.deps.signer.deleteKey(attempt.keyRef);
      await this.deps.persistence.clearPendingAttempt();
    } finally { this.busy = false; }
  }
}
