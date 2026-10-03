import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CaKeyProtector } from './ca-key-protector.js';
import { isIssuedByCa, readCaCertPem } from './ca-public.js';
import { issueLeafFromCa, loadCaKey } from './local-ca.js';
import { certificateSubjectAltNames } from './names.js';
import { spkiSha256 } from './self-signed.js';

export const RENEWAL_WINDOW_DAYS = 30;
export const RENEWAL_INTERVAL_MS = 12 * 3600_000;

export interface LeafRenewalOptions {
  tlsDir: string;
  hubInstanceId: string;
  protector: CaKeyProtector;
  applySecureContext: (context: { key: string; cert: string; minVersion: 'TLSv1.2' }) => void;
  /** Audits `tls.renewed`; detail is the new notAfter and SPKI pin only. */
  audit: (event: 'tls.renewed', detail: { notAfter: string; spki: string }) => void;
  /** Lets the Hub refresh the stored copy of the active certificate (the SPKI pin is unchanged by a renewal). */
  recordCertificate?: (certPem: string, spkiSha256: string) => void;
  now?: () => number;
  intervalMs?: number;
}

export interface RenewalResult { renewed: boolean; notAfter?: string; spkiSha256?: string }

/**
 * Re-certifies the ACTIVE leaf with the SAME key when it was issued by the local CA and expires within 30 days, so the
 * pinned SPKI never changes and a renewal needs no dual-pin rotation. Self-signed and imported certificates are never touched.
 * Key-use boundary: this module and the admin-pipe CA commands are the only callers of the protector's unprotect.
 */
export function createLeafRenewal(options: LeafRenewalOptions) {
  const now = options.now ?? Date.now;
  const keyFile = path.join(options.tlsDir, 'key.pem');
  const certFile = path.join(options.tlsDir, 'cert.pem');
  let timer: NodeJS.Timeout | undefined;

  function runOnce(): RenewalResult {
    const caCertPem = readCaCertPem(options.tlsDir);
    if (caCertPem === null || !existsSync(certFile) || !existsSync(keyFile)) return { renewed: false };
    const certPem = readFileSync(certFile, 'utf8');
    if (!isIssuedByCa(certPem, caCertPem)) return { renewed: false };
    const active = new X509Certificate(certPem);
    if (new Date(active.validTo).getTime() - now() > RENEWAL_WINDOW_DAYS * 86_400_000) return { renewed: false };

    const keyPem = readFileSync(keyFile, 'utf8');
    const issued = issueLeafFromCa({
      caCertPem, caKey: loadCaKey(options.tlsDir, options.protector), hubInstanceId: options.hubInstanceId,
      names: certificateSubjectAltNames(certPem), leafKeyPem: keyPem, now: new Date(now()),
    });
    const spki = spkiSha256(issued.certPem);
    if (spki !== spkiSha256(certPem)) throw new Error('Renewal produced a different key; refusing to replace the certificate.');
    const temp = `${certFile}.renew-tmp`;
    writeFileSync(temp, issued.certPem, { mode: 0o600 });
    renameSync(temp, certFile);
    options.applySecureContext({ key: keyPem, cert: issued.certPem, minVersion: 'TLSv1.2' });
    options.recordCertificate?.(issued.certPem, spki);
    const notAfter = new Date(new X509Certificate(issued.certPem).validTo).toISOString();
    options.audit('tls.renewed', { notAfter, spki });
    return { renewed: true, notAfter, spkiSha256: spki };
  }

  const safeRun = (): void => {
    try { runOnce(); } catch { /* retried at the next interval; the old certificate keeps serving */ }
  };

  return {
    runOnce,
    /** Runs now and then every interval; the timer is unref'd so it never keeps the process alive. */
    start(): void {
      if (timer !== undefined) return;
      safeRun();
      timer = setInterval(safeRun, options.intervalMs ?? RENEWAL_INTERVAL_MS);
      timer.unref();
    },
    stop(): void {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}

export type LeafRenewal = ReturnType<typeof createLeafRenewal>;
