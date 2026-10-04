import { X509Certificate } from 'node:crypto';
import { HUB_PROTOCOL_VERSION } from '@dude/contracts/hub';
import type { DiagnosticCheck, HubDiagnosticsCertificate, HubDiagnosticsReport } from '@dude/contracts/hub';
import { missingSubjectAltNames, certificateSubjectAltNames } from '../tls/names.js';
import { spkiSha256 } from '../tls/self-signed.js';
import type { TlsCertificateSource } from '../tls/ca-public.js';
import { dnsNamesToResolve, listHubAddresses, resolveNames, stableAddresses } from './addresses.js';
import type { InterfaceMap, NameResolution } from './addresses.js';
import type { NativeListener } from '../service/listeners.js';

/**
 * The single Hub endpoint-diagnostics engine (PD-060). It takes gathered facts (no database handle, no shell) and builds the
 * report plus the readiness checklist. Each check is `verified` when the Hub observed the fact itself, `claimed` when it is
 * operator configuration the Hub cannot confirm, and `not-checked` for anything that needs a running Hub or external reachability.
 * Nothing here reads or returns key material, tokens or file contents; certificates contribute only public fields.
 */
export const RENEWAL_WINDOW_DAYS = 30;
export const FIREWALL_RULE_LABEL = 'DUDE Hub (LAN)';
export const PUBLIC_RULE_LABEL = 'DUDE Hub (Public)';

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
  /** The `DUDE Hub (Public)` rule as inspected and validated by the elevated `doctor`; null/undefined when not inspected (the owner route never shells out). */
  publicFirewall?: { present: boolean; problems: string[] } | null;
  /** The native-listener audit from the elevated `doctor`; null/undefined when not audited. */
  nativeListeners?: { exposed: readonly NativeListener[]; desktopLan?: readonly NativeListener[]; partial: boolean } | null;
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
  /** The machine's own interfaces (default `os.networkInterfaces`). */
  interfaces?: () => InterfaceMap;
  /** The last recorded address set (meta `hub_addresses`); null/undefined when none is known (offline `doctor`). */
  storedAddresses?: readonly string[] | null;
  /** DNS resolution of the configured names (default: the system resolver, uncached); the Hub route injects a 60 s cache. */
  resolveDns?: (names: readonly string[]) => Promise<NameResolution[]>;
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

export const NOT_CHECKED_HERE = 'Run `dude-hub doctor` as administrator on the Hub machine.';

const where = (l: Pick<NativeListener, 'address' | 'port'>): string => (l.address.includes(':') ? `[${l.address}]:${l.port}` : `${l.address}:${l.port}`);

/** `public-firewall-rule`: the validated Public-profile inbound rule that public mode needs (PD-068). */
export function publicFirewallCheck(input: { platform: NodeJS.Platform; bind: string; mode: 'private' | 'public'; fact: DiagnosticsHostFacts['publicFirewall'] }): DiagnosticCheck {
  const label = 'Firewall allows public access';
  const id = 'public-firewall-rule';
  if (input.platform !== 'win32' || input.bind === 'container') return check(id, label, 'info', 'not-checked', 'Windows Firewall rules apply only to a Hub on Windows; on other hosts open the port in your own firewall.');
  const fact = input.fact;
  if (input.mode !== 'public') {
    if (fact?.present) return check(id, label, 'info', 'verified', `Not public mode, but the "${PUBLIC_RULE_LABEL}" rule exists and opens the Hub port on every network profile.`, 'dude-hub network firewall public off');
    return check(id, label, 'info', fact ? 'verified' : 'not-checked', 'Not applicable: the Hub is not in public mode.');
  }
  if (fact === undefined || fact === null) return check(id, label, 'info', 'not-checked', NOT_CHECKED_HERE, 'dude-hub doctor');
  if (!fact.present) return check(id, label, 'warn', 'verified', `Public mode is configured but the "${PUBLIC_RULE_LABEL}" rule is missing; Internet clients cannot connect.`, 'dude-hub network firewall public on');
  if (fact.problems.length > 0) return check(id, label, 'warn', 'verified', `The "${PUBLIC_RULE_LABEL}" rule exists but is not valid: ${fact.problems.join(' ')}`, 'dude-hub network firewall public on');
  return check(id, label, 'pass', 'verified', `The "${PUBLIC_RULE_LABEL}" rule exists: inbound allow on the Hub port, every profile, program-scoped.`);
}

