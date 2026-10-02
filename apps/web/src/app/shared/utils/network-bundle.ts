import { strToU8, zipSync } from 'fflate';
import type { NetworkRun } from '../../core/platform/network-diagnostics.service';

export function buildNetworkBundle(
  runs: readonly NetworkRun[],
  bodyFor: (id: string) => string | undefined,
  includeHttpBodies: boolean,
  createdAt = new Date().toISOString(),
): Uint8Array {
  const cleaned = runs.map((run) => {
    const { headers: _headers, body: _body, ...request } = run.request;
    const result = run.result && typeof run.result === 'object' ? { ...run.result as Record<string, unknown> } : run.result;
    if (result && typeof result === 'object') delete (result as Record<string, unknown>)['bodyBase64'];
    if (result && typeof result === 'object' && (result as Record<string, unknown>)['headers']) { const headers = { ...(result as Record<string, unknown>)['headers'] as Record<string, unknown> }; for (const name of Object.keys(headers)) if (['set-cookie', 'authorization', 'proxy-authorization'].includes(name.toLowerCase())) delete headers[name]; (result as Record<string, unknown>)['headers'] = headers; }
    return { ...run, request, result };
  });
  const json = JSON.stringify({ schemaVersion: 1, createdAt, runs: cleaned }, null, 2);
  const markdown = ['# DUDE Network Diagnostic Bundle', '', `Created: ${createdAt}`, '', ...cleaned.map((run) => `- ${run.request.kind}: ${run.request.target ?? 'local'} (${run.createdAt})`)].join('\n');
  const manifest = JSON.stringify({ schemaVersion: 1, checks: cleaned.map((run) => ({ id: run.id, kind: run.request.kind, target: run.request.target, createdAt: run.createdAt })) }, null, 2);
  const files: Record<string, Uint8Array> = { 'results.json': strToU8(json), 'summary.md': strToU8(markdown), 'manifest.json': strToU8(manifest) };
  if (includeHttpBodies) for (const run of runs) {
    if (run.request.kind !== 'connectivity-tester') continue;
    const base64 = bodyFor(run.id);
    if (base64) files[`responses/${run.id}.bin`] = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  }
  return zipSync(files);
}
