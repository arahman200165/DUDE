import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isIP } from 'node:net';
import type { NetworkRequest } from '../src/app/core/platform/network-types';
import { inspectTls, type TlsInspectResult } from './network-tls-inspect';

/**
 * TLS Handshake Capture (Phase 28 item 22, elevated). Uses Windows' built-in `pktmon`, filtered
 * to the resolved target IP and port, to record the packets of DUDE's own handshake, then converts
 * the ETL to pcapng for Wireshark. It runs only in the elevated session (Phase 27 Relaunch as
 * Administrator); pktmon start/stop is tagged process-management. Stop and filter removal are
 * guaranteed in `finally`, on cancel, and on app quit, so no trace is left running.
 */
export interface CaptureRunner {
  isElevated(): Promise<boolean>;
  run(args: string[], signal: AbortSignal, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }>;
}

/** Default runner: spawns pktmon. Injected in tests. */
export const pktmonRunner: CaptureRunner = {
  async isElevated() {
    return new Promise((resolve) => {
      const child = spawn('net', ['session'], { windowsHide: true, shell: false, stdio: 'ignore' });
      child.once('error', () => resolve(false));
      child.once('close', (code) => resolve(code === 0));
    });
  },
  run(args, signal, timeoutMs) {
    return new Promise((resolve, reject) => {
      const child = spawn('pktmon', args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill(), timeoutMs);
      const onAbort = () => child.kill();
      signal.addEventListener('abort', onAbort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); if (stdout.length > 200_000) child.kill(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      child.once('error', (error) => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(error); });
      child.once('close', (code) => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolve({ code: code ?? -1, stdout, stderr }); });
    });
  },
};

let runner: CaptureRunner = pktmonRunner;
export function setCaptureRunner(value: CaptureRunner): void { runner = value; }

export interface CaptureResult {
  readonly inspection: TlsInspectResult;
  readonly capture: { readonly available: boolean; readonly packets: number | null; readonly pcapngBase64: string | null; readonly filter: string; readonly note: string; readonly error?: string };
}

/** A dropped/cleaned artifact directory, always removed. */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'dude-pktmon-'));
  try { return await fn(dir); }
  finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

export async function captureTlsHandshake(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void): Promise<CaptureResult> {
  if (!(await runner.isElevated())) {
    throw new Error('Packet capture needs the elevated session. Use "Relaunch as Administrator" first (Local Network tool), then retry.');
  }
  const host = (request.target ?? '').trim();
  const port = request.port ?? 443;
  const address = isIP(host) ? host : (await lookup(host)).address;
  const filter = `dude-tls (${address} port ${port})`;
  progress(1, 4);
  return withTempDir(async (dir) => {
    const etl = join(dir, 'capture.etl');
    const pcapng = join(dir, 'capture.pcapng');
    let started = false;
    const stopAndClean = async () => {
      if (started) await runner.run(['stop'], AbortSignal.timeout(15_000), 15_000).catch(() => {});
      await runner.run(['filter', 'remove'], AbortSignal.timeout(10_000), 10_000).catch(() => {});
    };
    try {
      await runner.run(['filter', 'remove'], signal, 10_000).catch(() => {});
      const add = await runner.run(['filter', 'add', 'dude-tls', '-i', address, '-p', String(port)], signal, 10_000);
      if (add.code !== 0) throw new Error(`pktmon filter add failed: ${add.stderr.trim() || add.stdout.trim() || `exit ${add.code}`}`);
      const start = await runner.run(['start', '--capture', '--pkt-size', '0', '--file-name', etl], signal, 15_000);
      started = true;
      if (start.code !== 0) throw new Error(`pktmon start failed: ${start.stderr.trim() || `exit ${start.code}`}`);
      progress(2, 4);
      let inspection: TlsInspectResult;
      try { inspection = await inspectTls({ ...request, kind: 'tls-inspector' }, signal, () => {}); }
      finally { await runner.run(['stop'], signal, 15_000).catch(() => {}); started = false; }
      progress(3, 4);
      const convert = await runner.run(['etl2pcap', etl, '--out', pcapng], signal, 30_000);
      let pcapngBase64: string | null = null;
      let packets: number | null = null;
      let note = 'Captured the handshake packets of this connection only.';
      let error: string | undefined;
      if (convert.code === 0) {
        pcapngBase64 = (await readFile(pcapng)).toString('base64');
        packets = Number(/(\d+)\s+packets?/i.exec(convert.stdout)?.[1] ?? /Packets:\s*(\d+)/i.exec(start.stdout)?.[1] ?? '') || null;
      } else { error = `etl2pcap failed: ${convert.stderr.trim() || `exit ${convert.code}`}`; note = 'The handshake was inspected, but the capture could not be converted to pcapng.'; }
      progress(4, 4);
      return { inspection, capture: { available: true, packets, pcapngBase64, filter, note, ...(error ? { error } : {}) } };
    } finally {
      await stopAndClean();
    }
  });
}
