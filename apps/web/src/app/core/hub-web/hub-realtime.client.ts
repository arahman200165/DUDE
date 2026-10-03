import type { SyncRecord } from '@dude/contracts/hub';
import { HUB_REALTIME_PATH, REALTIME_CLOSE_CODES } from '@dude/contracts/hub';
import { RecordBook, categoryOf, toAppliedChange, type AppliedChangeShape } from '@dude/sync';
import type { HubWebEngine } from './hub-web-engine';
import { classifyHubError, type HubWebAccess } from './hub-web.types';

/** The part of `WebSocket` this client uses, so tests can drive it without a network. */
export interface HubSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

export interface HubRealtimeDeps {
  readonly engine: Pick<HubWebEngine, 'book' | 'client' | 'connection'>;
  readonly access: HubWebAccess;
  /** Hub revision the browser's state is current to (snapshot `asOfRevision`). */
  readonly cursor: number;
  /** `RemoteChangesService.apply`: updates open collections and signals, never commits. */
  readonly apply: (changes: AppliedChangeShape[]) => void;
  /** Reads the whole snapshot again (cursor expired). */
  readonly snapshot: () => Promise<{ records: SyncRecord[]; cursor: number }>;
  readonly openSocket?: (url: string) => HubSocketLike;
  readonly socketUrl?: () => string;
  /** Sends the visitor to sign-in with the current URL as `returnUrl`; nothing is wiped (PD-053). */
  readonly goToSignIn: () => void;
  /** Reloads the page (web access changed: collections are chosen at boot). */
  readonly reload: () => void;
  readonly isVisible?: () => boolean;
  readonly now?: () => number;
  /** A pull of the change feed started (true) or ended (false); feeds the Sync status "syncing" state. */
  readonly onPulling?: (pulling: boolean) => void;
  /** A pull completed: the browser's cursor and the Hub head it saw (feeds the Sync status). */
  readonly onProgress?: (progress: { cursor: number; head: number | null }) => void;
}

export const BACKOFF_MIN_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;
export const POLL_MS = 15_000;
export const STATE_REPORT_MS = 30_000;
const PAGE = 500;
const FAILURES_BEFORE_UNREACHABLE = 3;

/**
 * The Hub web's live link (PD-054). One authenticated WebSocket delivers `changes-available`; each nudge pulls the
 * change feed from the browser's cursor and hands the records to the same applier the desktop uses. When the socket is
 * down the tab polls the feed every 15 s while visible and reconnects with exponential backoff (1 s to 30 s).
 * Records at or below a revision already known (this browser's own pushes, replays) are skipped.
 */
export class HubRealtimeClient {
  private cursor: number;
  private socket: HubSocketLike | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private backoff = BACKOFF_MIN_MS;
  private failures = 0;
  /** True between a `welcome` and the socket closing: the live link is up. */
  private welcomed = false;
  private pulling = false;
  private pullAgain = false;
  private stopped = false;
  private lastReport = 0;
  private reportTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisible = (): void => {
    if (this.visible()) void this.pull();
  };

  constructor(private readonly deps: HubRealtimeDeps) {
    this.cursor = deps.cursor;
  }

  get currentCursor(): number {
    return this.cursor;
  }

  start(): void {
    this.stopped = false;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    this.closeSocket();
    this.clearTimers();
  }

  private get book(): RecordBook {
    return this.deps.engine.book;
  }

