import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createHubClient, type HubClient, type HubRequest, type HubResponse, type HubTransport } from '@dude/api-client';
import { deviceAuthMessage, enrollMessage, parsePairingString } from '@dude/contracts/hub';
import type { SyncOp, SyncOpResult, SyncRecord } from '@dude/contracts/hub';

export const hubUrl = (): string => process.env['HUB_E2E_URL']!;
export const hubDataDir = (): string => process.env['HUB_E2E_DATA_DIR']!;
export const hubPort = (): number => Number(process.env['HUB_E2E_PORT']);

export function readSetupToken(): string {
  return readFileSync(path.join(hubDataDir(), 'config', 'setup-token'), 'utf8').trim();
}

/** A Node HubTransport that pins the Hub's own self-signed certificate (`ca`); certificate errors are never ignored. */
export function pinnedTransport(): HubTransport {
  const ca = process.env['HUB_E2E_CERT']!;
  return {
    request: (req: HubRequest) =>
      new Promise<HubResponse>((resolve, reject) => {
        const body = req.body === undefined ? undefined : JSON.stringify(req.body);
        const r = https.request(
          {
            host: '127.0.0.1',
            port: hubPort(),
            servername: 'localhost',
            method: req.method,
            path: req.path,
            ca,
            headers: {
              host: `localhost:${hubPort()}`,
              accept: 'application/json',
              ...(body === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }),
              ...req.headers,
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8');
              let parsed: unknown = text;
              try {
                parsed = text === '' ? undefined : JSON.parse(text);
              } catch {
                // Leave the raw text for the caller to assert on.
              }
              resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)])), body: parsed });
            });
          },
        );
        r.on('error', reject);
        if (body !== undefined) r.write(body);
        r.end();
      }),
  };
}

export const hubClient = (): HubClient => createHubClient(pinnedTransport(), { clientProtocol: 1, minHubProtocol: 1 });

const b64url = (buf: Buffer): string => buf.toString('base64url');

/** A device simulated in Node: an Ed25519 key, enrolled with a pairing string over the pinned transport. */
export class SimulatedDevice {
  readonly deviceId = randomUUID();
  private readonly privateKey: KeyObject;
  private readonly publicKey: string;
  private readonly client = hubClient();

  constructor() {
    const pair = generateKeyPairSync('ed25519');
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey.export({ format: 'jwk' }).x!;
  }

  private sign(message: string): string {
    return b64url(sign(null, Buffer.from(message, 'utf8'), this.privateKey));
  }

  async enroll(pairingString: string, displayName: string): Promise<void> {
    const parts = parsePairingString(pairingString);
    if (parts === null) throw new Error(`Unparseable pairing string: ${pairingString}`);
    if (parts.port !== hubPort()) throw new Error(`Pairing string port ${parts.port} is not the Hub's ${hubPort()}`);
    if (parts.spkiSha256 !== process.env['HUB_E2E_SPKI']) throw new Error('The pairing string pins a different certificate');
    const hello = await this.client.hello();
    await this.client.enroll({
      pairingCode: parts.code,
      device: { deviceId: this.deviceId, displayName, platform: 'linux', appVersion: '0.0.0-e2e', protocolVersion: 1, capabilities: [] },
      publicKey: this.publicKey,
      signature: this.sign(enrollMessage({ hubInstanceId: hello.hubInstanceId, pairingCode: parts.code, deviceId: this.deviceId, publicKey: this.publicKey })),
    });
  }

  private cached: { token: string; at: number } | null = null;

  /** A device token, reused for a few minutes (each exchange spends a challenge). */
  async bearer(): Promise<string> {
    if (this.cached && Date.now() - this.cached.at < 5 * 60_000) return this.cached.token;
    const token = await this.token();
    this.cached = { token, at: Date.now() };
    return token;
  }

  /** Pushes ops as this device. */
  async push(ops: readonly SyncOp[]): Promise<readonly SyncOpResult[]> {
    return (await this.client.syncPush(await this.bearer(), ops)).results;
  }

  /** Reads the change feed after `after` (every page). */
  async changes(after = 0): Promise<SyncRecord[]> {
    const out: SyncRecord[] = [];
    let cursor = after;
    for (;;) {
      const page = await this.client.syncChanges(await this.bearer(), cursor, 1000);
      out.push(...page.changes);
      cursor = page.cursor;
      if (!page.hasMore) return out;
    }
  }

  /** The newest record of an entity in the feed, or undefined. */
  async latest(entityType: string, entityId: string): Promise<SyncRecord | undefined> {
    return (await this.changes(0)).filter((r) => r.entityType === entityType && r.entityId === entityId).sort((a, b) => a.revision - b.revision).at(-1);
  }

  /** Reports this device's sync state, as the Agent does after a pull (what the Sync device table is built from). */
  async reportState(cursor: number): Promise<void> {
    const categories = Object.fromEntries(['settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home', 'usage', 'workspace-layout', 'scratchpad'].map((id) => [id, true]));
    await this.client.syncReportState(await this.bearer(), {
      cursor, pending: 0, quarantined: 0, conflicts: 0, stranded: 0, categories, lastSyncAt: new Date().toISOString(),
    } as Parameters<HubClient['syncReportState']>[1]);
  }

  /** Exchanges the owner password for an owner bearer (what a desktop does for owner-gated actions). */
  async ownerBearer(password: string): Promise<string> {
    return (await this.client.ownerBearer(await this.bearer(), password)).accessToken;
  }

