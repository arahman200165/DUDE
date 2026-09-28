import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as tcpConnect, isIP } from 'node:net';
import { createSocket } from 'node:dgram';
import { networkInterfaces, hostname } from 'node:os';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { app } from 'electron';
import type { NetworkRequest } from '../src/app/core/platform/network-types';
import { expandScanTargets, validateHost } from './network-validation';
import { queryDns } from './network-dns';
import { runDnsLookup, runResolverComparison } from './network-dns-tools';
import { runLiveRequest } from './network-live';

export type Progress = (completed: number, total: number, data?: unknown) => void;
const DEFAULT_TIMEOUT = 3000;
function aborted(signal: AbortSignal): void { if (signal.aborted) throw new Error('Cancelled.'); }
function withTimeout(signal: AbortSignal, ms: number): AbortSignal { return AbortSignal.any([signal, AbortSignal.timeout(ms)]); }

export async function tcpProbe(target: string, port: number, signal: AbortSignal, timeoutMs = DEFAULT_TIMEOUT, family: 0 | 4 | 6 = 0): Promise<{ state: string; elapsedMs: number; error?: string }> {
  const started = performance.now();
  return new Promise((resolve) => {
    const socket = tcpConnect({ host: target, port, signal, family });
    let finished = false;
    const finish = (state: string, error?: string) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ state, elapsedMs: Math.round(performance.now() - started), ...(error ? { error } : {}) });
    };
    socket.setTimeout(timeoutMs, () => finish('timeout'));
    socket.once('connect', () => finish('open'));
    socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ECONNREFUSED' ? 'closed' : signal.aborted ? 'cancelled' : 'error', error.message));
  });
}

export async function udpProbe(target: string, port: number, signal: AbortSignal, timeoutMs = DEFAULT_TIMEOUT, family: 0 | 4 | 6 = 0): Promise<{ state: string; elapsedMs: number; response?: string }> {
  const address = await lookup(target, { family });
  const started = performance.now();
  return new Promise((resolve) => {
    const socket = createSocket(address.family === 6 ? 'udp6' : 'udp4');
    let finished = false;
    const finish = (state: string, response?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      socket.close();
      resolve({ state, elapsedMs: Math.round(performance.now() - started), ...(response ? { response } : {}) });
    };
    const onAbort = () => finish('cancelled');
    const timer = setTimeout(() => finish('open-or-filtered'), timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    socket.on('message', (message) => finish('open', message.toString('hex').slice(0, 256)));
    socket.on('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ECONNREFUSED' ? 'closed' : 'error', error.message));
    socket.send(Buffer.from([0]), port, address.address, (error) => { if (error) finish('error', error.message); });
  });
}

function ipFamily(value: NetworkRequest['addressFamily']): 0 | 4 | 6 { return value === 'ipv4' ? 4 : value === 'ipv6' ? 6 : 0; }

async function scan(request: NetworkRequest, signal: AbortSignal, progress: Progress): Promise<unknown> {
  const targets = expandScanTargets(request.target ?? '');
  const ports = [...new Set(request.ports ?? [])];
  const protocols = request.protocol === 'both' ? ['tcp', 'udp'] : [request.protocol ?? 'tcp'];
  const tasks = targets.flatMap((target) => ports.flatMap((port) => protocols.map((protocol) => ({ target, port, protocol }))));
  const results: unknown[] = new Array(tasks.length);
  let next = 0, completed = 0;
  await Promise.all(Array.from({ length: Math.min(16, tasks.length) }, async () => {
    while (next < tasks.length && !signal.aborted) {
      const index = next++;
      const task = tasks[index];
      const result = task.protocol === 'tcp'
        ? await tcpProbe(task.target, task.port, signal, request.timeoutMs ?? 1500, ipFamily(request.addressFamily))
        : await udpProbe(task.target, task.port, signal, request.timeoutMs ?? 2000, ipFamily(request.addressFamily));
      results[index] = { ...task, ...result };
      progress(++completed, tasks.length, results[index]);
    }
  }));
  aborted(signal);
  return { targets, ports, protocols, results };
}

function runCommand(file: string, args: string[], signal: AbortSignal, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf8'); if (stdout.length > 2_000_000) child.kill(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf8'); if (stderr.length > 10_000) child.kill(); });
    child.once('error', reject);
    child.once('close', (code) => { clearTimeout(timer); if (code === 0) resolve(stdout); else reject(new Error(stderr.trim() || `Network command exited ${code}.`)); });
  });
}

