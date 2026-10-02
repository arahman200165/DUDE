import { app, ipcMain, Notification, powerMonitor, type WebContents } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WatchCheck, WatchEntry, WatchResult, WatchSettings, WatchState, WatchStatus } from "@dude/contracts/core/platform/network-types";
import { tlsHandshake } from './network-tls';
import { startTlsUpgrade } from './network-starttls';

/**
 * Certificate Watch List and Expiration Monitor (DUDE_PRD.md §21 Phase 28 items 17, 24) — DUDE's
 * first background network check. This amends Phase 27's "no background or scheduled check" ceiling
 * explicitly and narrowly: opt-in only, at most 50 entries, one TLS handshake per entry, a 6/12/24 h
 * interval, and only while the process is alive (window open or hidden to tray). No launch-on-login,
 * no service, no OCSP/CT follow-ups in the background. Everything below the scheduler is pure so it
 * is unit-tested with fake timers.
 */
const MAX_ENTRIES = 50;
const MAX_IN_FLIGHT = 2;
const MAX_HISTORY = 60; // ~30 days at a 12 h cadence
const DEFAULT_SETTINGS: WatchSettings = { enabled: false, intervalHours: 24, thresholds: [30, 14, 7, 1], failureAlertAfter: 3, notifications: true };

// ---- Pure status logic ----
export function statusFor(check: Pick<WatchCheck, 'daysRemaining' | 'status'>, thresholds: readonly number[]): WatchStatus {
  if (check.status === 'error') return 'error';
  const days = check.daysRemaining;
  if (days === undefined) return 'error';
  if (days < 0) return 'expired';
  return days <= Math.max(...thresholds) ? 'warning' : 'ok';
}

/** Which alert keys this check should raise, given what was already sent (threshold crossings, expiry, fingerprint change, repeated failure). */
export function alertsFor(entry: Pick<WatchEntry, 'thresholds' | 'pinnedFingerprint' | 'consecutiveFailures' | 'notified'>, check: WatchCheck, settings: WatchSettings): string[] {
  const thresholds = entry.thresholds ?? settings.thresholds;
  const raised: string[] = [];
  if (check.status === 'error') {
    if (entry.consecutiveFailures + 1 >= settings.failureAlertAfter) raised.push(`fail:${entry.consecutiveFailures + 1}`);
    return raised.filter((key) => !entry.notified.includes(key));
  }
  if (check.daysRemaining !== undefined && check.daysRemaining < 0) raised.push('expired');
  else if (check.daysRemaining !== undefined) {
    // The tightest crossed threshold; earlier ones are already in `notified` from prior passes.
    const crossed = thresholds.filter((threshold) => check.daysRemaining! <= threshold).sort((a, b) => a - b);
    if (crossed.length) raised.push(`t:${crossed[0]}`);
  }
  if (entry.pinnedFingerprint && check.fingerprint256 && check.fingerprint256 !== entry.pinnedFingerprint) raised.push(`fp:${check.fingerprint256.slice(0, 16)}`);
  return raised.filter((key) => !entry.notified.includes(key));
}

/** Notifications reset when the certificate is renewed (new fingerprint) so future thresholds fire again. */
export function foldCheck(entry: WatchEntry, check: WatchCheck, settings: WatchSettings): { entry: WatchEntry; newAlerts: string[] } {
  const newAlerts = alertsFor(entry, check, settings);
  const renewed = !!check.fingerprint256 && !!entry.last?.fingerprint256 && check.fingerprint256 !== entry.last.fingerprint256;
  const consecutiveFailures = check.status === 'error' ? entry.consecutiveFailures + 1 : 0;
  const notified = renewed ? newAlerts : [...new Set([...entry.notified, ...newAlerts])];
  const history = [check, ...entry.history].slice(0, MAX_HISTORY);
  // pinnedFingerprint is only set when the user explicitly pins, so routine renewals don't alarm.
  return { entry: { ...entry, last: check, history, consecutiveFailures, notified }, newAlerts };
}