/** `native-ports-exposed`: the Device Agent must never listen on TCP; a desktop LAN listener is a deliberate exception (PD-068). */
export function nativePortsCheck(input: { platform: NodeJS.Platform; fact: DiagnosticsHostFacts['nativeListeners'] }): DiagnosticCheck {
  const label = 'No native app port is exposed';
  const id = 'native-ports-exposed';
  if (input.platform !== 'win32') return check(id, label, 'info', 'not-checked', 'The native Agent and desktop app listener audit runs only on Windows.');
  const fact = input.fact;
  if (fact === undefined || fact === null) return check(id, label, 'info', 'not-checked', NOT_CHECKED_HERE, 'dude-hub doctor');
  if (fact.exposed.length > 0) {
    const text = fact.exposed.map((l) => (l.scope === 'loopback'
      ? `dude-agent.exe (pid ${l.pid}) listens on loopback ${where(l)}; the Agent must not open any TCP port`
      : `dude-agent.exe (pid ${l.pid}) is listening on ${where(l)}, reachable from the network`)).join('; ');
    return check(id, label, 'fail', 'verified', `${text}. The Device Agent talks over a named pipe only.`, 'Stop the Agent and report this build; do not forward or allow that port.');
  }
  const lan = fact.desktopLan ?? [];
  if (lan.length > 0) return check(id, label, 'info', 'verified', `The desktop app listens on ${lan.map(where).join(', ')} (the optional LAN collaboration server, started by the user). The Agent has no TCP listener.`);
  if (fact.partial) return check(id, label, 'info', 'not-checked', 'The listener list could not be read completely, so the audit is inconclusive.', 'dude-hub doctor');
  return check(id, label, 'pass', 'verified', 'No Device Agent TCP listener and no desktop-app network listener was found.');
}

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

  // public-firewall-rule and native-ports-exposed (PD-068); host facts come only from the elevated doctor
  checks.push(publicFirewallCheck({ platform: deps.platform, bind: config.bind, mode: config.exposure.mode, fact: host.publicFirewall }));
  checks.push(nativePortsCheck({ platform: deps.platform, fact: host.nativeListeners }));

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

  // address-stability (reads the machine's own interfaces; never an external lookup)
  const addresses = listHubAddresses(deps.interfaces?.());
  const stable = stableAddresses(addresses);
  const listing = addresses.length === 0 ? 'none' : addresses.map((a) => `${a.address} (${a.scope})`).join(', ');
  const drift = deps.storedAddresses ? deps.storedAddresses.join('|') !== stable.join('|') : false;
  const hasPublic = addresses.some((a) => a.scope === 'public');
  if (config.exposure.mode === 'public' && !hasPublic) {
    checks.push(check('address-stability', 'Address stability', 'warn', 'verified', `Addresses on this machine: ${listing}. None is a public address: inbound Internet connections need a router port-forward to this machine or a public IPv6 address, and carrier-grade NAT (100.64.0.0/10) cannot accept inbound connections at all.`, 'Forward the port on the router, use a public IPv6 address, or put the Hub behind a reverse proxy or tunnel you control.'));
  } else if (drift) {
    checks.push(check('address-stability', 'Address stability', 'warn', 'verified', `The address set changed since it was last recorded. Now: ${listing}.`, 'If DNS names point at this machine, update them (router DDNS client or your DNS provider); then run "dude-hub tls names add <name>" and "dude-hub tls acme issue" if the names changed.'));
  } else checks.push(check('address-stability', 'Address stability', 'pass', 'verified', `Addresses on this machine: ${listing}.`));

  // dns-resolution (the DNS answer is verified; reachability is never claimed)
  const dnsNames = dnsNamesToResolve(config.exposure);
  if (dnsNames.length === 0) checks.push(check('dns-resolution', 'DNS points at this machine', 'info', 'not-checked', 'No DNS names are configured.'));
  else {
    const resolutions = await (deps.resolveDns ?? ((names) => resolveNames(names)))(dnsNames).catch((): NameResolution[] => dnsNames.map((name) => ({ name, addresses: [], error: 'failed' as const })));
    const local = new Set(addresses.map((a) => a.address));
    const failed = resolutions.filter((r) => r.addresses.length === 0);
    const foreign = resolutions.filter((r) => r.addresses.length > 0 && r.addresses.some((a) => !local.has(a)));
    const lines = resolutions.map((r) => `${r.name} -> ${r.addresses.length > 0 ? r.addresses.join(', ') : (r.error ?? 'failed')}`).join('; ');
    if (failed.length > 0) checks.push(check('dns-resolution', 'DNS points at this machine', 'warn', 'verified', `${failed.map((r) => r.name).join(', ')} did not resolve (${failed.map((r) => r.error ?? 'failed').join(', ')}). ${lines}.`, 'Create or fix the DNS record for the name at your DNS provider or router DDNS client.'));
    else if (foreign.length > 0) checks.push(check('dns-resolution', 'DNS points at this machine', 'info', 'verified', `${lines}. These addresses are not on any interface of this machine: it is behind NAT or a port forward, or behind a reverse proxy, or DNS is stale. That cannot be verified from the machine itself; use the external reachability probe.`));
    else checks.push(check('dns-resolution', 'DNS points at this machine', 'pass', 'verified', `DNS points at this machine. ${lines}. This does not confirm the port is reachable from outside.`));
  }

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
