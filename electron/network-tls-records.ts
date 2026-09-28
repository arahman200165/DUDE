/**
 * Parses the plaintext portion of a TLS handshake from the raw bytes DUDE's own socket received,
 * for the Handshake Timeline (Phase 28 item 22). It reads record and handshake framing only — no
 * decryption — so under TLS 1.3 it sees ServerHello and then one encrypted blob, and under TLS 1.2
 * it sees each handshake message including the server's CertificateRequest (used to confirm mTLS).
 */
export interface TlsRecordEvent {
  readonly atMs: number;
  readonly contentType: string;
  readonly handshakeType?: string;
  readonly length: number;
  readonly detail?: string;
}

const CONTENT_TYPES: Record<number, string> = { 20: 'ChangeCipherSpec', 21: 'Alert', 22: 'Handshake', 23: 'ApplicationData', 24: 'Heartbeat' };
const HANDSHAKE_TYPES: Record<number, string> = {
  0: 'HelloRequest', 1: 'ClientHello', 2: 'ServerHello', 4: 'NewSessionTicket', 5: 'EndOfEarlyData', 6: 'HelloRetryRequest', 8: 'EncryptedExtensions',
  11: 'Certificate', 12: 'ServerKeyExchange', 13: 'CertificateRequest', 14: 'ServerHelloDone', 15: 'CertificateVerify', 16: 'ClientKeyExchange', 20: 'Finished', 24: 'KeyUpdate',
};
const ALERT_LEVELS: Record<number, string> = { 1: 'warning', 2: 'fatal' };
const ALERT_DESCRIPTIONS: Record<number, string> = { 0: 'close_notify', 40: 'handshake_failure', 42: 'bad_certificate', 46: 'certificate_unknown', 48: 'unknown_ca', 70: 'protocol_version', 80: 'internal_error', 112: 'unrecognized_name', 116: 'certificate_required', 120: 'no_application_protocol' };

/** Interpret concatenated inbound record bytes with per-chunk timestamps. */
export function parseServerRecords(chunks: readonly { readonly bytes: Buffer; readonly atMs: number }[]): { events: TlsRecordEvent[]; certificateRequested: boolean; alert?: { level: string; description: string } } {
  const buffer = Buffer.concat(chunks.map((chunk) => chunk.bytes));
  const timeAt = (offset: number): number => {
    let seen = 0;
    for (const chunk of chunks) { seen += chunk.bytes.length; if (offset < seen) return chunk.atMs; }
    return chunks.at(-1)?.atMs ?? 0;
  };
  const events: TlsRecordEvent[] = [];
  let certificateRequested = false;
  let alert: { level: string; description: string } | undefined;
  let at = 0;
  let sawEncrypted = false;
  while (at + 5 <= buffer.length) {
    const type = buffer[at];
    const version = `${buffer[at + 1]}.${buffer[at + 2]}`;
    const length = buffer.readUInt16BE(at + 3);
    const body = buffer.subarray(at + 5, at + 5 + length);
    if (body.length < length) break;
    const contentType = CONTENT_TYPES[type] ?? `type ${type}`;
    const atMs = timeAt(at);
    if (type === 21 && body.length >= 2) {
      alert = { level: ALERT_LEVELS[body[0]] ?? String(body[0]), description: ALERT_DESCRIPTIONS[body[1]] ?? `alert ${body[1]}` };
      if (body[1] === 116) certificateRequested = true;
      events.push({ atMs, contentType, length, detail: `${alert.level} ${alert.description}` });
    } else if (type === 22 && !sawEncrypted) {
      // Walk the handshake messages inside this record (plaintext until the first encrypted record).
      let inner = 0;
      let plaintext = true;
      while (inner + 4 <= body.length) {
        const handshakeType = body[inner];
        const messageLength = (body[inner + 1] << 16) | (body[inner + 2] << 8) | body[inner + 3];
        const name = HANDSHAKE_TYPES[handshakeType];
        if (!name || inner + 4 + messageLength > body.length) { plaintext = false; break; }
        if (handshakeType === 13) certificateRequested = true;
        events.push({ atMs, contentType, handshakeType: name, length: messageLength, ...(handshakeType === 2 ? { detail: negotiatedVersion(body.subarray(inner + 4, inner + 4 + messageLength)) } : {}) });
        inner += 4 + messageLength;
        if (handshakeType === 2) sawEncrypted = true; // After ServerHello, TLS 1.3 encrypts the rest.
      }
      if (!plaintext) events.push({ atMs, contentType, length, detail: 'encrypted handshake' });
    } else {
      if (type === 23) sawEncrypted = true;
      events.push({ atMs, contentType: type === 22 ? 'Handshake' : contentType, length, detail: type === 22 ? 'encrypted handshake' : version });
    }
    at += 5 + length;
  }
  return { events, certificateRequested, ...(alert ? { alert } : {}) };
}

/** TLS 1.3 puts the real version in the supported_versions extension; ServerHello.legacy_version stays 3.3. */
function negotiatedVersion(serverHello: Buffer): string {
  try {
    let at = 2 + 32; // legacy_version + random
    at += 1 + serverHello[at]; // session id
    at += 2; // cipher suite
    at += 1; // compression
    if (at + 2 > serverHello.length) return 'TLS 1.2';
    const extensionsLength = serverHello.readUInt16BE(at); at += 2;
    const end = at + extensionsLength;
    while (at + 4 <= end) {
      const extType = serverHello.readUInt16BE(at);
      const extLength = serverHello.readUInt16BE(at + 2);
      if (extType === 43 && extLength >= 2) { const v = serverHello.readUInt16BE(at + 4); return v === 0x0304 ? 'TLS 1.3' : `0x${v.toString(16)}`; }
      at += 4 + extLength;
    }
  } catch { /* fall through */ }
  return 'TLS 1.2';
}