export function helperPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'network-icmp.exe') : join(__dirname, '../../build/network-icmp.exe');
}
async function icmpProbe(target: string, family: string, ttl: number, size: number, signal: AbortSignal, timeoutMs: number): Promise<Record<string, unknown>> {
  const output = await runCommand(helperPath(), ['probe', target, family, String(ttl), String(size), String(timeoutMs)], signal, timeoutMs + 3000);
  return JSON.parse(output) as Record<string, unknown>;
}
async function ping(request: NetworkRequest, signal: AbortSignal, progress: Progress): Promise<unknown> {
  const target = validateHost(request.target ?? '');
  const count = request.kind === 'latency-monitor'
    ? Math.min(3600, Math.ceil((request.durationMs ?? 300_000) / (request.intervalMs ?? 1000)))
    : request.kind === 'packet-loss' ? request.count ?? 20 : request.count ?? 4;
  const interval = request.kind === 'latency-monitor' ? request.intervalMs ?? 1000 : 1000;
  const samples: unknown[] = [];
  for (let i = 0; i < count; i++) {
    aborted(signal);
    try { samples.push(await icmpProbe(target, request.addressFamily ?? 'auto', 64, 64, signal, request.timeoutMs ?? 1000)); }
    catch (error) { if (signal.aborted) throw error; samples.push({ status: 'error', message: String(error) }); }
    progress(i + 1, count, samples.at(-1));
    if (i + 1 < count) await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, interval); signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Cancelled.')); }, { once: true }); });
  }
  const rtts = samples.flatMap((sample) => typeof (sample as { rttMs?: unknown }).rttMs === 'number' ? [(sample as { rttMs: number }).rttMs] : []);
  return { target, samples, sent: count, received: rtts.length, lossPercent: Math.round((1 - rtts.length / count) * 100), minMs: rtts.length ? Math.min(...rtts) : null, maxMs: rtts.length ? Math.max(...rtts) : null, averageMs: rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : null };
}
async function trace(target: string, family: string, signal: AbortSignal, progress: Progress): Promise<unknown> {
  const hops: unknown[] = [];
  for (let ttl = 1; ttl <= 30; ttl++) {
    aborted(signal);
    const hop = await icmpProbe(target, family, ttl, 64, signal, 1500);
    hops.push({ hop: ttl, ...hop });
    progress(ttl, 30, hops.at(-1));
    if (hop.status === 'success') break;
  }
  return { target, hops };
}
async function mtu(request: NetworkRequest, signal: AbortSignal, progress: Progress): Promise<unknown> {
  const target = validateHost(request.target ?? '');
  let low = request.addressFamily === 'ipv6' ? 1280 : 576, high = 9000;
  let best: number | null = null;
  for (let i = 0; i < 14 && low <= high; i++) {
    const size = Math.floor((low + high) / 2);
    const result = await icmpProbe(target, request.addressFamily ?? 'auto', 64, size, signal, 2000);
    progress(i + 1, 14, { size, ...result });
    if (result.status === 'success') { best = size; low = size + 1; }
    else if (result.status === 'packet-too-big') high = size - 1;
    else return { target, mtu: null, status: 'unknown', reason: result.status };
  }
  return { target, mtu: best, status: best === null ? 'unknown' : 'measured' };
}

const LOCAL_SCRIPTS: Record<string, string> = {
  ports: 'Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess; Get-NetUDPEndpoint | Select-Object LocalAddress,LocalPort,OwningProcess',
  connections: 'Get-NetTCPConnection | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess',
  processes: 'Get-NetTCPConnection -State Listen | ForEach-Object { $p=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; [pscustomobject]@{LocalAddress=$_.LocalAddress;LocalPort=$_.LocalPort;PID=$_.OwningProcess;Process=$p.ProcessName} }',
  neighbors: 'Get-NetNeighbor | Select-Object IPAddress,LinkLayerAddress,State,InterfaceAlias,AddressFamily',
  routes: 'Get-NetRoute | Select-Object DestinationPrefix,NextHop,RouteMetric,InterfaceAlias,AddressFamily',
  interfaces: 'Get-NetIPConfiguration | Select-Object InterfaceAlias,InterfaceDescription,IPv4Address,IPv6Address,IPv4DefaultGateway,DNSServer',
};
async function localView(view: string, signal: AbortSignal): Promise<unknown> {
  if (view === 'local-ip') return networkInterfaces();
  const script = LOCAL_SCRIPTS[view];
  if (!script) throw new Error('Unknown local network view.');
  const code = `[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $ErrorActionPreference='Stop'; @(${script}) | ConvertTo-Json -Compress -Depth 7`;
  const output = await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], signal, 20_000);
  return JSON.parse(output || '[]');
}

