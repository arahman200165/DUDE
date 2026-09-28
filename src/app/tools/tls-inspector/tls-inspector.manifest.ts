import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'tls-inspector',
  title: 'TLS Connection Inspector',
  shortTitle: 'TLS Inspector',
  description: 'Inspect a live TLS handshake: negotiated version, cipher, ALPN, SNI behavior, the presented chain with dual-store trust and hostname verdicts, a handshake timeline, HTTP/3, mTLS, and configuration weaknesses.',
  category: 'security',
  keywords: ['tls', 'ssl', 'handshake', 'cipher suite', 'alpn', 'sni', 'https', 'certificate', 'chain', 'hostname mismatch', 'http/3', 'quic', 'mtls', 'client certificate', 'handshake timeline'],
  route: '/tools/tls-inspector',
  load: () => import('./tls-inspector').then((m) => m.TlsInspectorTool),
  status: 'experimental',
  consequenceClass: ['secret-management', 'authentication'],
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'the host and port you enter (a live TLS handshake with the SNI you choose); the HTTP/3 tab reaches the same host over QUIC via the Chromium network stack' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
