import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import { AcmeIssueError, validateAcmeNames } from '../tls/acme/acme-issue.js';

/**
 * Internet-exposure readiness (PD-066). A pure evaluation of a diagnostics report: `blockers` stop `network mode public`,
 * `warnings` are shown but do not. The report must have been built as if the mode were already public (the admin method does
 * that), so the host facts and address checks are evaluated for public exposure.
 */
/** The exact phrase an operator types to expose the Hub to the Internet (PD-066). */
export const PUBLIC_EXPOSURE_PHRASE = 'EXPOSE HUB TO THE INTERNET';

export interface Blocker { id: string; reason: string; fix: string }

export interface ReadinessResult { ready: boolean; blockers: Blocker[]; warnings: Blocker[] }

export interface ReadinessOptions {
  /** `--accept-unverified-reachability`: a missing or stale external-reachability record becomes a warning. */
  acceptUnverifiedReachability?: boolean;
  /** True on a Windows service Hub: the firewall rule must have been inspected by the elevated CLI, or readiness is not provable. */
  hostFactsRequired?: boolean;
}

/** An entry is a public DNS name when a public CA could issue for it (the ACME name rules). */
export function isPublicDnsName(name: string): boolean {
  try {
    validateAcmeNames([name]);
    return true;
  } catch (error) {
    if (error instanceof AcmeIssueError) return false;
    throw error;
  }
}

/** Certificates this close to expiry block readiness, so a public exposure never starts with an expiring certificate. */
export const READINESS_MIN_DAYS_LEFT = 7;

