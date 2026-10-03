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
import { HubWebEngine } from './hub-web-engine';
import { HubWebFeedback } from './hub-web-feedback';
import { classifyHubError, type HubWebAccess, type HubWebBoot, type HubWebClient } from './hub-web.types';

const NAMESPACE_PREFIX = 'dude:v1:';
/** Present once this origin has attached to a Hub; sign-out clears it with the rest of the origin (PD-053). */
export const ATTACHED_MARKER_KEY = 'dude:v1:__device__:hub-web-attached';
const SNAPSHOT_PAGE = 1000;

export interface HubWebBootResult {
  readonly boot: HubWebBoot | null;
  readonly connection: HubWebConnectionService;
  readonly feedback: HubWebFeedback;
  readonly kv: HubKvBackend | null;
}

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
 * Hub-served web, before bootstrap: confirm the owner session, attach this browser, read the snapshot and install the
 * Hub kv backend as `local`. Any failure leaves the plain window backend in place (the session guard then sends the
 * visitor to sign-in or setup, and the sign-in page reloads the app so this runs again signed in).
 */
export async function bootHubWeb(): Promise<HubWebBootResult> {
  const connection = new HubWebConnectionService();
  const feedback = new HubWebFeedback();
  const none: HubWebBootResult = { boot: null, connection, feedback, kv: null };
  try {
    const module = await loadHubClient();
    let csrf: string | undefined;
    const transport = createFetchHubTransport({ csrfToken: () => csrf });
    const client = module.createHubClient(transport, { clientProtocol: 1, minHubProtocol: 1 });
    const session = await client.currentSession();
    csrf = session.csrfToken;

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

    const newId = (): string => uuidv7((n) => crypto.getRandomValues(new Uint8Array(n)), Date.now);
    const engine = new HubWebEngine({
      client, book, connection, feedback, newId,
      reattach: async () => {
        await client.webAttach({ installationId, label });
      },
    });
    dropOriginLocalSharedKeys(attach.access);
    const kv = createHubKvBackend({ engine, access: attach.access, records, local: createWindowStorageBackend('local') });
    installLocalBackend(kv);
    return {
      boot: { engine, deviceId: attach.deviceId, access: attach.access, cursor: snapshot.cursor, floor: snapshot.floor, retentionDays: attach.retentionDays, records, book },
      connection, feedback, kv,
    };
  } catch (error) {
    const { kind, message } = classifyHubError(error);
    if (kind !== 'unauthorized') console.warn(`[DUDE] Hub web boot failed (${kind}): ${message}`);
    return none;
  }
}
