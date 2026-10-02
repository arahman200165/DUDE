import type { NetworkRequest } from "@dude/contracts/core/platform/network-types";

/**
 * §11.2 disclosure for the network workbench's "Contacting:" strip — the exact host, resolver,
 * or service a live check will reach, derived from the request the tool would send. Pure, so the
 * strip updates as the user types and the list is unit-tested against the main process defaults
 * (`apps/desktop/network-dns.ts` `defaultServer`, the comparator presets, crt.sh).
 */
export const DNS_PRESETS: readonly { readonly label: string; readonly server: string }[] = [
  { label: 'Cloudflare', server: '1.1.1.1' },
  { label: 'Google', server: '8.8.8.8' },
  { label: 'Quad9', server: '9.9.9.9' },
];
export const CRT_SH = 'https://crt.sh';

function resolverLabel(server: string | undefined, transport: NetworkRequest['resolverTransport']): string {
  const kind = transport ?? 'classic';
  if (server) return kind === 'classic' ? `DNS server ${server}` : kind === 'doh' ? `DoH ${server}` : `DoT ${server}`;
  return kind === 'doh' ? 'DoH https://cloudflare-dns.com/dns-query' : kind === 'dot' ? 'DoT one.one.one.one:853' : 'your system DNS servers';
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export function describeContacts(request: NetworkRequest | null): readonly string[] {
  if (!request) return [];
  const target = request.target?.trim() || '(target)';
  const port = request.port ?? 443;
  switch (request.kind) {
    case 'dns-lookup': case 'reverse-dns': case 'dnssec-inspector': case 'email-auth': {
      const out = [resolverLabel(request.resolver, request.resolverTransport)];
      if (request.kind === 'dnssec-inspector') out.push('queries walk from the root zone down to the target zone through that resolver');
      return out;
    }
    case 'dns-propagation': {
      const out = request.includePresets === false ? [] : DNS_PRESETS.map((preset) => `${preset.label} ${preset.server}`);
      if (request.includeSystem) out.push('your system DNS servers');
      for (const entry of request.resolvers ?? []) out.push(`${entry.label || 'Custom'}: ${resolverLabel(entry.server, entry.transport)}`);
      if (request.resolver) out.push(`Custom ${request.resolver}`);
      return out;
    }
    case 'tls-inspector': case 'tls-enumeration': case 'live-chain': case 'tls-capture': case 'starttls': {
      const sni = request.noSni ? 'no SNI' : `SNI ${request.sni || target}`;
      const names = request.sniNames?.length ? `, plus SNI ${request.sniNames.join(', ')}` : '';
      return [`${target}:${port} (${sni}${names})`];
    }
    case 'https-analyzer': return [`${target}:443 and http://${target}/`, resolverLabel(undefined, 'classic')];
    case 'http3-probe': return [`https://${target}:${port}/ over QUIC/HTTP-3 (Chromium network stack)`];
    case 'revocation': return (request.urls ?? []).map((url) => `${hostOf(url)} (${url})`);
    case 'ct-lookup': return request.ctSearch === false ? ['nothing — embedded SCTs are decoded locally'] : [`${request.ctEndpoint ? hostOf(request.ctEndpoint) : 'crt.sh'} (Certificate Transparency search for ${target})`];
    default: return [];
  }
}

/** Mirrors `apps/desktop/network-bridge.ts` `needsConfirmation` so the UI asks for a preview first. */
export function needsReview(request: NetworkRequest): boolean {
  return request.kind === 'port-scanner' || request.kind === 'network-diagnostic-bundle' ||
    (request.kind === 'connectivity-tester' && request.connectivityMode !== 'tcp' && !['GET', 'HEAD'].includes(request.method ?? 'HEAD')) ||
    request.kind === 'tls-enumeration' || request.kind === 'https-analyzer' || request.kind === 'tls-capture' ||
    (request.kind === 'email-auth' && !!request.dkimCommonProbe);
}

export function derBase64ToPem(derBase64: string, label = 'CERTIFICATE'): string {
  const lines = derBase64.replace(/\s+/g, '').match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

export function chainToPemBundle(chain: readonly { readonly derBase64: string }[]): string {
  return chain.map((entry) => derBase64ToPem(entry.derBase64)).join('');
}
