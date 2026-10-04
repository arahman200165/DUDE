import { HUB_PROTOCOL_VERSION, HUB_SYNC_MIN_PROTOCOL, REALTIME_HEARTBEAT_INTERVAL_MS, REALTIME_IDLE_TIMEOUT_MS, REALTIME_CLOSE_CODES, RealtimeServerMessage, type RealtimeClientMessage } from '@dude/contracts/hub';
import { Value } from 'typebox/value';
import type { MobileRealtimePort, MobileRealtimeSocket, NativeSocketEvent } from './native';
import { MobileDeviceSession } from './session';
import { MobileHubError } from './types';

/** Realtime invalidates caches/signals only. Record synchronization remains the sync adapter's responsibility. */
export class MobileHubRealtime {
  private socket: MobileRealtimeSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastMessage = 0;
  private queue = Promise.resolve();
  private generation = 0;
  private welcome = false;
  constructor(private readonly session: MobileDeviceSession, private readonly port: MobileRealtimePort, private readonly events: {
    readonly onEvent: (event: Extract<RealtimeServerMessage, { type: 'event' }>) => void;
    readonly onFailure: (error: unknown) => void;
    readonly onWelcome?: () => void;
    readonly now?: () => number;
  }) {}
  async start(socketId: string): Promise<void> {
    await this.stop();
    const generation = this.generation;
    const token = await this.session.token();
    if (generation !== this.generation) return;
    let opening = true;
    const early: NativeSocketEvent[] = [];
    const receive = (event: NativeSocketEvent) => {
      if (opening) { early.push(event); return; }
      this.queue = this.queue.then(async () => { if (generation === this.generation) await this.receive(event); }).catch(error => { if (generation === this.generation) { this.events.onFailure(error); void this.stop(); } });
    };
    const socket = await this.port.open(socketId, this.session.getEnrollment(), token, receive);
    if (generation !== this.generation) { await socket.close(); return; }
    this.socket = socket;
    opening = false;
    early.forEach(receive);
  }
  async stop(): Promise<void> {
    this.generation++;
    this.welcome = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const socket = this.socket; this.socket = null;
    if (socket) await socket.close();
  }
  private async send(message: RealtimeClientMessage): Promise<void> {
    if (!this.socket || !await this.socket.send(JSON.stringify(message))) throw new Error('The realtime channel is closed.');
  }
  private async receive(event: NativeSocketEvent): Promise<void> {
    if (event.kind === 'open') {
      this.lastMessage = (this.events.now ?? Date.now)();
      await this.send({ type: 'hello', protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_SYNC_MIN_PROTOCOL });
      this.heartbeat = setInterval(() => {
        if ((this.events.now ?? Date.now)() - this.lastMessage > REALTIME_IDLE_TIMEOUT_MS || !this.welcome) {
          this.events.onFailure(new Error('The Hub realtime channel timed out.')); void this.stop();
        } else void this.send({ type: 'heartbeat' }).catch(error => { this.events.onFailure(error); void this.stop(); });
      }, REALTIME_HEARTBEAT_INTERVAL_MS);
      return;
    }
    if (event.kind === 'failure' || event.kind === 'close') {
      if (event.code === REALTIME_CLOSE_CODES.transferred) throw new MobileHubError('authority-changed', 'The Hub transferred its authority.');
      if (event.code === REALTIME_CLOSE_CODES.revoked) {
        await this.session.refreshTrust();
        throw new MobileHubError('revoked', 'The authenticated Hub realtime channel confirmed this device was revoked.');
      }
      if (event.code === 401 || event.code === 403 || event.code === REALTIME_CLOSE_CODES.unauthorized || event.code === REALTIME_CLOSE_CODES.revoked) {
        // Expiry and revocation share a close path: a new challenge under a checked authority distinguishes them.
        await this.session.token(true);
        await this.session.withToken((api, token) => api.deviceSelf(token));
      }
      throw new Error(event.error ?? 'The Hub realtime connection closed.');
    }
    if (!event.text) throw new Error('Missing realtime JSON.');
    const message: unknown = JSON.parse(event.text);
    if (!Value.Check(RealtimeServerMessage, message)) throw new Error('The Hub realtime message failed contract validation.');
    this.lastMessage = (this.events.now ?? Date.now)();
    if (message.type === 'error') throw new Error(`Hub realtime error: ${message.code}`);
    if (message.type === 'welcome') {
      if (this.welcome || message.sessionKind !== 'device' || message.deviceId !== this.session.getEnrollment().deviceId || message.protocolVersion < HUB_SYNC_MIN_PROTOCOL) throw new Error('Unexpected realtime welcome.');
      const enrollment = await this.session.refreshTrust();
      if ((message.authorityEpoch ?? enrollment.authorityEpoch) !== enrollment.authorityEpoch) throw new MobileHubError('authority-changed', 'The realtime authority changed.');
      if (message.tls.spkiSha256 !== enrollment.spkiActive || message.tls.nextSpkiSha256 !== enrollment.spkiNext || (message.tls.proxySpkiSha256 ?? []).some(pin => !enrollment.proxySpkis.includes(pin))) throw new MobileHubError('pin-mismatch', 'Realtime pin announcements disagree with the checked hello.');
      // refreshTrust durably saves every verified pin BEFORE this acknowledgement.
      if (enrollment.spkiNext) await this.send({ type: 'tls-pin-ack', spkiSha256: enrollment.spkiNext });
      for (const pin of enrollment.proxySpkis) await this.send({ type: 'tls-pin-ack', spkiSha256: pin });
      this.welcome = true;
      this.events.onWelcome?.();
      return;
    }
    if (!this.welcome) throw new Error('Realtime event arrived before welcome.');
    if (message.event === 'tls-next-pin') {
      const enrollment = await this.session.refreshTrust();
      const announced = message.data['spkiSha256'];
      if (typeof announced !== 'string' || (announced !== enrollment.spkiNext && !enrollment.proxySpkis.includes(announced))) throw new MobileHubError('pin-mismatch', 'The announced pin was not verified and persisted.');
      await this.send({ type: 'tls-pin-ack', spkiSha256: announced });
    }
    if (message.event === 'device-revoked' && message.data['deviceId'] === this.session.getEnrollment().deviceId) {
      await this.session.refreshTrust();
      throw new MobileHubError('revoked', 'The authenticated Hub confirmed this device was revoked.');
    }
    this.events.onEvent(message);
  }
}