async function httpCheck(request: NetworkRequest, signal: AbortSignal): Promise<unknown> {
  const method = request.method ?? 'HEAD';
  let url = new URL(request.target ?? '');
  let headers: Record<string, string> = { ...request.headers };
  const body = request.body || undefined;
  if (body) headers['content-length'] = String(Buffer.byteLength(body, 'utf8'));
  const redirects: string[] = [];
  for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
    const started = performance.now();
    const timings: Record<string, number | null> = { dnsMs: null, tcpMs: null, tlsMs: null, headersMs: null, totalMs: null };
    const result = await new Promise<{ status: number; headers: Record<string, unknown>; bodyBytes: number; bodyBase64: string }>((resolve, reject) => {
      const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const chunks: Buffer[] = [];
      let size = 0;
      const operation = send(url, {
        method, headers, agent: false, signal: withTimeout(signal, request.timeoutMs ?? 15_000),
        rejectUnauthorized: true,
      }, (response) => {
        timings.headersMs = Math.round(performance.now() - started);
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 50_000_000) { operation.destroy(new Error('HTTP response exceeds 50 MB.')); return; }
          chunks.push(chunk);
        });
        response.once('end', () => {
          timings.totalMs = Math.round(performance.now() - started);
          resolve({ status: response.statusCode ?? 0, headers: response.headers, bodyBytes: size, bodyBase64: Buffer.concat(chunks).toString('base64') });
        });
        response.once('error', reject);
      });
      operation.once('socket', (socket) => {
        socket.once('lookup', () => { timings.dnsMs = Math.round(performance.now() - started); });
        socket.once('connect', () => { timings.tcpMs = Math.round(performance.now() - started); });
        socket.once('secureConnect', () => { timings.tlsMs = Math.round(performance.now() - started); });
      });
      operation.once('error', reject);
      if (body) operation.write(body);
      operation.end();
    });
    const location = result.headers['location'];
    if (['GET', 'HEAD'].includes(method) && result.status >= 300 && result.status < 400 && typeof location === 'string') {
      if (redirectCount === 5) throw new Error('HTTP redirect limit exceeded.');
      const next = new URL(location, url);
      if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password) throw new Error('Redirect target must be an HTTP or HTTPS URL without credentials.');
      if (next.origin !== url.origin) {
        headers = {};
      }
      redirects.push(next.href);
      url = next;
      continue;
    }
    return { url: url.href, method, redirects, status: result.status, headers: result.headers,
      ...timings, bodyBytes: result.bodyBytes, bodyBase64: result.bodyBase64 };
  }
  throw new Error('HTTP redirect limit exceeded.');
}

