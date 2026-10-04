import { hubCsrf } from '../hub/hub-csrf';
import type { SyncRecord } from '@dude/contracts/hub';
import { defaultDisplayName, kvSyncEntityOfStored, uuidv7 } from '@dude/persistence';
import { RecordBook, categoryOf } from '@dude/sync';
import { TOOL_METADATA } from '@dude/tool-registry';
import { INSTALLATION_STORAGE_KEY } from '../device/device-identity.service';
import { createFetchHubTransport } from '../hub/fetch-hub-transport';
import { loadHubClient } from '../hub/hub-client-loader';
import { createWindowStorageBackend } from '../persistence/window-storage-backend';
import { installLocalBackend } from '../persistence/local-backend-registry';
import { createHubKvBackend, type HubKvBackend } from './hub-kv-backend';
import { HubWebConnectionService } from './hub-web-connection.service';
import { HubWebSyncInfo } from './hub-web-sync-info';
import { checkBrowserAuthority, type HubAuthorityBlock, type SeenAuthority } from './hub-web-authority';
import { HubWebEngine } from './hub-web-engine';
import { HubWebFeedback } from './hub-web-feedback';
import { classifyHubError, type HubWebAccess, type HubWebBoot, type HubWebClient } from './hub-web.types';

const NAMESPACE_PREFIX = 'dude:v1:';
/** Present once this origin has attached to a Hub; sign-out clears it with the rest of the origin (PD-053). */
export const ATTACHED_MARKER_KEY = 'dude:v1:__device__:hub-web-attached';
const SNAPSHOT_PAGE = 1000;

/**
 * `live`: attached to the Hub. `signed-out`: no owner session (the guard sends the visitor to sign-in). `offline`: the Hub could
 * not be reached (read-only, retrying). `blocked`: the authority gate refused this Hub (transferred, or older than the one this
 * browser used before); nothing is attached and the app does not start, only the blocking notice (PD-071).
 */
export type HubWebBootMode = 'live' | 'signed-out' | 'offline' | 'blocked';

export interface HubWebBootResult {
  readonly mode: HubWebBootMode;
  readonly boot: HubWebBoot | null;
  readonly connection: HubWebConnectionService;
  readonly feedback: HubWebFeedback;
  readonly sync: HubWebSyncInfo;
  readonly kv: HubKvBackend | null;
  /** Blocked mode only: why, for the notice. */
  readonly blocked?: HubAuthorityBlock;
  /** Offline mode only: resolves once the Hub answers at all (an answer of any kind, even 401), rejects while it cannot be reached. */
  readonly probe?: () => Promise<void>;
}

/** What boot needs from the Hub client: the owner-session check (which also learns the CSRF token) and the browser routes. */
export interface HubWebBootConnection {
  readonly client: HubWebClient;
  /** Public `hello`: who this Hub is (instance id, authority epoch and state). Needs no session. */
  hello(): Promise<SeenAuthority>;
  checkSession(): Promise<void>;
}

export interface HubWebBootDeps {
  /** Loads the Hub client. Rejects when the client chunk cannot be fetched (treated like an unreachable Hub). */
  readonly connect: () => Promise<HubWebBootConnection>;
}

async function connectToHub(): Promise<HubWebBootConnection> {
  const module = await loadHubClient();
  let csrf: string | undefined;
  const transport = createFetchHubTransport({ csrfToken: () => hubCsrf.get() });
  const client = module.createHubClient(transport, { clientProtocol: 1, minHubProtocol: 1 });
  return {
    client,
    hello: () => client.hello(),
    checkSession: async () => {
      hubCsrf.set((await client.currentSession()).csrfToken);
    },
  };
}

export type HubBootDecision = 'signed-out' | 'offline';

/**
 * What a failed boot means. Only an unreachable Hub (network error, 5xx, a client chunk that would not load) installs the
 * offline boot; a 401 (or anything the Hub answered) is the ordinary signed-out path that the session guard handles.
 */
export function decideBootFailure(error: unknown): HubBootDecision {
  return classifyHubError(error).kind === 'unreachable' ? 'offline' : 'signed-out';
}

