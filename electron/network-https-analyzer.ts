import type { NetworkRequest } from '../src/app/core/platform/network-types';
import { fetchLiveChain, weaknessReport } from './network-tls-inspect';
import { enumerateTls } from './network-tls-enumerate';
import { tlsHandshake, analyzeHostname } from './network-tls';
import { caaClimb } from './network-dns-tools';
import { queryDns } from './network-dns';

/**
 * HTTPS Configuration Analyzer (DUDE_PRD.md §21 Phase 28 item 15). One composite run that reuses
 * the TLS enumeration, chain/hostname validation, OCSP stapling, CAA analysis, and HTTPS/SVCB
 * records, plus the HTTP→HTTPS redirect and HSTS headers. It reports pass/warn/fail findings with
 * explanations and no letter grade. Because it enumerates, it is gated behind preview/confirm.
 */
export interface Finding { readonly id: string; readonly status: 'pass' | 'warn' | 'fail' | 'info' | 'untested'; readonly title: string; readonly detail?: string; readonly reference?: string; readonly link?: string; readonly linkLabel?: string }

export interface HttpsAnalysisResult {
  readonly host: string;
  readonly port: number;
  readonly findings: readonly Finding[];
  readonly summary: { readonly fail: number; readonly warn: number; readonly pass: number };
  readonly supportedVersions: readonly string[];
  readonly redirectsToHttps: boolean | null;
  readonly hsts: string | null;
}

async function httpHeaders(url: string, signal: AbortSignal): Promise<{ status: number; headers: Headers; finalUrl: string } | { error: string }> {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
    return { status: response.status, headers: response.headers, finalUrl: response.headers.get('location') ?? url };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}

