import type { DnsTransport, NetworkRequest, ResolverSpec } from '../src/app/core/platform/network-types';
import { compareDnsResults, queryDns, systemServers, type DnsLookupResult } from './network-dns';
import { analyzeCaaSet, climbNames, type CaaAnalysis } from './network-caa';

type Progress = (completed: number, total: number, data?: unknown) => void;
const aborted = (signal: AbortSignal) => { if (signal.aborted) throw new Error('Cancelled.'); };

/** CAA tree climb through the same resolver/transport the user chose (RFC 8659 §3). */
export async function caaClimb(request: NetworkRequest, signal: AbortSignal, first?: DnsLookupResult): Promise<CaaAnalysis> {
  const target = (request.target ?? '').trim();
  const climbed: { name: string; rcode: string; count: number }[] = [];
  for (const name of climbNames(target)) {
    aborted(signal);
    const result = first && name === target.toLowerCase().replace(/\.$/, '') ? first : await queryDns({ ...request, kind: 'dns-lookup', target: name, recordType: 'CAA' }, signal);
    const caa = result.answers.filter((answer) => answer.type === 'CAA');
    climbed.push({ name, rcode: result.rcodeName, count: caa.length });
    if (result.rcodeName === 'SERVFAIL') return { ...analyzeCaaSet(target, null, [], climbed, request.caIdentifier), warnings: [`SERVFAIL at ${name}: CAs must treat a lookup failure as a refusal to issue unless it is within a DNSSEC-unsigned zone.`] };
    if (caa.length) return analyzeCaaSet(target, name, caa, climbed, request.caIdentifier);
  }
  return analyzeCaaSet(target, null, [], climbed, request.caIdentifier);
}

export async function runDnsLookup(request: NetworkRequest, signal: AbortSignal): Promise<unknown> {
  const result = await queryDns(request, signal);
  if (request.kind === 'dns-lookup' && request.recordType === 'CAA') return { ...result, caa: await caaClimb(request, signal, result) };
  return result;
}

export const COMPARATOR_PRESETS: readonly ResolverSpec[] = [
  { label: 'Cloudflare', server: '1.1.1.1', transport: 'classic' },
  { label: 'Google', server: '8.8.8.8', transport: 'classic' },
  { label: 'Quad9', server: '9.9.9.9', transport: 'classic' },
];

/** Resolver Comparator (DNS Propagation, Phase 28 item 9): presets, system, and up to five custom resolvers. */
export async function runResolverComparison(request: NetworkRequest, signal: AbortSignal, progress: Progress): Promise<unknown> {
  const specs: ResolverSpec[] = [];
  if (request.includePresets !== false) specs.push(...COMPARATOR_PRESETS);
  if (request.includeSystem) specs.push({ label: `System (${systemServers()[0] ?? 'OS default'})`, server: 'system', transport: 'classic' });
  specs.push(...(request.resolvers ?? []));
  if (request.resolver) specs.push({ label: 'Custom', server: request.resolver, transport: (request.resolverTransport ?? 'classic') as DnsTransport });
  if (!specs.length) throw new Error('Choose at least one resolver to compare.');
  const results: Record<string, unknown>[] = [];
  let completed = 0;
  await Promise.all(specs.map(async (spec, index) => {
    aborted(signal);
    let entry: Record<string, unknown>;
    try {
      const lookup = await queryDns({ ...request, kind: 'dns-lookup', resolver: spec.server, resolverTransport: spec.transport }, signal);
      entry = { label: spec.label, transport: spec.transport, ...lookup };
    } catch (error) { entry = { label: spec.label, transport: spec.transport, server: spec.server, error: error instanceof Error ? error.message : String(error) }; }
    results[index] = entry;
    progress(++completed, specs.length, entry);
  }));
  aborted(signal);
  return { target: request.target, recordType: request.recordType ?? 'A', results, comparison: compareDnsResults(results as never) };
}
