import { X509Certificate, createPrivateKey } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { loadOrCreateHubConfig } from '../../config/hub-config.js';
import type { CaKeyProtector } from '../ca-key-protector.js';
import { ImportError, parseCertificatePems, validateImport } from '../import.js';
import { certificateSubjectAltNames } from '../names.js';
import { spkiSha256 } from '../self-signed.js';
import type { AcmeClientOptions } from './acme-client.js';
import { acmeOrderInProgress, directoryHost, failureDetail, orderAcmeChain } from './acme-issue.js';
import type { Http01ListenerFactory } from './acme-issue.js';

export const ACME_RENEWAL_WINDOW_DAYS = 30;
export const ACME_RENEWAL_INTERVAL_MS = 12 * 3600_000;
export const ACME_RETRY_BACKOFF_MS = 6 * 3600_000;
export const ACME_LAST_ATTEMPT_META = 'acme_last_attempt';

export interface AcmeRenewalOptions {
  db: Db;
  tlsDir: string;
  /** `hub.json`: directory, contact and http port come from its `exposure.acme` block. */
  configFile: string;
  /** The ACME account key protector (the renewal job is one of the three allowed key users). */
  protector: CaKeyProtector;
  applySecureContext: (context: { key: string; cert: string; minVersion: 'TLSv1.2' }) => void;
  /** Audits `tls.renewed` (success) or `tls.acme-failed` (failure); never secrets. */
  audit: (event: 'tls.renewed' | 'tls.acme-failed', outcome: 'success' | 'failure', detail: Record<string, unknown>) => void;
  /** Refreshes the stored leaf of the active pin (the SPKI pin is unchanged by a renewal). */
  recordCertificate?: (leafPem: string, spkiSha256: string) => void;
  now?: () => number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  listenerFactory?: Http01ListenerFactory;
  clientOptions?: Partial<AcmeClientOptions>;
}

export type AcmeRenewalResult =
  | { renewed: true; notAfter: string; spkiSha256: string }
  | { renewed: false; reason: 'not-acme' | 'not-due' | 'backoff' | 'busy' | 'no-certificate' | 'failed'; problem?: string };

/**
 * Re-orders the ACTIVE certificate with the SAME leaf key when its source is `acme` and it expires within 30 days, so the SPKI
 * pin never changes and no dual-pin rotation is needed. A failure never replaces the active certificate and is retried no
 * sooner than 6 hours later. The http-01 listener is bound only while an order runs.
 */
export function createAcmeRenewal(options: AcmeRenewalOptions) {
  const now = options.now ?? Date.now;
  const keyFile = path.join(options.tlsDir, 'key.pem');
  const certFile = path.join(options.tlsDir, 'cert.pem');
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  async function runOnce(): Promise<AcmeRenewalResult> {
    const row = options.db.prepare("SELECT source FROM tls_pins WHERE state = 'active' LIMIT 1").get() as { source: string } | undefined;
    if (row?.source !== 'acme') return { renewed: false, reason: 'not-acme' };
    if (!existsSync(certFile) || !existsSync(keyFile)) return { renewed: false, reason: 'no-certificate' };
    const certPem = readFileSync(certFile, 'utf8');
    const active = new X509Certificate(parseCertificatePems(certPem)[0] ?? certPem);
    if (new Date(active.validTo).getTime() - now() > ACME_RENEWAL_WINDOW_DAYS * 86_400_000) return { renewed: false, reason: 'not-due' };
    const last = Number(getMeta(options.db, ACME_LAST_ATTEMPT_META) ?? 0);
    if (Number.isFinite(last) && last > 0 && now() - last < ACME_RETRY_BACKOFF_MS) return { renewed: false, reason: 'backoff' };
    if (acmeOrderInProgress()) return { renewed: false, reason: 'busy' };

    setMeta(options.db, ACME_LAST_ATTEMPT_META, String(now()));
    const names = certificateSubjectAltNames(certPem).filter((name) => isIP(name) === 0);
    let host = 'unknown';
    try {
      const acme = loadOrCreateHubConfig(options.configFile).exposure.acme;
      if (acme === undefined) throw new Error('ACME is not configured in hub.json (exposure.acme).');
      host = directoryHost(acme.directoryUrl);
      const keyPem = readFileSync(keyFile, 'utf8');
      const order = await orderAcmeChain({
        names, directoryUrl: acme.directoryUrl, ...(acme.email !== undefined ? { email: acme.email } : {}), httpPort: acme.httpPort ?? 80,
        tlsDir: options.tlsDir, protector: options.protector, leafKey: createPrivateKey(keyPem),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}), ...(options.listenerFactory ? { listenerFactory: options.listenerFactory } : {}),
        ...(options.clientOptions ? { clientOptions: options.clientOptions } : {}),
      });
      const valid = validateImport({ certPem: order.chainPem, keyPem, requiredNames: names, now: now() });
      const spki = spkiSha256(certPem);
      if (valid.spkiSha256 !== spki) throw new Error('Renewal produced a different key; refusing to replace the certificate.');
      const temp = `${certFile}.renew-tmp`;
      writeFileSync(temp, valid.certChainPem, { mode: 0o600 });
      renameSync(temp, certFile);
      options.applySecureContext({ key: keyPem, cert: valid.certChainPem, minVersion: 'TLSv1.2' });
      options.recordCertificate?.(parseCertificatePems(valid.certChainPem)[0]!, spki);
      options.audit('tls.renewed', 'success', { notAfter: valid.notAfter, spki, source: 'acme' });
      return { renewed: true, notAfter: valid.notAfter, spkiSha256: spki };
    } catch (error) {
      const detail = failureDetail(error instanceof ImportError ? new Error(error.message) : error);
      options.audit('tls.acme-failed', 'failure', { names, directoryHost: host, ...detail, renewal: true });
      return { renewed: false, reason: 'failed', problem: detail.problem };
    }
  }

  const safeRun = async (): Promise<void> => {
    if (running) return;
    running = true;
    try { await runOnce(); } catch { /* retried at the next interval; the old certificate keeps serving */ } finally { running = false; }
  };

  return {
    runOnce,
    /** Runs now and then every interval; the timer is unref'd so it never keeps the process alive. */
    start(): void {
      if (timer !== undefined) return;
      void safeRun();
      timer = setInterval(() => void safeRun(), options.intervalMs ?? ACME_RENEWAL_INTERVAL_MS);
      timer.unref();
    },
    stop(): void {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}

export type AcmeRenewal = ReturnType<typeof createAcmeRenewal>;
