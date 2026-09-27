import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import type { NetworkRequest, NetworkKind } from '../src/app/core/platform/network-types';

export const NETWORK_KINDS: readonly NetworkKind[] = [
  'ping', 'traceroute', 'dns-lookup', 'reverse-dns', 'dns-propagation',
  'tcp-port-tester', 'udp-port-tester', 'port-scanner', 'local-network',
  'public-ip', 'hostname-resolver', 'whois-lookup', 'connectivity-tester',
  'latency-monitor', 'packet-loss', 'mtu-discovery', 'route-comparison',
  'network-diagnostic-bundle',
];
const NO_TARGET = new Set<NetworkKind>(['local-network', 'public-ip']);
const VALID_RECORDS = new Set(['A', 'AAAA', 'MX', 'TXT', 'SRV', 'NS', 'CNAME', 'PTR']);
const VALID_VIEWS = new Set(['ports', 'connections', 'processes', 'neighbors', 'routes', 'interfaces', 'local-ip']);

function parseIPv4(address: string): bigint {
  return address.split('.').reduce((value, part) => (value << 8n) | BigInt(Number(part)), 0n);
}
function parseIPv6(address: string): bigint {
  let value = address.toLowerCase().split('%')[0];
  if (value.includes('.')) {
    const index = value.lastIndexOf(':');
    const octets = value.slice(index + 1).split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) throw new Error('Invalid IPv6 CIDR address.');
    value = `${value.slice(0, index + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) throw new Error('Invalid IPv6 CIDR address.');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) throw new Error('Invalid IPv6 CIDR address.');
  if (missing < 0) throw new Error('Invalid IPv6 CIDR address.');
  return [...left, ...Array(missing).fill('0'), ...right]
    .reduce((n: bigint, word: string) => (n << 16n) | BigInt(parseInt(word, 16)), 0n);
}
function formatIPv6(value: bigint): string {
  const words = Array.from({ length: 8 }, (_, index) => Number((value >> BigInt((7 - index) * 16)) & 0xffffn).toString(16));
  return words.join(':');
}

/** Refuse oversized ranges rather than silently scanning a subset. */
export function expandScanTargets(value: string): string[] {
  if (!value.includes('/')) return [validateHost(value)];
  const parts = value.split('/');
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) throw new Error('Enter a valid IPv4 or IPv6 CIDR.');
  const family = isIP(parts[0]);
  if (!family) throw new Error('CIDR targets must use a literal IP address.');
  const bits = family === 4 ? 32 : 128;
  const prefix = Number(parts[1]);
  if (prefix < 0 || prefix > bits) throw new Error('Invalid CIDR prefix.');
  const count = 1n << BigInt(bits - prefix);
  if (count > 16n) throw new Error('A scan may target at most 16 addresses.');
  const all = (1n << BigInt(bits)) - 1n;
  const base = (family === 4 ? parseIPv4(parts[0]) : parseIPv6(parts[0])) & (all ^ (count - 1n));
  return Array.from({ length: Number(count) }, (_, index) => {
    const address = base + BigInt(index);
    return family === 4
      ? [24n, 16n, 8n, 0n].map((shift) => Number((address >> shift) & 255n)).join('.')
      : formatIPv6(address);
  });
}

export function validateHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 253 || /[\s\x00-\x1f/?#@\\]/.test(trimmed)) throw new Error('Enter one valid host or IP address.');
  if (isIP(trimmed)) return trimmed;
  const ascii = domainToASCII(trimmed);
  if (!ascii || ascii.length > 253 || !/^[a-z0-9.-]+$/i.test(ascii) || ascii.split('.').some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    throw new Error('Enter one valid host or IP address.');
  }
  return ascii;
}

export function validateNetworkRequest(raw: unknown): NetworkRequest {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid network request.');
  const request = raw as NetworkRequest;
  if (!NETWORK_KINDS.includes(request.kind)) throw new Error('Unknown network operation.');
  if (!NO_TARGET.has(request.kind)) {
    if (typeof request.target !== 'string') throw new Error('A target is required.');
    if (request.kind === 'connectivity-tester' && request.connectivityMode !== 'tcp') {
      const url = new URL(request.target);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP or HTTPS URL without embedded credentials.');
    } else if (request.kind !== 'port-scanner') validateHost(request.target);
  }
  if (request.addressFamily && !['auto', 'ipv4', 'ipv6'].includes(request.addressFamily)) throw new Error('Invalid address family.');
  if (request.recordType && !VALID_RECORDS.has(request.recordType)) throw new Error('Invalid DNS record type.');
  if (request.localView && !VALID_VIEWS.has(request.localView)) throw new Error('Invalid local view.');
  if (request.port !== undefined && (!Number.isInteger(request.port) || request.port < 1 || request.port > 65535)) throw new Error('Invalid port.');
  if (request.timeoutMs !== undefined && (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 100 || request.timeoutMs > 30_000)) throw new Error('Timeout must be between 100 ms and 30 seconds.');
  if (request.count !== undefined && (!Number.isInteger(request.count) || request.count < 1 || request.count > 100)) throw new Error('Probe count must be between 1 and 100.');
  if (request.kind === 'port-scanner' || (request.kind === 'network-diagnostic-bundle' && request.includeScan)) {
    const hosts = expandScanTargets(request.target ?? '');
    const ports = request.ports;
    if (!Array.isArray(ports) || ports.length < 1 || ports.length > 64 || ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('Choose 1 to 64 valid ports.');
    const protocols = request.protocol === 'both' ? 2 : 1;
    if (request.protocol && !['tcp', 'udp', 'both'].includes(request.protocol)) throw new Error('Invalid scan protocol.');
    if (hosts.length * ports.length * protocols > 1024) throw new Error('A scan may send at most 1,024 probes.');
  }
  if (request.kind === 'network-diagnostic-bundle' && request.selectedChecks && (request.selectedChecks.length > 6 || new Set(request.selectedChecks).size !== request.selectedChecks.length || request.selectedChecks.some((check) => !['local', 'dns', 'ping', 'trace', 'tcp', 'scan'].includes(check)))) throw new Error('Invalid bundle checks.');
  if (request.intervalMs !== undefined && (!Number.isInteger(request.intervalMs) || request.intervalMs < 1000 || request.intervalMs > 60_000)) throw new Error('Probe interval must be between 1 and 60 seconds.');
  if (request.kind === 'latency-monitor' && request.durationMs !== undefined && (!Number.isInteger(request.durationMs) || request.durationMs < 1000 || request.durationMs > 3_600_000)) throw new Error('Monitoring is limited to one hour.');
  if (request.kind === 'connectivity-tester') {
    if (request.connectivityMode && !['tcp', 'http'].includes(request.connectivityMode)) throw new Error('Invalid connectivity mode.');
    if (request.body && Buffer.byteLength(request.body, 'utf8') > 1_000_000) throw new Error('HTTP request body exceeds 1 MB.');
    if (request.method && !/^[!#$%&'*+.^_`|~0-9A-Z-]{1,32}$/.test(request.method)) throw new Error('Invalid HTTP method.');
    if (request.body && ['GET', 'HEAD'].includes(request.method ?? 'HEAD')) throw new Error('GET and HEAD cannot include a request body.');
    if (request.headers && Object.keys(request.headers).some((name) => ['content-length', 'transfer-encoding'].includes(name.toLowerCase()))) throw new Error('Content length and transfer encoding are controlled by DUDE.');
    if (request.headers && (typeof request.headers !== 'object' || Array.isArray(request.headers) || Object.keys(request.headers).length > 64 || Object.entries(request.headers).some(([name, value]) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || typeof value !== 'string' || value.length > 8192 || /[\r\n]/.test(value)))) throw new Error('Invalid HTTP headers.');
  }
  if (request.kind === 'route-comparison' && request.secondTarget) validateHost(request.secondTarget);
  if (request.kind === 'reverse-dns' && !isIP(request.target ?? '')) throw new Error('Reverse DNS requires an IP address.');
  if (request.kind === 'whois-lookup' && request.resolver) validateHost(request.resolver);
  if (request.kind === 'network-diagnostic-bundle' && request.selectedChecks?.includes('scan') && !request.includeScan) throw new Error('Enable the guided scan before selecting it.');
  return request;
}
