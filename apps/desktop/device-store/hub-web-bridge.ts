import { execFile } from 'node:child_process';
import { X509Certificate, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ipcMain, shell, type BrowserWindow } from 'electron';
import type { DesktopHubResult, DesktopRootCertificatePreview } from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { getDeviceStoreHost } from './store-client';

/**
 * Two narrow Hub-web desktop actions (PD-062), registered by `registerHubHandlers`.
 *
 * - `dude:hub:openWeb` takes NO argument: main reads the enrolled Hub URL from the Device Agent itself and opens it
 *   externally only when it is an `https:` URL. The renderer can never choose what is opened.
 * - `dude:hub:rootCertificate:preview` / `:install` install the Hub's public local-CA root into the CURRENT USER's Trusted
 *   Root store. This is a consequential local change, so it follows the Destructive-Action Contract: the preview (main
 *   fetches the root over the Agent's pinned Hub client, never an unpinned path) returns the SHA-256 fingerprint and a
 *   60-second single-use token bound to the requesting window and that exact certificate; only `install` with that token runs
 *   `certutil` (execFile, no shell). Previewing never changes anything. Windows only.
 */

export const ROOT_CERT_TOKEN_TTL_MS = 60_000;
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export interface ExecResult { readonly code: number }
export interface HubWebDeps {
  readonly platform: NodeJS.Platform;
  readonly now: () => number;
  readonly randomToken: () => string;
  readonly openExternal: (url: string) => Promise<void>;
  /** Runs `file` with `args` without a shell; resolves with the exit code, never rejects on a non-zero exit. */
  readonly exec: (file: string, args: readonly string[]) => Promise<ExecResult>;
  readonly makeTempDir: () => Promise<string>;
  readonly writeFile: (path: string, data: Buffer) => Promise<void>;
  readonly removeDir: (path: string) => Promise<void>;
}

const defaultDeps: HubWebDeps = {
  platform: process.platform,
  now: () => Date.now(),
  randomToken: () => randomBytes(24).toString('base64url'),
  openExternal: (url) => shell.openExternal(url),
  exec: (file, args) => new Promise((resolve) => {
    execFile(file, [...args], { windowsHide: true, timeout: 120_000 }, (error) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
      resolve({ code });
    });
  }),
  makeTempDir: () => mkdtemp(join(tmpdir(), 'dude-root-')),
  writeFile: (path, data) => writeFile(path, data, { mode: 0o600 }),
  removeDir: (path) => rm(path, { recursive: true, force: true }),
};

const fail = (code: string, message: string): DesktopHubResult<never> => ({ ok: false, error: { code, message } });
const ok = <T>(result: T): DesktopHubResult<T> => ({ ok: true, result });

/** Uppercase, colon-separated SHA-256 of the certificate's DER. */
export function sha256Fingerprint(der: Uint8Array): string {
  return (createHash('sha256').update(der).digest('hex').toUpperCase().match(/../g) ?? []).join(':');
}

interface Pending { readonly token: string; readonly der: Buffer; readonly expiresAt: number }

export function registerHubWebHandlers(
  window: BrowserWindow, host: () => DeviceStoreHost | null = getDeviceStoreHost, overrides: Partial<HubWebDeps> = {},
): void {
  const deps: HubWebDeps = { ...defaultDeps, ...overrides };
  const own = (sender: unknown): boolean => sender === window.webContents;
  let pending: Pending | null = null;
  let installing = false;

  ipcMain.handle('dude:hub:openWeb', async (event, ...args: unknown[]): Promise<DesktopHubResult<{ readonly ok: true }>> => {
    if (!own(event.sender)) return fail('forbidden', 'forbidden');
    if (args.length !== 0) return fail('bad-request', 'Invalid request.');
    const h = host();
    if (!h) return fail('unavailable', 'The device agent is not running.');
    try {
      const status = await h.call('hub.status', {});
      const enrollment = status.enrollment;
      if (enrollment?.state !== 'enrolled') return fail('not-enrolled', 'This device is not connected to a Hub.');
      let url: URL;
      try { url = new URL(enrollment.hubUrl); } catch { return fail('invalid-url', 'The Hub address is not a valid URL.'); }
      if (url.protocol !== 'https:') return fail('invalid-url', 'The Hub address is not an https address.');
      await deps.openExternal(url.href);
      return ok({ ok: true });
    } catch (error) {
      if (error instanceof DeviceStoreError) return fail(error.code, error.message);
      return fail('internal', 'The Hub web page could not be opened.');
    }
  });

  ipcMain.handle('dude:hub:rootCertificate:preview', async (event, ...args: unknown[]): Promise<DesktopHubResult<DesktopRootCertificatePreview>> => {
    if (!own(event.sender)) return fail('forbidden', 'forbidden');
    if (args.length !== 0) return fail('bad-request', 'Invalid request.');
    pending = null;
    if (deps.platform !== 'win32') return ok({ available: false, reason: 'unsupported-platform' });
    const h = host();
    if (!h) return fail('unavailable', 'The device agent is not running.');
    try {
      const certs = await h.call('hub.tlsCertificates', {});
      if (certs.source !== 'local-ca' || typeof certs.caCertPem !== 'string' || certs.caCertPem === '') return ok({ available: false, reason: 'not-local-ca' });
      let cert: X509Certificate;
      try { cert = new X509Certificate(certs.caCertPem); } catch { return fail('invalid-certificate', 'The Hub sent a root certificate that could not be read.'); }
      if (!cert.ca) return fail('invalid-certificate', 'The Hub sent a certificate that is not a certificate authority.');
      const der = Buffer.from(cert.raw);
      const token = deps.randomToken();
      pending = { token, der, expiresAt: deps.now() + ROOT_CERT_TOKEN_TTL_MS };
      return ok({ available: true, fingerprint: sha256Fingerprint(der), subject: cert.subject.replace(/\n/g, ', '), notAfter: cert.validTo, confirmToken: token });
    } catch (error) {
      if (error instanceof DeviceStoreError) return fail(error.code, error.message);
      return fail('internal', 'The Hub root certificate could not be read.');
    }
  });

  ipcMain.handle('dude:hub:rootCertificate:install', async (event, ...args: unknown[]): Promise<DesktopHubResult<{ readonly installed: true }>> => {
    if (!own(event.sender)) return fail('forbidden', 'forbidden');
    if (args.length !== 1 || typeof args[0] !== 'string' || !TOKEN.test(args[0])) return fail('bad-request', 'Invalid request.');
    if (deps.platform !== 'win32') return fail('unsupported-platform', 'Installing a root certificate is only supported on Windows.');
    const plan = pending;
    pending = null; // single use: a failed or repeated attempt needs a fresh preview
    if (!plan || plan.token !== args[0]) return fail('stale-preview', 'Review the certificate again before installing it.');
    if (deps.now() > plan.expiresAt) return fail('expired', 'The confirmation expired. Review the certificate again.');
    if (installing) return fail('busy', 'An installation is already in progress.');
    installing = true;
    let dir: string | null = null;
    try {
      dir = await deps.makeTempDir();
      const file = join(dir, 'dude-hub-root.cer');
      await deps.writeFile(file, plan.der);
      const { code } = await deps.exec('certutil', ['-user', '-addstore', 'Root', file]);
      return code === 0 ? ok({ installed: true }) : fail('install-failed', `Windows did not add the certificate (certutil exit code ${code}). It may have been declined.`);
    } catch {
      return fail('install-failed', 'The certificate could not be installed.');
    } finally {
      installing = false;
      if (dir) await deps.removeDir(dir).catch(() => undefined);
    }
  });
}
