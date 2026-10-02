import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { createHubClient, type HubClient, type HubRequest, type HubResponse, type HubTransport } from '@dude/api-client';
import { deviceAuthMessage, enrollMessage, parsePairingString } from '@dude/contracts/hub';

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
