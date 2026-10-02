/**
 * Pure, framework-free heuristic URL safety checks. Every finding is a signal, not a verdict —
 * each `message` is worded to avoid overclaiming, per Phase 15 item 7's own framing
 * ("heuristic checks: punycode homograph risk, suspicious TLD, etc.").
 */
import { HomographAnalysis, analyzeDomainHomographRisk } from "../../shared/utils/url-homograph.js";

export type FindingSeverity = 'info' | 'warning';

export interface SafetyFinding {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly message: string;
}

export interface UrlSafetyReport {
  readonly ok: true;
  readonly url: string;
  readonly hostname: string;
  readonly findings: readonly SafetyFinding[];
  readonly homograph: HomographAnalysis | null;
}

export type UrlSafetyResult = UrlSafetyReport | { readonly ok: false; readonly error: string };

// TLDs repeatedly cited in phishing/abuse research for cheap or unrestricted registration,
// or for visually resembling a file extension (.zip, .mov) — a weak, contextual signal only.
const SUSPICIOUS_TLDS = new Set([
  'zip',
  'mov',
  'top',
  'xyz',
  'work',
  'click',
  'country',
  'gq',
  'tk',
  'ml',
  'cf',
  'ga',
  'link',
  'support',
  'account',
  'verify',
]);

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isIPv4(hostname: string): boolean {
  const match = IPV4_REGEX.exec(hostname);
  return match !== null && match.slice(1).every((octet) => Number(octet) <= 255);
}

function isIPv6(hostname: string): boolean {
  return hostname.startsWith('[') && hostname.endsWith(']');
}

export function inspectUrlSafety(raw: string): UrlSafetyResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter a URL to inspect.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Not a valid absolute URL.' };
  }

  const findings: SafetyFinding[] = [];
  const hostname = url.hostname;
  const numericHost = isIPv4(hostname) || isIPv6(hostname);

  if (url.username !== '' || url.password !== '') {
    findings.push({
      id: 'userinfo',
      severity: 'warning',
      message:
        'URL contains userinfo (user@ or user:pass@) before the host — a classic trick to make a link look like it points to a different, trusted host.',
    });
  }

  if (numericHost) {
    findings.push({ id: 'ip-literal', severity: 'warning', message: 'Host is a raw IP address rather than a domain name.' });
  }

  let homograph: HomographAnalysis | null = null;
  if (!numericHost) {
    const analysis = analyzeDomainHomographRisk(hostname);
    if (analysis.ok) {
      homograph = analysis;
      if (analysis.mixedScriptRisk) {
        findings.push({
          id: 'mixed-script',
          severity: 'warning',
          message: 'Host contains a label mixing multiple Unicode scripts (e.g. Latin mixed with Cyrillic look-alikes) — a common IDN homograph technique.',
        });
      }
      if (analysis.isPunycode) {
        findings.push({ id: 'punycode', severity: 'info', message: `Host is Punycode-encoded — decodes to "${analysis.unicodeDomain}".` });
      }
    }

    const labels = hostname.split('.');
    const tld = labels[labels.length - 1]?.toLowerCase();
    if (tld && SUSPICIOUS_TLDS.has(tld)) {
      findings.push({
        id: 'suspicious-tld',
        severity: 'info',
        message: `".${tld}" is a TLD repeatedly flagged in phishing research (cheap/unrestricted registration, or easily confused with a file extension) — not proof of anything by itself.`,
      });
    }

    if (labels.length > 4) {
      findings.push({
        id: 'deep-subdomain',
        severity: 'info',
        message: `Host has ${labels.length} labels — an unusually deep subdomain chain is sometimes used to bury the real domain (e.g. "real-bank.com.login.example.net").`,
      });
    }
  }

  return { ok: true, url: url.href, hostname, findings, homograph };
}