export async function runNetworkRequest(request: NetworkRequest, signal: AbortSignal, progress: Progress): Promise<unknown> {
  switch (request.kind) {
    case 'ping': case 'latency-monitor': case 'packet-loss': return ping(request, signal, progress);
    case 'traceroute': return trace(validateHost(request.target ?? ''), request.addressFamily ?? 'auto', signal, progress);
    case 'mtu-discovery': return mtu(request, signal, progress);
    case 'dns-lookup': case 'reverse-dns': return runDnsLookup(request, signal);
    case 'dns-propagation': return runResolverComparison(request, signal, progress);
    case 'tcp-port-tester': return { target: request.target, port: request.port, ...await tcpProbe(request.target ?? '', request.port ?? 443, signal, request.timeoutMs, ipFamily(request.addressFamily)) };
    case 'udp-port-tester': return { target: request.target, port: request.port, ...await udpProbe(request.target ?? '', request.port ?? 53, signal, request.timeoutMs, ipFamily(request.addressFamily)) };
    case 'port-scanner': return scan(request, signal, progress);
    case 'local-network': return { view: request.localView ?? 'ports', data: await localView(request.localView ?? 'ports', signal) };
    case 'public-ip': {
      const endpoints = [['ipv4', 'https://api.ipify.org'], ['ipv6', 'https://api6.ipify.org']];
      return Object.fromEntries(await Promise.all(endpoints.map(async ([family, url]) => {
        try { const response = await fetch(url, { signal: withTimeout(signal, 5000) }); const value = (await response.text()).trim(); return [family, isIP(value) === (family === 'ipv4' ? 4 : 6) ? value : 'unavailable']; }
        catch { return [family, 'unavailable']; }
      })));
    }
    case 'hostname-resolver': return { target: request.target, addresses: await lookup(request.target ?? '', { all: true, family: ipFamily(request.addressFamily) }) };
    case 'whois-lookup': return whois(request.target ?? '', request.resolver, signal);
    case 'connectivity-tester': return request.connectivityMode === 'tcp'
      ? { target: request.target, port: request.port, ...await tcpProbe(request.target ?? '', request.port ?? 443, signal, request.timeoutMs, ipFamily(request.addressFamily)) }
      : httpCheck(request, signal);
    case 'route-comparison': {
      const first = await trace(validateHost(request.target ?? ''), request.addressFamily ?? 'auto', signal, progress);
      const second = await trace(validateHost(request.secondTarget ?? request.target ?? ''), request.addressFamily ?? 'auto', signal, progress);
      const firstHops = (first as { hops: { address?: string; status?: string }[] }).hops;
      const secondHops = (second as { hops: { address?: string; status?: string }[] }).hops;
      const changedHops = Array.from({ length: Math.max(firstHops.length, secondHops.length) }, (_, index) =>
        ({ hop: index + 1, before: firstHops[index] ?? null, after: secondHops[index] ?? null }))
        .filter(({ before, after }) => before?.address !== after?.address || before?.status !== after?.status);
      return { first, second, changedHops };
    }
    case 'dnssec-inspector': case 'email-auth': case 'tls-inspector': case 'tls-enumeration': case 'tls-capture':
    case 'http3-probe': case 'live-chain': case 'revocation': case 'ct-lookup': case 'starttls': case 'https-analyzer':
      return runLiveRequest(request, signal, progress);
    case 'network-diagnostic-bundle': {
      const target = validateHost(request.target ?? '');
      const chosen = request.selectedChecks ?? ['local', 'dns', 'ping', 'trace', 'tcp', 'scan'];
      const checks = chosen.filter((check) => check !== 'scan' || request.includeScan);
      const results: Record<string, unknown> = {};
      for (const [index, check] of checks.entries()) {
        aborted(signal);
        try {
          if (check === 'local') {
            const local: Record<string, unknown> = {};
            for (const view of ['ports', 'connections', 'processes', 'neighbors', 'routes', 'interfaces', 'local-ip']) {
              try { local[view] = await localView(view, signal); }
              catch (error) { local[view] = { error: String(error) }; }
            }
            results[check] = local;
          } else if (check === 'dns') results[check] = await queryDns({ kind: 'dns-lookup', target }, signal);
          else if (check === 'ping') results[check] = await ping({ kind: 'ping', target, count: 4 }, signal, () => {});
          else if (check === 'trace') results[check] = await trace(target, request.addressFamily ?? 'auto', signal, () => {});
          else if (check === 'tcp') results[check] = await tcpProbe(target, 443, signal, DEFAULT_TIMEOUT, ipFamily(request.addressFamily));
          else if (check === 'scan') results[check] = await scan({ kind: 'port-scanner', target, ports: request.ports ?? [22, 80, 443, 3389, 8080], protocol: request.protocol ?? 'tcp' }, signal, (_done, _total, data) => progress(index, checks.length, data));
        } catch (error) { results[check] = { error: String(error) }; }
        progress(index + 1, checks.length, { check, result: results[check] });
      }
      return { target, results };
    }
  }
}

async function whoisSocket(host: string, server: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tcpConnect({ host: server, port: 43, signal });
    let output = '';
    socket.setTimeout(8000, () => socket.destroy(new Error('WHOIS timed out.')));
    socket.once('connect', () => socket.write(`${host}\r\n`));
    socket.on('data', (data: Buffer) => {
      output += data.toString('utf8');
      if (output.length > 1_000_000) socket.destroy(new Error('WHOIS response too large.'));
    });
    socket.once('end', () => resolve(output));
    socket.once('error', reject);
  });
}
async function whois(target: string, customServer: string | undefined, signal: AbortSignal): Promise<unknown> {
  const host = validateHost(target);
  if (!customServer && !isIP(host)) {
    try {
      const tld = host.split('.').at(-1);
      const response = await fetch('https://data.iana.org/rdap/dns.json', { signal: withTimeout(signal, 5000) });
      const bootstrap = await response.json() as { services?: [string[], string[]][] };
      const service = bootstrap.services?.find(([names]) => names.includes(tld ?? ''))?.[1]?.[0];
      if (service) {
        const rdap = await fetch(new URL(`domain/${encodeURIComponent(host)}`, service), { signal: withTimeout(signal, 8000) });
        if (rdap.ok) return { source: 'rdap', server: service, data: await rdap.json() };
      }
    } catch { /* bounded WHOIS fallback */ }
  }
  const firstServer = customServer ? validateHost(customServer) : 'whois.iana.org';
  const first = await whoisSocket(host, firstServer, signal);
  if (customServer) return { source: 'whois', server: firstServer, text: first };
  const referral = /^(?:whois|refer):\s*([^\s:]+)\s*$/im.exec(first)?.[1];
  if (referral) {
    const secondServer = validateHost(referral);
    if (secondServer !== firstServer) {
      try { return { source: 'whois', server: secondServer, referralFrom: firstServer, text: await whoisSocket(host, secondServer, signal) }; }
      catch (error) { return { source: 'whois', server: firstServer, text: first, referralError: String(error) }; }
    }
  }
  return { source: 'whois', server: firstServer, text: first };
}
