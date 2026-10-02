import type { Db } from '@dude/sqlite-store';

/**
 * Ensure the serving certificate's SPKI is recorded as the 'active' pin. A different previously active pin is
 * retired; real rotation (next pin, acknowledgements) arrives later.
 */
export function ensureActiveTlsPin(db: Db, identity: { spkiSha256: string; certPem: string }, now: () => Date = () => new Date()): void {
  const at = now().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE tls_pins SET state = 'retired' WHERE state = 'active' AND spki_sha256 <> ?").run(identity.spkiSha256);
    const existing = db.prepare('SELECT state FROM tls_pins WHERE spki_sha256 = ?').get(identity.spkiSha256) as { state: string } | undefined;
    if (!existing) {
      db.prepare("INSERT INTO tls_pins(spki_sha256, cert_pem, key_ref, state, created_at, activated_at) VALUES(?, ?, NULL, 'active', ?, ?)")
        .run(identity.spkiSha256, identity.certPem, at, at);
    } else if (existing.state !== 'active') {
      db.prepare("UPDATE tls_pins SET state = 'active', activated_at = ? WHERE spki_sha256 = ?").run(at, identity.spkiSha256);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
}
