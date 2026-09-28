import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'https-config-analyzer',
  title: 'HTTPS Configuration Analyzer',
  shortTitle: 'HTTPS Analyzer',
  description: 'One composite HTTPS check: TLS versions and ciphers, chain and hostname, expiry, OCSP stapling, HTTP→HTTPS redirect, HSTS, CAA, and HTTPS/SVCB — as pass/warn/fail findings, with no letter grade.',
  category: 'security',
  keywords: ['https', 'tls', 'ssl', 'analyzer', 'hsts', 'redirect', 'caa', 'ocsp', 'configuration', 'security headers', 'svcb'],
  route: '/tools/https-config-analyzer',
  load: () => import('./https-config-analyzer').then((m) => m.HttpsConfigAnalyzerTool),
  status: 'experimental',
  consequenceClass: ['network-scanning'],
  persistence: { input: 'none', preferences: 'none' },
  network: { required: true, detail: 'the host you enter: a TLS enumeration and handshake, http:// and https:// HEAD requests, and DNS lookups (CAA, HTTPS/SVCB)' },
  capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
  io: { accepts: ['text'], produces: ['json'] },
};
