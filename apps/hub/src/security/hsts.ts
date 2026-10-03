import type { Db } from '@dude/sqlite-store';
import { describeCertificateSource } from '../tls/ca-public.js';

/**
 * HSTS is sent only when browsers can actually trust the origin: the active certificate came from the Hub's local CA
 * (once installed) or was imported, or the Hub sits behind a reverse proxy that terminates TLS with its own
 * certificate (PD-057). On a self-signed certificate a one-year HSTS would lock a browser into an error page it cannot
 * click through, so it is omitted.
 */
export function createHstsPolicy(options: { db: Db; tlsDir: string; proxy: boolean }): () => boolean {
  if (options.proxy) return () => true;
  const cache = new Map<string, boolean>();
  return () => {
    const row = options.db.prepare("SELECT spki_sha256, cert_pem, source FROM tls_pins WHERE state = 'active' LIMIT 1").get() as
      | { spki_sha256: string; cert_pem: string; source: string }
      | undefined;
    if (row === undefined) return false;
    const key = `${row.spki_sha256}:${row.source}`;
    let trustable = cache.get(key);
    if (trustable === undefined) {
      trustable = row.source === 'imported' || row.source === 'local-ca' || describeCertificateSource(options.tlsDir, row.cert_pem).source === 'local-ca';
      cache.set(key, trustable);
    }
    return trustable;
  };
}