/** Every call fails like a down Hub; stands in for the client when its chunk could not be loaded. */
function unreachableClient(): HubWebClient {
  const fail = (): Promise<never> => Promise.reject(Object.assign(new Error('The Hub could not be reached.'), { name: 'HubApiError', status: 503, code: 'unreachable' }));
  return new Proxy({}, { get: () => fail }) as HubWebClient;
}

const assumedAccess = (): HubWebAccess => ({
  settings: true, favorites: true, pipelines: true, projects: true, workspaces: true, home: true, usage: true, 'workspace-layout': true, scratchpad: true,
});

/** "Browser · Chrome on Windows" from `navigator.userAgentData` or the user-agent string. */
export function describeBrowser(nav: Pick<Navigator, 'userAgent'> & { userAgentData?: { brands?: { brand: string }[]; platform?: string } } = navigator): string {
  const ua = nav.userAgent;
  const brands = nav.userAgentData?.brands?.map((b) => b.brand) ?? [];
  const browser = brands.includes('Microsoft Edge') || /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : brands.includes('Google Chrome') || /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const raw = nav.userAgentData?.platform ?? (/Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '');
  const platform = raw === 'macOS' || raw === 'Windows' || raw === 'Linux' || raw === 'Android' || raw === 'iOS' ? raw : raw || 'this device';
  return `Browser · ${browser} on ${platform}`;
}

/** The browser's stable installation id (the same record `DeviceIdentityService` reads), minted here when boot runs first. */
export function readOrMintInstallationId(): string {
  const local = createWindowStorageBackend('local');
  try {
    const raw = local.get(INSTALLATION_STORAGE_KEY);
    const parsed = raw === null ? null : (JSON.parse(raw) as { deviceId?: unknown });
    if (parsed && typeof parsed.deviceId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(parsed.deviceId)) return parsed.deviceId;
  } catch {
    // fall through and mint
  }
  const random = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
  const record = { deviceId: uuidv7(random, Date.now), environmentId: uuidv7(random, Date.now), displayName: defaultDisplayName('web'), createdAt: new Date().toISOString() };
  local.set(INSTALLATION_STORAGE_KEY, JSON.stringify(record));
  return record.deviceId;
}

/** Drops origin-local copies of shared keys (the Hub wins, PD-053) the first time this origin attaches. */
export function dropOriginLocalSharedKeys(access: HubWebAccess): number {
  const local = createWindowStorageBackend('local');
  if (local.get(ATTACHED_MARKER_KEY) !== null) return 0;
  let dropped = 0;
  for (const fullKey of local.keys(NAMESPACE_PREFIX)) {
    const rest = fullKey.slice(NAMESPACE_PREFIX.length);
    const split = rest.indexOf(':');
    if (split < 1) continue;
    const namespace = rest.slice(0, split);
    if (namespace.startsWith('__device__') || namespace === '__consent__') continue;
    const entity = kvSyncEntityOfStored(namespace, rest.slice(split + 1), TOOL_METADATA);
    const category = entity ? categoryOf(entity.entityType) : undefined;
    if (entity && category && access[category]) {
      local.remove(fullKey);
      dropped++;
    }
  }
  local.set(ATTACHED_MARKER_KEY, '1');
  return dropped;
}

export async function pageSnapshot(client: HubWebClient): Promise<{ records: SyncRecord[]; cursor: number; floor: number }> {
  const records: SyncRecord[] = [];
  let cursor = 0;
  let floor = 0;
  let after: { afterType: string; afterId: string } | undefined;
  for (let page = 0; ; page++) {
    const response = await client.webSnapshot({ ...after, limit: SNAPSHOT_PAGE });
    if (page === 0) {
      cursor = response.asOfRevision;
      floor = response.floor;
    }
    records.push(...response.records);
    if (response.next === null) break;
    after = response.next;
  }
  return { records, cursor, floor };
}

/**
 * Hub unreachable at boot: shared state is read-only and empty, every shared write is refused with the same toast and
 * revert as a Hub that drops while the page is open, and the page reloads itself once the Hub answers (the runtime runs
 * the retry loop). Tools that are already loaded keep working. Access is assumed on for every category, so a shared
 * edit is refused rather than quietly stored in this browser.
 */