export function jitter(intervalMs: number, random = Math.random): number {
  return Math.round(intervalMs * (0.9 + random() * 0.2)); // ±10%
}
export function summarizeStatuses(entries: readonly WatchEntry[]): { expiring: number; expired: number; errors: number } {
  return {
    expiring: entries.filter((entry) => entry.last?.status === 'warning' || entry.last?.status === 'changed').length,
    expired: entries.filter((entry) => entry.last?.status === 'expired').length,
    errors: entries.filter((entry) => entry.last?.status === 'error').length,
  };
}

// ---- Live check (one TLS handshake) ----
export type CertProbe = (entry: WatchEntry, signal: AbortSignal) => Promise<WatchCheck>;
export const liveProbe: CertProbe = async (entry, signal) => {
  const checkedAt = new Date().toISOString();
  try {
    const socketOptions = entry.starttlsProtocol
      ? { socket: (await startTlsUpgrade(entry.starttlsProtocol, entry.host, entry.port, signal, 10_000)).socket }
      : {};
    const handshake = await tlsHandshake({ host: entry.host, port: entry.port, servername: entry.sni || entry.host, timeoutMs: 10_000, requestOcsp: false, ...socketOptions }, signal);
    const leaf = handshake.chain[0];
    if (!leaf) return { checkedAt, status: 'error', error: 'No certificate presented.' };
    const status = statusFor({ daysRemaining: leaf.daysRemaining, status: 'ok' }, entry.thresholds ?? DEFAULT_SETTINGS.thresholds);
    return { checkedAt, status, fingerprint256: leaf.fingerprint256, validTo: leaf.validTo, daysRemaining: leaf.daysRemaining, issuer: leaf.issuer, subject: leaf.subject };
  } catch (error) {
    return { checkedAt, status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
};

// ---- Persistent store ----
function storePath(): string { return join(app.getPath('userData'), 'certificate-watch-list.json'); }
let state: WatchState = { settings: DEFAULT_SETTINGS, entries: [] };
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  try {
    const raw = JSON.parse(await fs.readFile(storePath(), 'utf8')) as WatchState;
    state = { settings: { ...DEFAULT_SETTINGS, ...raw.settings }, entries: (raw.entries ?? []).slice(0, MAX_ENTRIES), lastPassAt: raw.lastPassAt, nextPassAt: raw.nextPassAt };
  } catch { state = { settings: DEFAULT_SETTINGS, entries: [] }; }
  loaded = true;
}
let saveQueue: Promise<unknown> = Promise.resolve();
function save(): Promise<void> { saveQueue = saveQueue.then(() => fs.writeFile(storePath(), JSON.stringify(state), 'utf8')).catch(() => {}); return saveQueue as Promise<void>; }

// ---- Scheduler ----
let timer: NodeJS.Timeout | null = null;
let running = false;
let probe: CertProbe = liveProbe;
let onTrayUpdate: ((summary: { expiring: number; expired: number; errors: number }) => void) | null = null;
let subscribers: WebContents[] = [];
export function setWatchProbeForTesting(value: CertProbe): void { probe = value; }
export function setTrayUpdater(fn: (summary: { expiring: number; expired: number; errors: number }) => void): void { onTrayUpdate = fn; }

function broadcast(): void {
  subscribers = subscribers.filter((contents) => !contents.isDestroyed());
  for (const contents of subscribers) contents.send('dude:network:watch:changed', state);
  onTrayUpdate?.(summarizeStatuses(state.entries));
}

function notify(entry: WatchEntry, alerts: readonly string[]): void {
  if (!state.settings.notifications || !alerts.length || !Notification.isSupported()) return;
  const label = entry.label || `${entry.host}:${entry.port}`;
  const title = alerts.some((a) => a === 'expired') ? `Certificate expired: ${label}`
    : alerts.some((a) => a.startsWith('fp:')) ? `Certificate changed: ${label}`
      : alerts.some((a) => a.startsWith('fail:')) ? `Certificate check failing: ${label}`
        : `Certificate expiring: ${label}`;
  const body = entry.last?.status === 'error' ? (entry.last.error ?? 'Check failed.') : entry.last?.daysRemaining !== undefined ? `${entry.last.daysRemaining} day(s) left (until ${entry.last.validTo?.slice(0, 10)}).` : '';
  new Notification({ title, body }).show();
}

/** Run one pass over all entries, at most MAX_IN_FLIGHT at a time. */
export async function runPass(signal: AbortSignal): Promise<void> {
  if (running) return;
  running = true;
  try {
    const entries = [...state.entries];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(MAX_IN_FLIGHT, entries.length) }, async () => {
      while (next < entries.length && !signal.aborted) {
        const entry = entries[next++];
        const check = await probe(entry, signal);
        const current = state.entries.find((candidate) => candidate.id === entry.id);
        if (!current) continue;
        const { entry: updated, newAlerts } = foldCheck(current, check, state.settings);
        state = { ...state, entries: state.entries.map((candidate) => candidate.id === entry.id ? updated : candidate) };
        notify(updated, newAlerts);
      }
    }));
    state = { ...state, lastPassAt: new Date().toISOString() };
    await save();
    broadcast();
  } finally { running = false; }
}

