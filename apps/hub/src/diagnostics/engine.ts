import { X509Certificate } from 'node:crypto';
import { HUB_PROTOCOL_VERSION } from '@dude/contracts/hub';
import type { DiagnosticCheck, HubDiagnosticsCertificate, HubDiagnosticsReport } from '@dude/contracts/hub';
import { missingSubjectAltNames, certificateSubjectAltNames } from '../tls/names.js';
import { spkiSha256 } from '../tls/self-signed.js';
import type { TlsCertificateSource } from '../tls/ca-public.js';

/**
 * The single Hub endpoint-diagnostics engine (PD-060). It takes gathered facts (no database handle, no shell) and builds the
 * report plus the readiness checklist. Each check is `verified` when the Hub observed the fact itself, `claimed` when it is
 * operator configuration the Hub cannot confirm, and `not-checked` for anything that needs a running Hub or external reachability.
 * Nothing here reads or returns key material, tokens or file contents; certificates contribute only public fields.
 */
export const RENEWAL_WINDOW_DAYS = 30;
export const FIREWALL_RULE_LABEL = 'DUDE Hub (LAN)';

export interface DiagnosticsCertificateFacts {
  /** The active certificate (PEM text). Only public fields are read from it. */
  pem: string;
  source: TlsCertificateSource;
  nextSpkiSha256: string | null;
  pendingAcks: number;
  chainLength: number;
  ca: { fingerprintSha256: string; notAfter: string; permitted: { dns: string[]; ip: string[] } } | null;
  hsts: boolean;
}

export interface DiagnosticsHostFacts {
  /** `sc query` state on Windows; undefined elsewhere or when it could not be read. */
  serviceState?: string;
  /** Whether the Private-profile LAN rule exists; null when it could not be determined. */
  firewallPresent: boolean | null;
}

export interface DiagnosticsDeps {
  now: number;
  hubVersion: string;
  /** True when a Hub process produced the facts (route, admin method); false for an offline `doctor`. */
  running: boolean;
  /** `container` when the bind is container; `service` when the Windows service is running; otherwise `foreground`. */
  serviceMode: HubDiagnosticsReport['service']['mode'];
  uptimeSeconds: number;
  schemaVersion: number;
  platform: NodeJS.Platform;
  config: {
    port: number;
    bind: HubDiagnosticsReport['exposure']['bind'];
    bindAddress: string;
    exposure: { mode: 'private' | 'public'; names: readonly string[]; canonicalOrigin?: string; proxy?: { trusted: readonly string[]; publicOrigin: string } };
  };
  /** The certificate names the configuration calls for (built-ins, operator names, interface addresses). */
  wantedNames: readonly string[];
  certificate: DiagnosticsCertificateFacts | null;
  proxyPins: { active: string | null; next: string | null };
  /** Null when the database was not consulted. */
  ownerExists: boolean | null;
  realtime: { available: boolean; owner: number; device: number };
  /** Cached firewall and service facts (the engine never shells out). */
  host: () => Promise<DiagnosticsHostFacts>;
}

const DAY_MS = 86_400_000;

function certificateSection(facts: DiagnosticsCertificateFacts, wanted: readonly string[], now: number): HubDiagnosticsCertificate {
  const cert = new X509Certificate(facts.pem);
  const notAfter = new Date(cert.validTo);
  const automatic = facts.source === 'local-ca' || facts.source === 'acme';
  const windowStart = notAfter.getTime() - RENEWAL_WINDOW_DAYS * DAY_MS;
  return {
    source: facts.source,
    subject: cert.subject.replace(/^CN=/, '').replace(/\r?\n/g, ', '),
    sans: certificateSubjectAltNames(facts.pem),
    missingNames: missingSubjectAltNames(facts.pem, wanted),
    notBefore: new Date(cert.validFrom).toISOString(),
    notAfter: notAfter.toISOString(),
    daysLeft: Math.floor((notAfter.getTime() - now) / DAY_MS),
    spkiSha256: spkiSha256(facts.pem),
    nextSpkiSha256: facts.nextSpkiSha256,
    pendingAcks: facts.pendingAcks,
    chainLength: facts.chainLength,
    ca: facts.ca,
    // The renewal jobs re-certify a CA-issued leaf, or re-order an ACME one, with the same key every 12 h once inside the 30-day window.
    renewal: { automatic, nextCheckAt: automatic && windowStart > now ? new Date(windowStart).toISOString() : null },
    hsts: facts.hsts,
  };
}