export async function analyzeHttps(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void): Promise<HttpsAnalysisResult> {
  const host = (request.target ?? '').trim();
  const port = request.port ?? 443;
  const findings: Finding[] = [];
  const total = 5;

  // 1) TLS versions and ciphers (the enumeration; this is why the analyzer is gated).
  const enumeration = await enumerateTls({ kind: 'tls-enumeration', target: host, port, sni: request.sni }, signal, () => {});
  progress(1, total);
  for (const finding of enumeration.weaknesses) findings.push({ ...finding, link: '/tools/tls-inspector', linkLabel: 'TLS Inspector' });
  if (enumeration.supportedVersions.includes('TLSv1.3')) findings.push({ id: 'tls13', status: 'pass', title: 'TLS 1.3 is offered' });

  // 2) Chain, hostname, expiry, and OCSP stapling.
  const chain = await fetchLiveChain({ kind: 'live-chain', target: host, port, sni: request.sni }, signal, () => {});
  progress(2, total);
  for (const verdict of chain.trust) findings.push({ id: `trust-${verdict.store}`, status: verdict.trusted ? 'pass' : 'fail', title: `${verdict.store === 'mozilla' ? 'Mozilla roots' : 'Windows store'}: ${verdict.trusted ? 'trusted' : 'not trusted'}`, detail: verdict.reason, link: '/tools/live-certificate-chain', linkLabel: 'Chain' });
  findings.push({ id: 'hostname', status: chain.hostname.matches ? 'pass' : 'fail', title: chain.hostname.matches ? `Hostname matches (${chain.hostname.matchedName})` : 'Hostname does not match the certificate', detail: chain.hostname.reasons.join(' ') });
  const leaf = chain.chain[0];
  if (leaf) findings.push(leaf.daysRemaining < 0 ? { id: 'expiry', status: 'fail', title: `Certificate expired ${-leaf.daysRemaining} day(s) ago` } : leaf.daysRemaining <= 30 ? { id: 'expiry', status: 'warn', title: `Certificate expires in ${leaf.daysRemaining} day(s)` } : { id: 'expiry', status: 'pass', title: `Certificate valid for ${leaf.daysRemaining} more day(s)` });
  try {
    const staple = await tlsHandshake({ host, port, servername: request.sni?.trim() || host, requestOcsp: true, timeoutMs: 8000 }, signal);
    findings.push({ id: 'ocsp-staple', status: staple.ocspStapleBase64 ? 'pass' : 'warn', title: staple.ocspStapleBase64 ? 'OCSP stapling enabled' : 'No OCSP stapling', detail: staple.ocspStapleBase64 ? undefined : 'Stapling lets clients check revocation without a separate request.', link: '/tools/revocation-inspector', linkLabel: 'Revocation' });
  } catch { /* staple check is best-effort */ }
  progress(3, total);

  // 3) HTTP→HTTPS redirect and HSTS.
  const httpResult = await httpHeaders(`http://${host}/`, signal);
  let redirectsToHttps: boolean | null = null;
  if ('error' in httpResult) findings.push({ id: 'http-redirect', status: 'info', title: 'Plain HTTP (port 80) not reachable', detail: httpResult.error });
  else {
    const location = httpResult.headers.get('location') ?? '';
    redirectsToHttps = httpResult.status >= 300 && httpResult.status < 400 && location.startsWith('https://');
    findings.push(redirectsToHttps ? { id: 'http-redirect', status: 'pass', title: 'HTTP redirects to HTTPS' } : { id: 'http-redirect', status: httpResult.status < 300 ? 'warn' : 'info', title: httpResult.status < 300 ? 'HTTP does not redirect to HTTPS' : `HTTP returned ${httpResult.status}`, detail: location ? `Location: ${location}` : undefined });
  }
  const httpsResult = await httpHeaders(`https://${host}${port !== 443 ? `:${port}` : ''}/`, signal);
  let hsts: string | null = null;
  if (!('error' in httpsResult)) {
    hsts = httpsResult.headers.get('strict-transport-security');
    if (hsts) {
      const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? '0');
      const subdomains = /includeSubDomains/i.test(hsts);
      const preload = /preload/i.test(hsts);
      findings.push(maxAge < 10_368_000
        ? { id: 'hsts', status: 'warn', title: `HSTS max-age is ${maxAge}s (below the ~120-day preload minimum)`, detail: hsts }
        : { id: 'hsts', status: 'pass', title: `HSTS enabled (max-age ${maxAge}s${subdomains ? ', includeSubDomains' : ''}${preload ? ', preload' : ''})` });
      if (!subdomains) findings.push({ id: 'hsts-subdomains', status: 'info', title: 'HSTS does not set includeSubDomains' });
    } else findings.push({ id: 'hsts', status: 'warn', title: 'No HSTS header', detail: 'Strict-Transport-Security tells browsers to use HTTPS only.', reference: 'RFC 6797' });
  }
  progress(4, total);

  // 4) CAA and HTTPS/SVCB records.
  try {
    const caa = await caaClimb({ kind: 'dns-lookup', target: host, recordType: 'CAA' }, signal);
    findings.push(caa.relevantName ? { id: 'caa', status: 'pass', title: `CAA present at ${caa.relevantName}`, detail: caa.issuers.length ? `Issuance restricted to: ${caa.issuers.join(', ')}` : 'No issue property.', link: '/tools/dns-lookup', linkLabel: 'DNS' } : { id: 'caa', status: 'info', title: 'No CAA record', detail: 'Any CA may issue for this name.', link: '/tools/dns-lookup', linkLabel: 'DNS' });
  } catch { /* CAA best-effort */ }
  try {
    const https = await queryDns({ kind: 'dns-lookup', target: host, recordType: 'HTTPS' }, signal);
    const records = https.answers.filter((answer) => answer.type === 'HTTPS');
    if (records.length) findings.push({ id: 'svcb', status: records.some((record) => /h3/.test(record.value)) ? 'pass' : 'info', title: 'HTTPS/SVCB record published', detail: records.map((record) => record.value).join(' | ') });
  } catch { /* SVCB best-effort */ }
  progress(5, total);

  void weaknessReport;
  void analyzeHostname;
  const summary = { fail: findings.filter((f) => f.status === 'fail').length, warn: findings.filter((f) => f.status === 'warn').length, pass: findings.filter((f) => f.status === 'pass').length };
  return { host, port, findings, summary, supportedVersions: enumeration.supportedVersions, redirectsToHttps, hsts };
}