function offlineBoot(base: Pick<HubWebBootResult, 'connection' | 'feedback' | 'sync'>, client: HubWebClient | null, deps: HubWebBootDeps): HubWebBootResult {
  const { connection, feedback, sync } = base;
  connection.set('unreachable');
  const effective = client ?? unreachableClient();
  const book = new RecordBook();
  const access = assumedAccess();
  const engine = new HubWebEngine({ client: effective, book, connection, feedback, newId: () => uuidv7((n) => crypto.getRandomValues(new Uint8Array(n)), Date.now) });
  const kv = createHubKvBackend({ engine, access, records: [], local: createWindowStorageBackend('local') });
  installLocalBackend(kv);
  sync.onStop(() => kv.dispose());
  const probe = async (): Promise<void> => {
    try {
      await (await deps.connect()).checkSession();
    } catch (error) {
      if (decideBootFailure(error) === 'offline') throw error;
    }
  };
  return {
    mode: 'offline', connection, feedback, sync, kv, probe,
    boot: { engine, deviceId: '', access, cursor: 0, floor: 0, retentionDays: 0, records: [], book },
  };
}

/**
 * Hub-served web, before bootstrap: confirm the owner session, attach this browser, read the snapshot and install the
 * Hub kv backend as `local`. A 401 (or any other answer from the Hub) leaves the plain window backend in place (the session
 * guard then sends the visitor to sign-in or setup, and the sign-in page reloads the app so this runs again signed in);
 * an unreachable Hub installs the read-only offline boot instead (PD-053).
 */
export async function bootHubWeb(deps: HubWebBootDeps = { connect: connectToHub }): Promise<HubWebBootResult> {
  const connection = new HubWebConnectionService();
  const feedback = new HubWebFeedback();
  const sync = new HubWebSyncInfo();
  const base = { connection, feedback, sync };
  let client: HubWebClient | null = null;
  try {
    const connected = await deps.connect();
    client = connected.client;
    // Authority gate (PD-071): before any sign-in or attach, so a transferred or older Hub is never signed in to. A failed
    // `hello` falls through to the ordinary boot below, which classifies the failure (unreachable, signed out) as it always did.
    const gate = await checkBrowserAuthority(() => connected.hello(), createWindowStorageBackend('local'));
    if (gate.kind === 'blocked') return { mode: 'blocked', boot: null, ...base, kv: null, blocked: gate.block };
    await connected.checkSession();

    const installationId = readOrMintInstallationId();
    const label = describeBrowser();
    const attach = await client.webAttach({ installationId, label });
    const snapshot = await pageSnapshot(client);

    const book = new RecordBook();
    const records = snapshot.records.filter((r) => {
      const category = categoryOf(r.entityType);
      return category !== undefined && attach.access[category];
    });
    for (const record of records) book.noteRecord(record);

    const attached = client;
    const newId = (): string => uuidv7((n) => crypto.getRandomValues(new Uint8Array(n)), Date.now);
    const engine = new HubWebEngine({
      client: attached, book, connection, feedback, newId,
      reattach: async () => {
        await attached.webAttach({ installationId, label });
      },
      onPushed: () => sync.notePush(),
    });
    dropOriginLocalSharedKeys(attach.access);
    const kv = createHubKvBackend({ engine, access: attach.access, records, local: createWindowStorageBackend('local') });
    installLocalBackend(kv);
    sync.onStop(() => kv.dispose());
    sync.notePull(snapshot.cursor, snapshot.cursor);
    return {
      mode: 'live',
      boot: { engine, deviceId: attach.deviceId, access: attach.access, cursor: snapshot.cursor, floor: snapshot.floor, retentionDays: attach.retentionDays, records, book },
      connection, feedback, sync, kv,
    };
  } catch (error) {
    const { kind, message } = classifyHubError(error);
    // The Hub answered `hub-transferred` although `hello` did not say so (it failed, or the Hub was retired in between).
    if (kind === 'transferred') return { mode: 'blocked', boot: null, ...base, kv: null, blocked: { kind: 'transferred' } };
    if (kind !== 'unauthorized') console.warn(`[DUDE] Hub web boot failed (${kind}): ${message}`);
    if (decideBootFailure(error) === 'offline') return offlineBoot(base, client, deps);
    return { mode: 'signed-out', boot: null, ...base, kv: null };
  }
}