const check = (id: string, label: string, status: DiagnosticCheck['status'], basis: DiagnosticCheck['basis'], detail: string, fix?: string): DiagnosticCheck =>
  ({ id, label, status, basis, detail, ...(fix !== undefined ? { fix } : {}) });

/** Builds the report. Pure given `deps` except for the (cached, injectable) `deps.host()` call. */
export async function collectDiagnostics(deps: DiagnosticsDeps): Promise<HubDiagnosticsReport> {
  const host = await deps.host().catch((): DiagnosticsHostFacts => ({ firewallPresent: null }));
  const { config, running } = deps;
  const certificate = deps.certificate ? certificateSection(deps.certificate, deps.wantedNames, deps.now) : null;
  const win = deps.platform === 'win32';
  const firewallApplicable = win && config.bind === 'lan';
  const proxy = config.exposure.proxy ?? null;

  const checks: DiagnosticCheck[] = [];

  // service-running
  if (running) checks.push(check('service-running', 'Hub is running', 'pass', 'verified', `Answering for ${deps.uptimeSeconds} s (${deps.serviceMode}).`));
  else if (host.serviceState === 'running') checks.push(check('service-running', 'Hub is running', 'warn', 'verified', 'The service is running but its admin channel is not reachable from this terminal.', 'Re-run from an elevated (Administrator) terminal.'));
  else checks.push(check('service-running', 'Hub is running', 'fail', win ? 'verified' : 'not-checked', `The Hub is not running${host.serviceState ? ` (service ${host.serviceState})` : ''}.`, win ? 'dude-hub service start' : 'dude-hub run'));

  // https-configured
  if (running) checks.push(check('https-configured', 'HTTPS is configured', 'pass', 'verified', `Listening with TLS on ${config.bindAddress}:${config.port}.`));
  else checks.push(check('https-configured', 'HTTPS is configured', certificate ? 'info' : 'fail', 'not-checked', certificate ? 'A certificate exists; the listener needs a running Hub to confirm.' : 'No certificate is on disk yet.', certificate ? undefined : 'dude-hub run'));

  // certificate-valid
  if (certificate === null) checks.push(check('certificate-valid', 'Certificate is valid', 'fail', 'verified', 'No active certificate was found.', 'dude-hub run'));
  else {
    const renewFix = certificate.source === 'imported' ? 'dude-hub tls import --cert <file> --key <file>' : certificate.source === 'acme' ? 'dude-hub tls acme status' : 'dude-hub tls rotate';
    if (certificate.daysLeft < 0) checks.push(check('certificate-valid', 'Certificate is valid', 'fail', 'verified', `The certificate expired on ${certificate.notAfter.slice(0, 10)}.`, renewFix));
    else if (certificate.daysLeft < RENEWAL_WINDOW_DAYS && !certificate.renewal.automatic) checks.push(check('certificate-valid', 'Certificate is valid', 'warn', 'verified', `Expires in ${certificate.daysLeft} days (${certificate.notAfter.slice(0, 10)}); it is not renewed automatically.`, renewFix));
    else checks.push(check('certificate-valid', 'Certificate is valid', 'pass', 'verified', `Valid until ${certificate.notAfter.slice(0, 10)} (${certificate.daysLeft} days${certificate.renewal.automatic ? ', renewed automatically' : ''}).`));
  }

  // certificate-covers-names
  if (certificate === null) checks.push(check('certificate-covers-names', 'Certificate covers every name', 'info', 'not-checked', 'No certificate to compare.'));
  else if (certificate.missingNames.length > 0) {
    const staged = certificate.nextSpkiSha256 !== null;
    checks.push(check('certificate-covers-names', 'Certificate covers every name', 'warn', 'verified', `The active certificate does not cover: ${certificate.missingNames.join(', ')}.`, staged ? 'dude-hub tls activate' : `dude-hub tls names add ${certificate.missingNames[0]}`));
  } else checks.push(check('certificate-covers-names', 'Certificate covers every name', 'pass', 'verified', 'Every configured name and address is in the certificate.'));

  // certificate-trustable
  if (certificate === null) checks.push(check('certificate-trustable', 'Certificate is browser-trusted', 'info', 'not-checked', 'No certificate.'));
  else if (certificate.source === 'imported') checks.push(check('certificate-trustable', 'Certificate is browser-trusted', 'pass', 'claimed', 'Imported certificate; browsers trust it if its chain is publicly or locally trusted.'));
  else if (certificate.source === 'acme') checks.push(check('certificate-trustable', 'Certificate is browser-trusted', 'pass', 'claimed', 'Issued through ACME; browsers trust it if the CA is publicly trusted (the chain is not yet verified against public roots).'));
  else if (certificate.source === 'local-ca') checks.push(check('certificate-trustable', 'Certificate is browser-trusted', 'info', 'claimed', 'Issued by the Hub local CA; install the root certificate on each device or browser that opens the Hub.', 'dude-hub tls ca export'));
  else {
    const exposed = config.bind !== 'loopback' || config.exposure.names.length > 0;
    checks.push(check('certificate-trustable', 'Certificate is browser-trusted', exposed ? 'warn' : 'info', 'claimed', 'Self-signed: browsers will warn. Devices pin it, but a browser needs a trusted root.', 'dude-hub tls ca init'));
  }

  // next-pin-pending
  if (certificate?.nextSpkiSha256) checks.push(check('next-pin-pending', 'Staged certificate pin', 'info', 'verified', `A next certificate is staged; ${certificate.pendingAcks} device(s) have not acknowledged it.`, 'dude-hub tls activate'));
  else checks.push(check('next-pin-pending', 'Staged certificate pin', running ? 'pass' : 'info', running ? 'verified' : 'not-checked', running ? 'No certificate is staged.' : 'Staged pins are read from the running Hub.'));

  // authentication-active
  if (deps.ownerExists === null) checks.push(check('authentication-active', 'Owner authentication is active', 'info', 'not-checked', 'Owner state is read from the running Hub.'));
  else if (deps.ownerExists) checks.push(check('authentication-active', 'Owner authentication is active', 'pass', 'verified', 'An owner exists; every API route needs a session or device token.'));
  else checks.push(check('authentication-active', 'Owner authentication is active', 'warn', 'verified', 'No owner exists yet; the Hub waits for first-run setup.', 'dude-hub setup-token'));

  // realtime-available
  if (running) checks.push(check('realtime-available', 'Realtime channel is available', deps.realtime.available ? 'pass' : 'fail', 'verified', deps.realtime.available ? `${deps.realtime.owner} owner and ${deps.realtime.device} device connection(s).` : 'The realtime channel is not registered.'));
  else checks.push(check('realtime-available', 'Realtime channel is available', 'info', 'not-checked', 'Realtime health needs a running Hub.'));

  // firewall-rule
  if (firewallApplicable) {
    if (host.firewallPresent === true) checks.push(check('firewall-rule', 'Firewall allows the LAN port', 'pass', 'verified', `The "${FIREWALL_RULE_LABEL}" Private-profile rule exists.`));
    else if (host.firewallPresent === false) checks.push(check('firewall-rule', 'Firewall allows the LAN port', 'warn', 'verified', `LAN mode is on but the "${FIREWALL_RULE_LABEL}" rule is missing; other devices cannot connect.`, 'dude-hub network lan on'));
    else checks.push(check('firewall-rule', 'Firewall allows the LAN port', 'warn', 'claimed', 'The firewall rule could not be read.', 'dude-hub network lan on'));
  } else if (config.bind === 'loopback') checks.push(check('firewall-rule', 'Firewall allows the LAN port', 'info', 'verified', 'Loopback only: no inbound firewall rule is needed.'));
  else checks.push(check('firewall-rule', 'Firewall allows the LAN port', 'info', 'claimed', `Bound to ${config.bindAddress}; the host firewall is outside this Hub's view, so confirm that port ${config.port} is allowed.`));

  // exposure-mode
  if (config.exposure.mode === 'public') checks.push(check('exposure-mode', 'Exposure mode', 'fail', 'verified', 'Public exposure is not released until Phase 31F.', 'dude-hub network mode private'));
  else checks.push(check('exposure-mode', 'Exposure mode', 'info', 'verified', 'Private: the Hub is for you and your devices.'));

  // proxy-trust
  if (proxy === null) checks.push(check('proxy-trust', 'Reverse-proxy trust', 'info', 'verified', 'No reverse proxy is configured.'));
  else if (deps.proxyPins.active === null) {
    checks.push(check('proxy-trust', 'Reverse-proxy trust', 'warn', 'claimed', `Proxy mode trusts ${proxy.trusted.length} peer(s) for ${proxy.publicOrigin}, but no proxy certificate pin is active.`, 'dude-hub tls proxy-pin add <pem-or-spki>'));
  } else checks.push(check('proxy-trust', 'Reverse-proxy trust', 'pass', 'claimed', `Proxy mode trusts ${proxy.trusted.length} peer(s) for ${proxy.publicOrigin}; a proxy pin is active.`));

  // container-host-allowlist
  if (config.bind === 'container' && config.exposure.names.length === 0) {
    checks.push(check('container-host-allowlist', 'Host allowlist', 'warn', 'verified', 'Container mode with no configured names: any Host header is accepted.', 'dude-hub tls names add <name>'));
  } else checks.push(check('container-host-allowlist', 'Host allowlist', 'info', 'verified', config.bind === 'container' ? `${config.exposure.names.length} name(s) configured.` : 'Not a container.'));

  // external-reachability
  checks.push(check('external-reachability', 'Reachable from outside', 'info', 'not-checked', 'Verified in Phase 31F.'));

  return {
    generatedAt: new Date(deps.now).toISOString(),
    hubVersion: deps.hubVersion,
    protocolVersion: HUB_PROTOCOL_VERSION,
    schemaVersion: deps.schemaVersion,
    service: { mode: deps.serviceMode, uptimeSeconds: deps.uptimeSeconds, ...(host.serviceState !== undefined ? { state: host.serviceState } : {}) },
    exposure: {
      mode: config.exposure.mode,
      publicReleased: false,
      bind: config.bind,
      bindAddress: config.bindAddress,
      port: config.port,
      names: [...config.exposure.names],
      canonicalOrigin: proxy?.publicOrigin ?? config.exposure.canonicalOrigin ?? null,
      proxy: proxy ? { trusted: [...proxy.trusted], publicOrigin: proxy.publicOrigin } : null,
    },
    certificate,
    proxyPins: deps.proxyPins,
    firewall: { applicable: firewallApplicable, ruleName: firewallApplicable ? FIREWALL_RULE_LABEL : null, present: firewallApplicable ? host.firewallPresent : null, profile: firewallApplicable && host.firewallPresent ? 'private' : null },
    realtime: { available: deps.realtime.available, connections: { owner: deps.realtime.owner, device: deps.realtime.device } },
    checks,
  };
}

/** Plain-text checklist for the human `dude-hub doctor` output. */
export function formatChecks(report: Pick<HubDiagnosticsReport, 'checks'>): string {
  const tag: Record<DiagnosticCheck['status'], string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', info: 'INFO' };
  return report.checks
    .map((c) => `[${tag[c.status]}] ${c.label} (${c.basis}): ${c.detail}${c.fix ? `\n       fix: ${c.fix}` : ''}`)
    .join('\n');
}
