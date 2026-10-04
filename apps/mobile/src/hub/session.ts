import { createHubClient, HubApiError, type HubClient } from '@dude/api-client';
import { DEVICE_TOKEN_TTL_MS, HUB_PROTOCOL_VERSION, HUB_SYNC_MIN_PROTOCOL } from '@dude/contracts/hub';
import { checkHello, verifyHelloPins, type VerifiedPins } from './trust';
import { MobileHubError, type MobileEnrollmentAttempt, type MobileHubEnrollment, type MobileHubPorts } from './types';

const authRejected = (error: unknown): error is HubApiError => error instanceof HubApiError && (error.status === 401 || error.status === 403);
export function mobileApi(ports: MobileHubPorts, target: MobileHubEnrollment | MobileEnrollmentAttempt): HubClient {
  return createHubClient(ports.transport(target), { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_SYNC_MIN_PROTOCOL });
}
export async function authenticateMobileDevice(ports: MobileHubPorts, enrollment: MobileHubEnrollment | MobileEnrollmentAttempt): Promise<{ api: HubClient; accessToken: string; expiresAt: number; epoch: number; pins: VerifiedPins }> {
  const api = mobileApi(ports, enrollment);
  const hello = await api.hello();
  const epoch = checkHello(hello, enrollment);
  const pins = await verifyHelloPins(api, hello, ports.certificatePin);
  const now = (ports.now ?? Date.now)();
  let token: Awaited<ReturnType<HubClient['deviceToken']>> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const challenge = await api.deviceChallenge(enrollment.deviceId);
    if (!Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= (ports.now ?? Date.now)()) {
      if (attempt === 0) continue;
      throw new MobileHubError('key-rejected', 'The device challenge expired. Retry when this app is active.');
    }
    const signature = await ports.signer.signChallenge(enrollment.keyRef, enrollment.hubInstanceId, challenge.nonce, enrollment.deviceId);
    try { token = await api.deviceToken({ deviceId: enrollment.deviceId, nonce: challenge.nonce, signature }); break; }
    catch (error) {
      if (!authRejected(error)) throw error;
      if (attempt === 1) throw new MobileHubError('key-rejected', 'The Hub could not authenticate this key. Retry or review a new pairing.');
      // A challenge can expire while Android is backgrounded, or its successful response can be lost. Retry a fresh proof.
      checkHello(await api.hello(), enrollment);
    }
  }
  if (!token) throw new MobileHubError('key-rejected', 'The device could not be authenticated.');
  if ((token.authorityEpoch ?? epoch) !== epoch) throw new MobileHubError('authority-changed', 'The Hub token authority changed.');
  const expiresAt = Math.min(Date.parse(token.expiresAt), now + DEVICE_TOKEN_TTL_MS);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new Error('The Hub returned an expired token.');
  return { api, accessToken: token.accessToken, expiresAt, epoch: Math.max(epoch, token.authorityEpoch ?? epoch), pins };
}

/** Token exists only in memory. Concurrent callers share one challenge; expiry alone never marks a device revoked. */
export class MobileDeviceSession {
  private cached: { accessToken: string; expiresAt: number } | null = null;
  private flight: Promise<string> | null = null;
  private generation = 0;
  private stopped = false;
  constructor(private readonly ports: MobileHubPorts, private enrollment: MobileHubEnrollment) {}
  getEnrollment(): MobileHubEnrollment { return this.enrollment; }
  async refreshTrust(): Promise<MobileHubEnrollment> {
    if (this.stopped) throw new Error('Device session is closed.');
    const generation = this.generation;
    const api = mobileApi(this.ports, this.enrollment);
    const hello = await api.hello();
    const authorityEpoch = checkHello(hello, this.enrollment);
    const pins = await verifyHelloPins(api, hello, this.ports.certificatePin);
    if (generation !== this.generation) throw new Error('Device session changed.');
    const updated = { ...this.enrollment, ...pins, authorityEpoch };
    await this.ports.persistence.saveEnrollment(updated);
    if (generation !== this.generation) throw new Error('Device session changed.');
    this.enrollment = updated;
    return updated;
  }
  clear(): void { this.generation++; this.stopped = true; this.cached = null; this.flight = null; }
  async token(force = false): Promise<string> {
    if (this.stopped) throw new Error('Device session is closed.');
    if (!force && this.cached && this.cached.expiresAt > (this.ports.now ?? Date.now)() + 30_000) return this.cached.accessToken;
    if (this.flight) return this.flight;
    const generation = this.generation;
    const pending = (async () => {
      const fresh = await authenticateMobileDevice(this.ports, this.enrollment);
      if (generation !== this.generation) throw new Error('Device session changed.');
      const updated = { ...this.enrollment, ...fresh.pins, authorityEpoch: fresh.epoch };
      await this.ports.persistence.saveEnrollment(updated);
      if (generation !== this.generation) throw new Error('Device session changed.');
      this.enrollment = updated;
      this.cached = { accessToken: fresh.accessToken, expiresAt: fresh.expiresAt };
      return fresh.accessToken;
    })();
    this.flight = pending;
    try { return await pending; } finally { if (this.flight === pending) this.flight = null; }
  }
  async withToken<T>(fn: (api: HubClient, token: string) => Promise<T>): Promise<T> {
    let token = await this.token();
    try { return await fn(mobileApi(this.ports, this.enrollment), token); }
    catch (error) {
      if (!authRejected(error)) throw error;
      if (this.cached?.accessToken === token) this.cached = null;
      // A stale/expired token is repaired with a fresh signed challenge. This rechecks authority before any proof.
      token = await this.token(this.cached === null || this.cached.accessToken === token);
      // A second endpoint 401 is surfaced as an endpoint/session failure; it is not itself proof of revocation.
      return fn(mobileApi(this.ports, this.enrollment), token);
    }
  }
}
