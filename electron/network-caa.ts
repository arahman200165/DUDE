import type { DnsAnswer } from './network-dns';

/**
 * CAA analysis (RFC 8659), shared by DNS Lookup's CAA view and the HTTPS Configuration Analyzer.
 * The relevant record set is the first non-empty CAA RRset found climbing from the name toward
 * (but excluding) the root; `issuewild` governs wildcard names when present, otherwise `issue`.
 */
export interface CaaProperty {
  readonly critical: boolean;
  readonly tag: string;
  readonly value: string;
  readonly issuer?: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

export interface CaaAnalysis {
  readonly queriedName: string;
  readonly relevantName: string | null;
  readonly climbed: readonly { readonly name: string; readonly rcode: string; readonly count: number }[];
  readonly properties: readonly CaaProperty[];
  readonly issuers: readonly string[];
  readonly wildcardIssuers: readonly string[];
  readonly iodef: readonly string[];
  /** true = no restriction (no relevant CAA set), false = nobody may issue, array = allowed CAs. */
  readonly nonWildcardPolicy: 'unrestricted' | 'none-allowed' | 'restricted';
  readonly wildcardPolicy: 'unrestricted' | 'none-allowed' | 'restricted';
  readonly blockedByCriticalUnknownTag: boolean;
  readonly caCheck?: { readonly ca: string; readonly nonWildcard: boolean; readonly wildcard: boolean };
  readonly warnings: readonly string[];
}

const KNOWN_TAGS = new Set(['issue', 'issuewild', 'iodef', 'issuemail', 'issuevmc', 'contactemail', 'contactphone']);

export function parseCaaValue(presentation: string): { critical: boolean; tag: string; value: string } | null {
  const match = /^(\d+)\s+([A-Za-z0-9]+)\s+"(.*)"$/s.exec(presentation.trim());
  if (!match) return null;
  return { critical: (Number(match[1]) & 128) !== 0, tag: match[2].toLowerCase(), value: match[3] };
}

export function parseIssueValue(value: string): { issuer: string; parameters: Record<string, string> } {
  const [domain, ...rest] = value.split(';');
  const parameters: Record<string, string> = {};
  for (const part of rest.join(';').split(/[;\s]+/).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq > 0) parameters[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return { issuer: domain.trim().toLowerCase(), parameters };
}

/** Parent names to climb, from the name itself up to (excluding) the root. */
export function climbNames(name: string): string[] {
  const labels = name.toLowerCase().replace(/\.$/, '').replace(/^\*\./, '').split('.').filter(Boolean);
  return labels.map((_, index) => labels.slice(index).join('.')).slice(0, 16);
}

export function analyzeCaaSet(queriedName: string, relevantName: string | null, answers: readonly DnsAnswer[], climbed: CaaAnalysis['climbed'], ca?: string): CaaAnalysis {
  const warnings: string[] = [];
  const properties: CaaProperty[] = [];
  for (const answer of answers.filter((entry) => entry.type === 'CAA')) {
    const parsed = parseCaaValue(answer.value);
    if (!parsed) { warnings.push(`Unparseable CAA record: ${answer.value}`); continue; }
    if (parsed.tag === 'issue' || parsed.tag === 'issuewild') {
      const { issuer, parameters } = parseIssueValue(parsed.value);
      properties.push({ ...parsed, issuer, parameters });
    } else properties.push(parsed);
    if (!KNOWN_TAGS.has(parsed.tag)) warnings.push(`Unknown CAA tag "${parsed.tag}"${parsed.critical ? ' marked critical — compliant CAs must refuse to issue.' : ' (ignored by CAs).'}`);
    if (parsed.tag === 'iodef' && !/^(mailto:|https?:)/i.test(parsed.value)) warnings.push(`iodef value "${parsed.value}" is not a mailto: or http(s): URL.`);
  }
  const issue = properties.filter((property) => property.tag === 'issue');
  const issuewild = properties.filter((property) => property.tag === 'issuewild');
  const blockedByCriticalUnknownTag = properties.some((property) => property.critical && !KNOWN_TAGS.has(property.tag));
  const policy = (set: readonly CaaProperty[]): CaaAnalysis['nonWildcardPolicy'] =>
    !set.length ? 'unrestricted' : set.every((property) => !property.issuer) ? 'none-allowed' : 'restricted';
  const nonWildcardPolicy = relevantName === null ? 'unrestricted' : issue.length ? policy(issue) : properties.length ? 'unrestricted' : 'unrestricted';
  const wildcardSource = issuewild.length ? issuewild : issue;
  const wildcardPolicy = relevantName === null ? 'unrestricted' : wildcardSource.length ? policy(wildcardSource) : 'unrestricted';
  if (relevantName && !issue.length && !issuewild.length) warnings.push('The relevant CAA set has no issue/issuewild property, so it does not restrict issuance.');
  if (issue.some((property) => property.issuer && !/^[a-z0-9.-]+$/.test(property.issuer!))) warnings.push('An issuer domain contains characters that are not valid in a domain name.');
  const allows = (set: readonly CaaProperty[], candidate: string) => !set.length || set.some((property) => property.issuer === candidate);
  const normalizedCa = ca?.trim().toLowerCase();
  return {
    queriedName, relevantName, climbed, properties,
    issuers: [...new Set(issue.flatMap((property) => property.issuer ? [property.issuer] : []))],
    wildcardIssuers: [...new Set(wildcardSource.flatMap((property) => property.issuer ? [property.issuer] : []))],
    iodef: properties.filter((property) => property.tag === 'iodef').map((property) => property.value),
    nonWildcardPolicy, wildcardPolicy, blockedByCriticalUnknownTag,
    ...(normalizedCa ? { caCheck: {
      ca: normalizedCa,
      nonWildcard: !blockedByCriticalUnknownTag && (relevantName === null || allows(issue, normalizedCa)),
      wildcard: !blockedByCriticalUnknownTag && (relevantName === null || allows(wildcardSource, normalizedCa)),
    } } : {}),
    warnings,
  };
}

/** CA identifiers commonly found in CAA `issue` values (offered as suggestions; not a trust list). */
export const KNOWN_CA_IDENTIFIERS: readonly string[] = [
  'letsencrypt.org', 'pki.goog', 'digicert.com', 'sectigo.com', 'comodoca.com', 'globalsign.com', 'amazon.com',
  'amazontrust.com', 'godaddy.com', 'starfieldtech.com', 'entrust.net', 'buypass.com', 'ssl.com', 'zerossl.com',
  'certum.pl', 'harica.gr', 'actalis.it', 'identrust.com', 'microsoft.com', 'telia.com',
];
