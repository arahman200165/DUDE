import { spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createHubClient, type HubClient, type HubRequest, type HubResponse, type HubTransport } from '@dude/api-client';
import { deviceAuthMessage, enrollMessage, parsePairingString } from '@dude/contracts/hub';
import type { SyncOp, SyncOpResult, SyncRecord } from '@dude/contracts/hub';

export const hubUrl = (): string => process.env['HUB_E2E_URL']!;
export const hubDataDir = (): string => process.env['HUB_E2E_DATA_DIR']!;
export const hubPort = (): number => Number(process.env['HUB_E2E_PORT']);

export function readSetupToken(): string {
  return readFileSync(path.join(hubDataDir(), 'config', 'setup-token'), 'utf8').trim();
}

/** One running Hub the specs talk to: the shared one (global setup) or an extra one spawned by a spec (`spawnExtraHub`). */
export interface HubTarget {
  readonly url: string;
  readonly port: number;
  /** PEM of the Hub's leaf and, when it has one, its local CA root: what a Node client pins. */
  readonly cert: string;
  /** The leaf's SPKI SHA-256 (base64url): what Chromium is told to trust. */
  readonly spki: string;
  readonly dataDir: string;
}

/** The Hub that the global setup started and the other specs share. */
export const sharedHub = (): HubTarget => ({
  url: hubUrl(), port: hubPort(), cert: process.env['HUB_E2E_CERT']!, spki: process.env['HUB_E2E_SPKI']!, dataDir: hubDataDir(),
});