  private visible(): boolean {
    return this.deps.isVisible ? this.deps.isVisible() : typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  private url(): string {
    if (this.deps.socketUrl) return this.deps.socketUrl();
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${HUB_REALTIME_PATH}`;
  }

  // --- socket ---------------------------------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;
    let socket: HubSocketLike;
    try {
      socket = this.deps.openSocket ? this.deps.openSocket(this.url()) : (new WebSocket(this.url()) as unknown as HubSocketLike);
    } catch {
      this.socketDown();
      return;
    }
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 }));
    socket.onmessage = (event) => this.onMessage(socket, event.data);
    socket.onerror = () => undefined;
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.onClose(event.code);
    };
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (socket) {
      socket.onclose = null;
      try {
        socket.close(1000);
      } catch {
        // already closed
      }
    }
  }

  private onMessage(socket: HubSocketLike, data: unknown): void {
    let message: { type?: string; event?: string; data?: Record<string, unknown>; heartbeatIntervalMs?: number; code?: string };
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message.type === 'welcome') {
      this.welcomed = true;
      this.backoff = BACKOFF_MIN_MS;
      this.failures = 0;
      this.stopPolling();
      this.deps.engine.connection.set('live');
      const every = message.heartbeatIntervalMs && message.heartbeatIntervalMs > 0 ? message.heartbeatIntervalMs : 25_000;
      this.heartbeat = setInterval(() => {
        try {
          socket.send(JSON.stringify({ type: 'heartbeat' }));
        } catch {
          // the close handler takes over
        }
      }, every);
      void this.pull();
      return;
    }
    if (message.type === 'error') {
      if (message.code === 'unsupported-protocol') this.deps.engine.connection.set('incompatible');
      return;
    }
    if (message.type !== 'event') return;
    switch (message.event) {
      case 'changes-available': {
        const revision = message.data?.['revision'];
        if (typeof revision !== 'number' || revision > this.cursor) void this.pull();
        return;
      }
      case 'web-access-changed':
        void this.checkAccess();
        return;
      case 'session-revoked':
      case 'owner-recovered':
        this.expire();
        return;
      default:
        return; // device-registry-changed, tls-next-pin, device-revoked: nothing for the browser to do
    }
  }

  private onClose(code: number): void {
    this.welcomed = false;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (code === REALTIME_CLOSE_CODES.unauthorized || code === REALTIME_CLOSE_CODES.revoked) {
      this.expire();
      return;
    }
    if (code === REALTIME_CLOSE_CODES.unsupportedProtocol) {
      this.deps.engine.connection.set('incompatible');
      return;
    }
    this.socketDown();
  }

  private socketDown(): void {
    if (this.stopped) return;
    this.failures++;
    this.deps.engine.connection.set(this.failures >= FAILURES_BEFORE_UNREACHABLE ? 'unreachable' : 'reconnecting');
    this.startPolling();
    if (this.reconnectTimer !== null) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startPolling(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => {
      if (this.visible()) void this.pull(true);
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.reportTimer !== null) clearTimeout(this.reportTimer);
    this.reportTimer = null;
    this.stopPolling();
  }

  /** The session is gone (revoked, owner recovered, 401): lock writes and go to sign-in; local state is not wiped. */
  private expire(): void {
    if (this.stopped) return;
    this.deps.engine.connection.set('session-expired');
    this.stop();
    this.deps.goToSignIn();
  }

  // --- pulling --------------------------------------------------------------------------------------------------

  /** Pulls the change feed from the cursor to the head. Calls while a pull runs are folded into one follow-up pull. */
  async pull(polling = false): Promise<void> {
    if (this.stopped) return;
    if (this.pulling) {
      this.pullAgain = true;
      return;
    }
    this.pulling = true;
    this.deps.onPulling?.(true);
    try {
      do {
        this.pullAgain = false;
        await this.pullOnce(polling);
      } while (this.pullAgain && !this.stopped);
    } finally {
      this.pulling = false;
      this.deps.onPulling?.(false);
    }
  }

  private async pullOnce(polling: boolean): Promise<void> {
    for (;;) {
      let response;
      try {
        response = await this.deps.engine.client.webChanges(this.cursor, PAGE);
      } catch (error) {
        const { kind } = classifyHubError(error);
        if (kind === 'unauthorized') this.expire();
        else if (kind === 'cursor-expired') await this.resnapshot();
        else if (kind === 'incompatible') this.deps.engine.connection.set('incompatible');
        else if (!this.welcomed) this.deps.engine.connection.set(this.failures >= FAILURES_BEFORE_UNREACHABLE ? 'unreachable' : 'reconnecting');
        return;
      }
      // A successful HTTP answer while the socket is down: writes work, and so does the feed.
      if (polling && !this.welcomed) {
        this.failures = 0;
        this.deps.engine.connection.set('live');
      }
      this.deliver(response.changes);
      this.cursor = Math.max(this.cursor, response.cursor);
      this.deps.onProgress?.({ cursor: this.cursor, head: response.headRevision ?? null });
      if (!response.hasMore) break;
    }
    this.reportState();
  }

  private allowed(record: SyncRecord): boolean {
    const category = categoryOf(record.entityType);
    return category !== undefined && this.deps.access[category];
  }

  private deliver(records: readonly SyncRecord[]): void {
    const changes: AppliedChangeShape[] = [];
    for (const record of records) {
      if (!this.allowed(record) || this.book.isStale(record)) continue;
      this.book.noteRecord(record);
      changes.push(toAppliedChange(record));
    }
    if (changes.length > 0) this.deps.apply(changes);
  }

  /** The cursor fell off the Hub's retained history: re-read everything and reconcile what the collections hold. */
  private async resnapshot(): Promise<void> {
    try {
      const { records, cursor } = await this.deps.snapshot();
      const present = new Set<string>();
      const changes: AppliedChangeShape[] = [];
      for (const record of records) {
        if (!this.allowed(record) || record.deleted) continue;
        present.add(`${record.entityType}\u0000${record.entityId}`);
        if (this.book.isStale(record)) continue;
        this.book.noteRecord(record);
        changes.push(toAppliedChange(record));
      }
      for (const { entityType, entityId } of this.book.liveKeys()) {
        if (present.has(`${entityType}\u0000${entityId}`)) continue;
        const category = categoryOf(entityType);
        if (!category || !this.deps.access[category]) continue;
        changes.push(toAppliedChange({ entityType, entityId, deleted: true, payload: null }));
      }
      this.book.clear();
      for (const record of records) if (this.allowed(record)) this.book.noteRecord(record);
      this.cursor = cursor;
      if (changes.length > 0) this.deps.apply(changes);
    } catch (error) {
      if (classifyHubError(error).kind === 'unauthorized') this.expire();
    }
  }

  /**
   * Collections are chosen once at boot from the access flags, so a changed flag reloads the page; the next boot reads the
   * new flags and seeds from the Hub. (Unsaved shared edits cannot exist: writes are online-only and settle in
   * well under a second.)
   */
  private async checkAccess(): Promise<void> {
    try {
      const { access } = await this.deps.engine.client.webAccessGet();
      const changed = (Object.keys(access) as (keyof HubWebAccess)[]).some((id) => access[id] !== this.deps.access[id]);
      if (changed) this.deps.reload();
    } catch (error) {
      if (classifyHubError(error).kind === 'unauthorized') this.expire();
    }
  }

  // --- state report ---------------------------------------------------------------------------------------------

  /** Tells the Hub how far this browser has read (the Devices lag column), at most every 30 s. */
  private reportState(): void {
    const now = this.deps.now ? this.deps.now() : Date.now();
    const wait = this.lastReport + STATE_REPORT_MS - now;
    if (wait > 0) {
      this.reportTimer ??= setTimeout(() => {
        this.reportTimer = null;
        this.reportState();
      }, wait);
      return;
    }
    this.lastReport = now;
    void this.deps.engine.client
      .webState({ cursor: this.cursor, pending: 0, quarantined: 0, conflicts: 0, stranded: 0, categories: { ...this.deps.access }, lastSyncAt: new Date(now).toISOString() })
      .catch(() => undefined);
  }
}