export function evaluatePublicReadiness(report: HubDiagnosticsReport, options: ReadinessOptions = {}): ReadinessResult {
  const blockers: Blocker[] = [];
  const warnings: Blocker[] = [];
  const checks = new Map(report.checks.map((c) => [c.id, c]));
  const proxy = report.exposure.proxy;
  const cert = report.certificate;

  // The certificate browsers and phones outside the network will see.
  if (proxy === null) {
    if (cert === null) {
      blockers.push({ id: 'certificate-trusted', reason: 'The Hub has no active certificate.', fix: 'dude-hub tls acme issue --name <your-public-name>' });
    } else if (cert.source !== 'acme' && cert.source !== 'imported') {
      const kind = cert.source === 'local-ca' ? 'private (local CA)' : 'self-signed';
      blockers.push({
        id: 'certificate-trusted',
        reason: `The active certificate is ${kind}. Browsers and phones outside your network cannot trust a private CA or a self-signed certificate.`,
        fix: 'dude-hub tls acme issue --name <your-public-name>  (or: dude-hub tls import --cert <file> --key <file>, or: dude-hub network proxy on ... behind a proxy with a public certificate), then dude-hub tls activate',
      });
    }
  }

  // A public DNS name.
  const hosts = new Set(report.exposure.names);
  if (report.exposure.canonicalOrigin) {
    try { hosts.add(new URL(report.exposure.canonicalOrigin).hostname.replace(/^\[|\]$/g, '')); } catch { /* ignored: validated at config load */ }
  }
  if (![...hosts].some(isPublicDnsName)) {
    blockers.push({
      id: 'public-dns-name',
      reason: 'No public DNS name is configured. IP addresses and local names (.local, .lan, .internal, single labels) cannot be used by outside clients or certified by a public CA.',
      fix: 'dude-hub tls names add <name.example.com>',
    });
  }

  // Certificate coverage and expiry.
  if (cert !== null) {
    if (proxy === null && cert.missingNames.length > 0) {
      blockers.push({
        id: 'certificate-covers-names',
        reason: `The active certificate does not cover: ${cert.missingNames.join(', ')}.`,
        fix: cert.nextSpkiSha256 !== null ? 'dude-hub tls activate' : 'dude-hub tls acme issue (or reissue/import a certificate that covers every configured name), then dude-hub tls activate',
      });
    }
    if (cert.daysLeft < 0) {
      blockers.push({ id: 'certificate-expiry', reason: `The certificate expired on ${cert.notAfter.slice(0, 10)}.`, fix: cert.source === 'acme' ? 'dude-hub tls acme status' : cert.source === 'imported' ? 'dude-hub tls import --cert <file> --key <file>' : 'dude-hub tls rotate' });
    } else if (cert.daysLeft < READINESS_MIN_DAYS_LEFT) {
      blockers.push({ id: 'certificate-expiry', reason: `The certificate expires in ${cert.daysLeft} day${cert.daysLeft === 1 ? '' : 's'} (${cert.notAfter.slice(0, 10)}).`, fix: cert.source === 'acme' ? 'dude-hub tls acme status' : cert.source === 'imported' ? 'dude-hub tls import --cert <file> --key <file>' : 'dude-hub tls rotate' });
    }
  }

  // The owner.
  const auth = checks.get('authentication-active');
  if (auth !== undefined && auth.status !== 'pass') {
    blockers.push({ id: 'authentication-active', reason: auth.status === 'warn' ? 'No owner has been set up. An Internet-reachable Hub must not wait for first-run setup.' : 'Owner authentication could not be confirmed.', fix: auth.fix ?? 'dude-hub setup-token' });
  }

  // Windows host facts (supplied by the elevated CLI).
  const firewall = checks.get('public-firewall-rule');
  if (firewall !== undefined && (firewall.status === 'warn' || firewall.status === 'fail')) {
    blockers.push({ id: 'public-firewall-rule', reason: firewall.detail, fix: 'dude-hub network firewall public on --force  (the rule must exist before the mode is switched)' });
  } else if (options.hostFactsRequired === true && firewall !== undefined && firewall.basis === 'not-checked') {
    blockers.push({ id: 'public-firewall-rule', reason: 'The public firewall rule could not be inspected from here.', fix: 'Run "dude-hub network mode public" from an elevated terminal on the Hub machine.' });
  }
  const native = checks.get('native-ports-exposed');
  if (native !== undefined && native.status === 'fail') {
    blockers.push({ id: 'native-ports-exposed', reason: native.detail, fix: native.fix ?? 'Stop the Agent and report this build.' });
  }

  // The bind must be able to accept inbound traffic.
  if (report.exposure.bind === 'loopback' && proxy === null) {
    blockers.push({
      id: 'inbound-bind',
      reason: 'The Hub listens on loopback only and no reverse proxy is configured, so it cannot accept Internet traffic.',
      fix: 'dude-hub network lan on  (or: dude-hub network proxy on --trusted <cidr> --public-origin https://<name>)',
    });
  }

  // External reachability: observed by the Hub itself, fresh within 7 days.
  const reach = checks.get('external-reachability');
  if (reach === undefined || reach.status !== 'pass') {
    const entry: Blocker = {
      id: 'external-reachability',
      reason: `${reach?.detail ?? 'The Hub has not been reached from outside.'} A fresh verification (no older than 7 days) is required.`,
      fix: 'Open the Hub web Settings > Endpoint and use "Verify" from a device on cellular data, or "Test from this device" in the desktop app; or pass --accept-unverified-reachability.',
    };
    if (options.acceptUnverifiedReachability === true) warnings.push({ ...entry, reason: `${entry.reason} Accepted by the operator.` });
    else blockers.push(entry);
  }

  // Non-blocking.
  const stability = checks.get('address-stability');
  if (stability !== undefined && stability.status === 'warn') warnings.push({ id: 'address-stability', reason: stability.detail, fix: stability.fix ?? '' });
  const dns = checks.get('dns-resolution');
  if (dns !== undefined && (dns.status === 'warn' || dns.status === 'info')) warnings.push({ id: 'dns-resolution', reason: dns.detail, fix: dns.fix ?? 'Check the DNS records for your names.' });
  if (cert !== null && !cert.hsts) {
    warnings.push({ id: 'hsts', reason: 'HTTP Strict Transport Security is not active, so browsers are not told to refuse plain-HTTP and downgraded connections.', fix: 'Use an ACME or imported certificate (HSTS turns on automatically with a trusted certificate).' });
  }

  return { ready: blockers.length === 0, blockers, warnings };
}

/** Plain-text report for the CLI: each blocker and warning with the fix beside it. */
export function formatReadiness(result: ReadinessResult): string {
  const lines: string[] = [];
  if (result.blockers.length > 0) {
    lines.push('Blockers (Internet exposure is not allowed until these are resolved):');
    for (const b of result.blockers) lines.push(`  [BLOCKER] ${b.id}: ${b.reason}`, `            fix: ${b.fix}`);
  }
  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of result.warnings) lines.push(`  [WARN] ${w.id}: ${w.reason}${w.fix ? `\n         fix: ${w.fix}` : ''}`);
  }
  if (result.ready) lines.unshift('Ready: no readiness blockers.');
  return lines.join('\n');
}