  /** Challenge, sign, and exchange for a device token. */
  async token(): Promise<string> {
    const hello = await this.client.hello();
    const { nonce } = await this.client.deviceChallenge(this.deviceId);
    const signature = this.sign(deviceAuthMessage({ hubInstanceId: hello.hubInstanceId, nonce, deviceId: this.deviceId }));
    return (await this.client.deviceToken({ deviceId: this.deviceId, nonce, signature })).accessToken;
  }
}

export interface PageDiagnostics {
  cspViolations: () => Promise<string[]>;
  consoleErrors: string[];
  clear: () => Promise<void>;
}

/**
 * Records `securitypolicyviolation` events (in every frame and the main document) and console errors. Violations in
 * the page are pushed to `window.__cspViolations`; ones inside sandboxed iframes are relayed through the console.
 */
export async function trackDiagnostics(page: Page): Promise<PageDiagnostics> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = w.__cspViolations ?? [];
    document.addEventListener('securitypolicyviolation', (e) => {
      const line = `${e.violatedDirective} blocked=${e.blockedURI} source=${e.sourceFile}:${e.lineNumber} sample=${e.sample}`;
      w.__cspViolations.push(line);
      console.error(`[csp-violation] ${line}`);
    });
  });
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  return {
    consoleErrors,
    cspViolations: async () => {
      const own = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []).catch(() => []);
      // Violations reported by other documents (sandboxed iframes, workers) arrive only as console errors.
      const relayed = consoleErrors.filter((m) => /Content Security Policy|\[csp-violation\]/i.test(m));
      return [...own, ...relayed.filter((m) => !m.startsWith('[csp-violation]'))];
    },
    clear: async () => {
      consoleErrors.length = 0;
      await page.evaluate(() => ((window as unknown as { __cspViolations: string[] }).__cspViolations = [])).catch(() => undefined);
    },
  };
}

export const PASSWORD = 'correct horse battery staple 42';
/** The owner password after the recovery step of the flow spec; later specs sign in with it. */
export const NEW_PASSWORD = 'a different horse battery staple 77';

let opCounter = 0;
/** An upsert op in the wire shape the Agent journals. */
export function upsertOp(entityType: string, entityId: string, payload: unknown, basedOnRevision: number | null, schemaVersion = 1): SyncOp {
  return { opId: `e2e-${Date.now().toString(36)}-${opCounter++}-${randomUUID().slice(0, 8)}`, entityType, entityId, opKind: 'upsert', schemaVersion, basedOnRevision, payload } as SyncOp;
}

/** A `favorite` record payload for a tool. */
export const favoritePayload = (toolId: string, order: number): Record<string, unknown> => ({
  id: `tool:${toolId}`, kind: 'tool', targetId: toolId, order, pinnedAt: new Date().toISOString(),
});

/**
 * Submits the current form and, when the Hub's credential-endpoint rate bucket answers 'Too many attempts' (the specs
 * issue a burst of sign-ins), waits out the page's own retry countdown and submits again.
 */
export async function submitWithRetry(p: Page, stillOn: RegExp, password?: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    // The sign-in page clears the password after any failed attempt, including a throttled one.
    if (password !== undefined) await p.getByLabel('Password', { exact: true }).fill(password);
    // A request that was already in flight may complete (and navigate away) while this waits.
    const enabled = await expect(p.getByTestId('submit')).toBeEnabled({ timeout: 30_000 }).then(() => true, () => false);
    if (!stillOn.test(p.url())) return;
    if (!enabled) throw new Error('The submit button never became enabled');
    await p.getByTestId('submit').click();
    // allInnerTexts() never waits for a match: the page can navigate away between the URL check and these reads, and a
    // waiting innerText() would then block on an element that is gone for good, outliving the poll's timeout.
    // Hub web signs in with a full page load (PD-053 boot runs signed in), so a read can race the unload.
    const state = async (): Promise<string> => {
      if (!stillOn.test(p.url())) return 'done';
      try {
        const [submit] = await p.getByTestId('submit').allInnerTexts();
        if (submit === undefined || /…/.test(submit)) return 'waiting';
        const [error = ''] = await p.getByTestId('error').allInnerTexts();
        if (/Too many attempts/.test(error)) return 'throttled';
        return error.trim() === '' ? 'waiting' : `failed: ${error}`;
      } catch (error) {
        if (/Execution context was destroyed|navigation/i.test(String(error))) return 'waiting';
        throw error;
      }
    };
    let outcome = 'waiting';
    await expect.poll(async () => (outcome = await state()), { message: `still waiting on ${p.url()}`, timeout: 45_000 }).not.toBe('waiting');
    if (outcome === 'done') return;
    if (outcome !== 'throttled') throw new Error(outcome);
  }
  throw new Error('Still rate limited after several attempts');
}

/** Signs in as the owner with `password` (after the flow spec: NEW_PASSWORD) and waits to leave the sign-in page. */
export async function signInAsOwner(p: Page, password = NEW_PASSWORD, returnTo = '/'): Promise<void> {
  await p.goto(`/hub/sign-in?returnUrl=${encodeURIComponent(returnTo)}`);
  await submitWithRetry(p, /\/hub\/sign-in/, password);
  await expect(p).not.toHaveURL(/\/hub\/sign-in/);
}

/** Opens Settings > Devices, mints a pairing string through the UI and enrolls a new simulated device with it. */
export async function pairSimulatedDevice(p: Page, name: string): Promise<SimulatedDevice> {
  await p.goto('/settings/devices');
  await p.getByRole('button', { name: 'Pair a device' }).click();
  const pairingString = (await p.getByTestId('pairing-string').innerText()).trim();
  const device = new SimulatedDevice();
  await device.enroll(pairingString, name);
  return device;
}
