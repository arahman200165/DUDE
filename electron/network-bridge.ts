import { app, ipcMain, type WebContents } from 'electron';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { NetworkJobEvent, NetworkPrepareResult, NetworkStartResult, NetworkRequest } from '../src/app/core/platform/network-types';
import { expandScanTargets, validateNetworkRequest } from './network-validation';
import { helperPath, runNetworkRequest } from './network-runner';

interface Job { readonly kind: string; readonly owner: WebContents; readonly abort: AbortController; readonly timer: NodeJS.Timeout }
const jobs = new Map<string, Job>();
const MAX_ACTIVE_JOBS = 4;
const prepared = new Map<string, { ownerId: number; request: string; expires: number }>();
function needsConfirmation(request: NetworkRequest): boolean {
  return request.kind === 'port-scanner' || request.kind === 'network-diagnostic-bundle' ||
    (request.kind === 'connectivity-tester' && request.connectivityMode !== 'tcp' && !['GET', 'HEAD'].includes(request.method ?? 'HEAD'));
}
function previewDetails(request: NetworkRequest): unknown {
  const scan = request.kind === 'port-scanner' || (request.kind === 'network-diagnostic-bundle' && request.includeScan);
  const targets = scan ? expandScanTargets(request.target ?? '') : [request.target ?? 'local machine'];
  const ports = scan ? request.ports ?? [] : [];
  const protocols = scan ? request.protocol === 'both' ? ['tcp', 'udp'] : [request.protocol ?? 'tcp'] : [];
  return { kind: request.kind, targets, ports, protocols, probeCount: targets.length * ports.length * protocols.length,
    selectedChecks: request.selectedChecks, method: request.method, headerNames: Object.keys(request.headers ?? {}),
    bodyBytes: request.body ? Buffer.byteLength(request.body, 'utf8') : 0 };
}

function event(owner: WebContents, value: NetworkJobEvent): void {
  if (!owner.isDestroyed()) owner.send('dude:network:event', value);
}

function helperMode(args: string[]): Promise<{ status: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath(), args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); if (output.length > 4096) child.kill(); });
    child.once('error', reject);
    child.once('close', () => {
      try { resolve(JSON.parse(output) as { status: string; code: number }); }
      catch { reject(new Error('Windows network helper did not return status.')); }
    });
  });
}
export function registerNetworkHandlers(): void {
  ipcMain.handle('dude:network:prepare', (ipcEvent, raw: unknown): NetworkPrepareResult => {
    try {
      for (const [token, value] of prepared) if (value.expires < Date.now()) prepared.delete(token);
      if (prepared.size >= 32) throw new Error('Too many pending network previews.');
      const request = validateNetworkRequest(raw);
      if (!needsConfirmation(request)) throw new Error('This check does not require confirmation.');
      const token = randomUUID();
      prepared.set(token, { ownerId: ipcEvent.sender.id, request: JSON.stringify(request), expires: Date.now() + 60_000 });
      return { ok: true, token, preview: previewDetails(request) };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle('dude:network:start', (ipcEvent, raw: unknown, token?: unknown): NetworkStartResult => {
    try {
      const request = validateNetworkRequest(raw);
      const owner = ipcEvent.sender;
      if (needsConfirmation(request)) {
        if (typeof token !== 'string') throw new Error('Review and confirm this check before running.');
        const staged = prepared.get(token);
        prepared.delete(token);
        if (!staged || staged.ownerId !== owner.id || staged.expires < Date.now() || staged.request !== JSON.stringify(request)) throw new Error('Confirmation expired or request changed. Review it again.');
      }
      if (owner.isDestroyed()) throw new Error('Window is closed.');
      if (jobs.size >= MAX_ACTIVE_JOBS) throw new Error('At most four network checks may run at once.');
      if (request.kind === 'port-scanner' && [...jobs.values()].some((job) => job.owner.id === owner.id && job.kind === 'port-scanner')) throw new Error('A port scan is already running.');
      const jobId = randomUUID();
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), request.kind === 'latency-monitor' ? 3_610_000 : request.kind === 'network-diagnostic-bundle' ? 600_000 : 180_000);
      jobs.set(jobId, { kind: request.kind, owner, abort, timer });
      owner.once('destroyed', () => abort.abort());
      let sequence = 0;
      const send = (value: Omit<NetworkJobEvent, 'jobId' | 'sequence'>) => event(owner, { jobId, sequence: ++sequence, ...value });
      void runNetworkRequest(request, abort.signal, (completed, total, data) => send({ type: 'progress', completed, total, data }))
        .then((data) => send({ type: 'result', data }))
        .catch((error: unknown) => send({ type: 'error', message: abort.signal.aborted ? 'Cancelled or timed out.' : error instanceof Error ? error.message : String(error) }))
        .finally(() => { clearTimeout(timer); jobs.delete(jobId); send({ type: 'done' }); });
      return { ok: true, jobId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('dude:network:adminStatus', async () => (await helperMode(['status'])).status === 'elevated');
  ipcMain.handle('dude:network:relaunchAsAdmin', async () => {
    const result = await helperMode(['relaunch', String(process.pid), process.execPath, ...(!app.isPackaged ? [app.getAppPath()] : [])]);
    if (result.status === 'accepted') { setImmediate(() => app.quit()); return true; }
    return false;
  });
  ipcMain.handle('dude:network:cancel', (ipcEvent, jobId: unknown): boolean => {
    if (typeof jobId !== 'string') return false;
    const job = jobs.get(jobId);
    if (!job || job.owner.id !== ipcEvent.sender.id) return false;
    job.abort.abort();
    return true;
  });
}

export function cancelAllNetworkJobs(): void {
  for (const job of jobs.values()) { clearTimeout(job.timer); job.abort.abort(); }
  jobs.clear();
}
