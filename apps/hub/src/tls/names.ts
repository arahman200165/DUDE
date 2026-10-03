import { X509Certificate } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import os from 'node:os';
import { normalizeHubName } from '../config/hub-config.js';
import type { HubConfig } from '../config/hub-config.js';
import { subjectAltNames } from './self-signed.js';

export type NetworkInterfaces = ReturnType<typeof os.networkInterfaces>;

const isLinkLocalV6 = (address: string): boolean => /^fe[89ab][0-9a-f]:/i.test(address);

/** Canonical comparison form: lowercase DNS names, compressed IPv6. */
export function canonicalSanName(name: string): string {
  const lower = name.toLowerCase();
  if (isIPv6(lower)) return new URL(`http://[${lower}]/`).hostname.slice(1, -1);
  return lower;
}

/**
 * Subject alternative names for the Hub certificate: the built-ins (localhost, host name, loopback), the configured
 * operator names (host part only; ports are not certificate names) and, in lan/container mode, the addresses of
 * every non-internal interface (IPv4 and IPv6 except link-local fe80::/10).
 */
export function computeSubjectAltNames(config: Pick<HubConfig, 'bind' | 'exposure'>, interfaces: NetworkInterfaces = os.networkInterfaces()): string[] {
  const extra: string[] = config.exposure.names.map((name) => normalizeHubName(name).host);
  if (config.bind === 'lan' || config.bind === 'container') {
    for (const list of Object.values(interfaces)) {
      for (const info of list ?? []) {
        if (info.internal) continue;
        const address = info.address.split('%')[0] ?? info.address;
        const v6 = info.family === 'IPv6' || (info.family as unknown) === 6;
        if (v6 ? !isIPv6(address) || isLinkLocalV6(address) : !isIPv4(address)) continue;
        extra.push(address);
      }
    }
  }
  const seen = new Set<string>();
  return subjectAltNames(extra).filter((name) => {
    const key = canonicalSanName(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** DNS names and IP addresses in a certificate's SAN extension (compared in canonical form). */
export function certificateSubjectAltNames(certPem: string): string[] {
  const text = new X509Certificate(certPem).subjectAltName ?? '';
  const names: string[] = [];
  for (const part of text.split(/,\s*/)) {
    const match = /^(DNS|IP Address):(.*)$/.exec(part.trim());
    if (match?.[2] !== undefined) names.push(canonicalSanName(match[1] === 'DNS' ? match[2].replace(/^"|"$/g, '') : match[2]));
  }
  return names;
}

/** The wanted names the certificate does not cover. */
export function missingSubjectAltNames(certPem: string, wanted: readonly string[]): string[] {
  const have = new Set(certificateSubjectAltNames(certPem));
  return wanted.filter((name) => !have.has(canonicalSanName(name)));
}

/** Configured exposure names that are DNS names (host part; IP literals are not CA name constraints). */
export function configuredDnsNames(config: Pick<HubConfig, 'exposure'>): string[] {
  return config.exposure.names.map((name) => normalizeHubName(name).host).filter((host) => !isIPv4(host) && !isIPv6(host));
}