function scheduleNext(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!state.settings.enabled || !state.entries.length) { state = { ...state, nextPassAt: undefined }; return; }
  const delay = jitter(state.settings.intervalHours * 3_600_000);
  state = { ...state, nextPassAt: new Date(Date.now() + delay).toISOString() };
  timer = setTimeout(() => { void runPass(new AbortController().signal).finally(scheduleNext); }, delay);
}

// ---- Validation of renderer-supplied entries ----
function sanitizeEntry(raw: unknown, existing?: WatchEntry): WatchEntry {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid watch entry.');
  const input = raw as Partial<WatchEntry>;
  const host = String(input.host ?? '').trim();
  if (!host || host.length > 253 || /[\s/?#@\\]/.test(host)) throw new Error('Enter a valid host.');
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port.');
  const thresholds = Array.isArray(input.thresholds) ? input.thresholds.filter((value) => Number.isInteger(value) && value > 0 && value <= 3650).slice(0, 8) : undefined;
  return {
    id: existing?.id ?? String(input.id ?? randomUUID()),
    label: String(input.label ?? '').slice(0, 80),
    host, port,
    sni: input.sni ? String(input.sni).slice(0, 253) : undefined,
    starttlsProtocol: input.starttlsProtocol,
    clientIdentityRef: input.clientIdentityRef ? String(input.clientIdentityRef).slice(0, 64) : undefined,
    thresholds,
    pinnedFingerprint: existing?.pinnedFingerprint ?? (input.pinnedFingerprint ? String(input.pinnedFingerprint) : undefined),
    last: existing?.last,
    history: existing?.history ?? [],
    consecutiveFailures: existing?.consecutiveFailures ?? 0,
    notified: existing?.notified ?? [],
  };
}

let clearToken: string | null = null;

export function registerWatchHandlers(): void {
  const handle = <T>(channel: string, fn: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T) =>
    ipcMain.handle(channel, async (event, ...args) => { try { return await fn(event, ...args); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } as WatchResult; } });

  handle('dude:network:watch:get', async (event) => { await load(); subscribers = [...subscribers.filter((c) => c !== event.sender), event.sender]; return { ok: true, state }; });
  handle('dude:network:watch:upsert', async (_event, raw) => {
    await load();
    const existing = state.entries.find((entry) => entry.id === (raw as { id?: string })?.id);
    if (!existing && state.entries.length >= MAX_ENTRIES) throw new Error(`At most ${MAX_ENTRIES} watched endpoints.`);
    const entry = sanitizeEntry(raw, existing);
    state = { ...state, entries: existing ? state.entries.map((e) => e.id === entry.id ? entry : e) : [...state.entries, entry] };
    await save(); scheduleNext(); broadcast();
    return { ok: true, entry };
  });
  handle('dude:network:watch:remove', async (_event, id) => {
    await load();
    state = { ...state, entries: state.entries.filter((entry) => entry.id !== id) };
    await save(); scheduleNext(); broadcast();
    return { ok: true };
  });
  handle('dude:network:watch:clearPrepare', async () => { await load(); clearToken = randomUUID(); return { ok: true, token: clearToken, count: state.entries.length }; });
  handle('dude:network:watch:clearConfirm', async (_event, token) => {
    if (!clearToken || token !== clearToken) throw new Error('Confirmation expired. Review the clear again.');
    clearToken = null;
    state = { ...state, entries: [] };
    await save(); scheduleNext(); broadcast();
    return { ok: true };
  });
  handle('dude:network:watch:setSettings', async (_event, raw) => {
    await load();
    const input = (raw ?? {}) as Partial<WatchSettings>;
    const intervalHours = ([6, 12, 24] as const).includes(input.intervalHours as 6) ? input.intervalHours! : state.settings.intervalHours;
    const thresholds = Array.isArray(input.thresholds) ? input.thresholds.filter((v) => Number.isInteger(v) && v > 0 && v <= 3650).slice(0, 8) : state.settings.thresholds;
    state = { ...state, settings: {
      enabled: typeof input.enabled === 'boolean' ? input.enabled : state.settings.enabled,
      intervalHours, thresholds: thresholds.length ? thresholds : state.settings.thresholds,
      failureAlertAfter: Number.isInteger(input.failureAlertAfter) ? Math.max(1, Math.min(10, input.failureAlertAfter!)) : state.settings.failureAlertAfter,
      notifications: typeof input.notifications === 'boolean' ? input.notifications : state.settings.notifications,
    } };
    await save(); scheduleNext(); broadcast();
    return { ok: true, state };
  });
  handle('dude:network:watch:checkNow', async (_event, id) => {
    await load();
    const abort = new AbortController();
    if (id) {
      const entry = state.entries.find((candidate) => candidate.id === id);
      if (!entry) throw new Error('Unknown entry.');
      const check = await probe(entry, abort.signal);
      const current = state.entries.find((candidate) => candidate.id === id);
      if (current) { const { entry: updated, newAlerts } = foldCheck(current, check, state.settings); state = { ...state, entries: state.entries.map((e) => e.id === id ? updated : e) }; notify(updated, newAlerts); }
    } else await runPass(abort.signal);
    await save(); broadcast();
    return { ok: true, state };
  });
  handle('dude:network:watch:export', async () => { await load(); return { ok: true, json: JSON.stringify({ version: 1, settings: state.settings, entries: state.entries.map(({ history: _h, last: _l, notified: _n, consecutiveFailures: _c, ...rest }) => rest) }, null, 2) }; });
  handle('dude:network:watch:import', async (_event, json) => {
    await load();
    const parsed = JSON.parse(String(json)) as { entries?: unknown[]; settings?: Partial<WatchSettings> };
    const imported = (parsed.entries ?? []).slice(0, MAX_ENTRIES).map((raw) => sanitizeEntry(raw));
    state = { ...state, entries: imported };
    await save(); scheduleNext(); broadcast();
    return { ok: true, state };
  });

  powerMonitor.on('resume', () => { if (state.settings.enabled && state.entries.length) void runPass(new AbortController().signal).finally(scheduleNext); });
  void load().then(scheduleNext);
}

export function stopWatchScheduler(): void { if (timer) { clearTimeout(timer); timer = null; } }
/** Test seam. */
export function resetWatchForTesting(initial?: WatchState): void { state = initial ?? { settings: DEFAULT_SETTINGS, entries: [] }; loaded = true; if (timer) { clearTimeout(timer); timer = null; } }
export function currentStateForTesting(): WatchState { return state; }
export { MAX_ENTRIES, DEFAULT_SETTINGS };