/** A Node HubTransport that pins the Hub's own self-signed certificate (`ca`); certificate errors are never ignored. */
export function pinnedTransport(target: HubTarget = sharedHub()): HubTransport {
  const ca = target.cert;
  const port = target.port;
  return {
    request: (req: HubRequest) =>
      new Promise<HubResponse>((resolve, reject) => {
        const body = req.body === undefined ? undefined : JSON.stringify(req.body);
        const r = https.request(
          {
            host: '127.0.0.1',
            port,
            servername: 'localhost',
            method: req.method,
            path: req.path,
            ca,
            headers: {
              host: `localhost:${port}`,
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

export const hubClient = (target: HubTarget = sharedHub()): HubClient => createHubClient(pinnedTransport(target), { clientProtocol: 1, minHubProtocol: 1 });

const b64url = (buf: Buffer): string => buf.toString('base64url');

/** A device simulated in Node: an Ed25519 key, enrolled with a pairing string over the pinned transport. */
export class SimulatedDevice {
  readonly deviceId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKey: string;
  private readonly client: HubClient;

  /** `identity` re-uses a device id and (optionally) key, e.g. to present the same device to another Hub (`moveTo`). */
  constructor(private readonly target: HubTarget = sharedHub(), identity?: { deviceId: string; privateKey?: KeyObject; publicKey?: string }) {
    this.deviceId = identity?.deviceId ?? randomUUID();
    if (identity?.privateKey !== undefined && identity.publicKey !== undefined) {
      this.privateKey = identity.privateKey;
      this.publicKey = identity.publicKey;
    } else {
      const pair = generateKeyPairSync('ed25519');
      this.privateKey = pair.privateKey;
      this.publicKey = pair.publicKey.export({ format: 'jwk' }).x!;
    }
    this.client = hubClient(target);
  }

  /** The same device id (and, unless `newKey`, the same key) talking to another Hub: what a restored Hub sees from a paired desktop. */
  moveTo(target: HubTarget, options: { newKey?: boolean } = {}): SimulatedDevice {
    return new SimulatedDevice(target, options.newKey === true ? { deviceId: this.deviceId } : { deviceId: this.deviceId, privateKey: this.privateKey, publicKey: this.publicKey });
  }

  /** The Hub's own `hello` as this device's client sees it. */
  hello(): ReturnType<HubClient['hello']> {
    return this.client.hello();
  }

  private sign(message: string): string {
    return b64url(sign(null, Buffer.from(message, 'utf8'), this.privateKey));
  }

  async enroll(pairingString: string, displayName: string): Promise<void> {
    const parts = parsePairingString(pairingString);
    if (parts === null) throw new Error(`Unparseable pairing string: ${pairingString}`);
    if (parts.port !== this.target.port) throw new Error(`Pairing string port ${parts.port} is not the Hub's ${this.target.port}`);
    if (parts.spkiSha256 !== this.target.spki) throw new Error('The pairing string pins a different certificate');
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
export async function pairSimulatedDevice(p: Page, name: string, target: HubTarget = sharedHub()): Promise<SimulatedDevice> {
  await p.goto('/settings/devices');
  await p.getByRole('button', { name: 'Pair a device' }).click();
  const pairingString = (await p.getByTestId('pairing-string').innerText()).trim();
  const device = new SimulatedDevice(target);
  await device.enroll(pairingString, name);
  return device;
}

// --- Extra Hubs, the dude-hub CLI and a Chromium that trusts one extra Hub (Phase 31G backup/transfer drill) ---------------------

const REPO_ROOT = path.resolve(__dirname, '../..');
const HUB_BUNDLE = path.join(REPO_ROOT, 'dist', 'hub-test', 'dude-hub.cjs');
const WEB_ROOT = path.join(REPO_ROOT, 'dist', 'hub-web', 'browser');

export interface ExtraHub {
  readonly target: HubTarget;
  /** Stops the process and waits for it to exit (idempotent). */
  stop(): Promise<void>;
  /** Everything the Hub wrote to stderr (for failure messages). */
  stderr(): string;
}

/**
 * Starts one more Hub from the compiled TEST bundle on `dataDir` (a fresh directory or a restored one) and an OS-chosen port.
 * It never touches the shared Hub of the other specs. Its certificate is read from the data directory once it listens, so
 * Node clients pin it (`ca`) and Chromium trusts exactly its leaf key (`openHubBrowser`).
 */
export async function spawnExtraHub(dataDir: string): Promise<ExtraHub> {
  if (!existsSync(HUB_BUNDLE)) throw new Error(`The test bundle is missing: ${HUB_BUNDLE}`);
  const child: ChildProcess = spawn(process.execPath, [HUB_BUNDLE, 'run', '--data-dir', dataDir, '--port', '0', '--web-root', WEB_ROOT], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DUDE_HUB_TEST_RELAX_RATE_LIMITS: '1' },
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  let exited = false;
  const exit = new Promise<void>((resolve) => child.once('exit', () => { exited = true; resolve(); }));
  const stop = async (): Promise<void> => {
    if (exited) return;
    const force = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.kill('SIGTERM');
    await exit;
    clearTimeout(force);
  };

  try {
    const listening = await new Promise<{ url: string; spkiSha256: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`The extra Hub did not start within 60 s. ${stderr}`)), 60_000);
      child.once('exit', (code) => reject(new Error(`The extra Hub exited early with ${code}. ${stderr}`)));
      createInterface({ input: child.stdout! }).on('line', (line) => {
        try {
          const parsed = JSON.parse(line) as { event?: string; url?: string; spkiSha256?: string };
          if (parsed.event === 'listening' && parsed.url && parsed.spkiSha256) {
            clearTimeout(timer);
            resolve({ url: parsed.url, spkiSha256: parsed.spkiSha256 });
          }
        } catch {
          // Not a JSON line (log output).
        }
      });
    });
    const port = Number(new URL(listening.url).port);
    const rootFile = path.join(dataDir, 'config', 'tls', 'ca', 'ca-cert.pem');
    const cert = readFileSync(path.join(dataDir, 'config', 'tls', 'cert.pem'), 'utf8') + (existsSync(rootFile) ? readFileSync(rootFile, 'utf8') : '');
    return { target: { url: `https://localhost:${port}`, port, cert, spki: listening.spkiSha256, dataDir }, stop, stderr: () => stderr };
  } catch (error) {
    await stop();
    throw error;
  }
}

export interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one real `dude-hub` CLI command of the test bundle to completion. The backup passphrase goes in `env`, never a flag. */
export function runHubCli(args: readonly string[], options: { env?: Record<string, string>; timeoutMs?: number } = {}): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(process.execPath, [HUB_BUNDLE, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`dude-hub ${args.join(' ')} did not finish within ${options.timeoutMs ?? 120_000} ms. ${stderr}`));
    }, options.timeoutMs ?? 120_000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

/** A Chromium that trusts exactly one Hub's leaf key (`--ignore-certificate-errors-spki-list`, never a blanket override), in its own cookie jar. */
export async function openHubBrowser(target: HubTarget): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const pin = Buffer.from(target.spki, 'base64url').toString('base64');
  const browser = await chromium.launch({ args: [`--ignore-certificate-errors-spki-list=${pin}`] });
  const context = await browser.newContext({ baseURL: target.url });
  return { browser, context, page: await context.newPage() };
}
