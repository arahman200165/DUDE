import { readFileSync } from 'node:fs';
import net from 'node:net';
import { ADMIN_MAX_LINE_BYTES, adminEndpointFile } from './admin-endpoint.js';
import type { AdminEndpointFile } from './admin-endpoint.js';

export class AdminCallError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export const HUB_NOT_RUNNING = 'hub-not-running';

function notRunning(): AdminCallError {
  return new AdminCallError(HUB_NOT_RUNNING, 'The DUDE Hub is not running for this data directory.');
}

function readEndpoint(dataDir: string): AdminEndpointFile {
  try {
    const parsed = JSON.parse(readFileSync(adminEndpointFile(dataDir), 'utf8')) as Partial<AdminEndpointFile>;
    if (typeof parsed.path !== 'string' || parsed.path.length === 0) throw new Error('invalid');
    return parsed as AdminEndpointFile;
  } catch {
    throw notRunning();
  }
}

/** One request over the local admin channel. Rejects with code `hub-not-running` when nothing answers. */
export async function callAdmin(dataDir: string, method: string, params: unknown = {}, timeoutMs = 5000): Promise<unknown> {
  const endpoint = readEndpoint(dataDir);
  return new Promise<unknown>((resolve, reject) => {
    const socket = net.connect(endpoint.path);
    let buffer = '';
    let settled = false;
    let connected = false;
    const finish = (error: Error | null, value?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(connected ? new AdminCallError('timeout', 'The Hub did not answer in time.') : notRunning()), timeoutMs);
    socket.once('connect', () => {
      connected = true;
      socket.write(JSON.stringify({ id: 1, method, params }) + '\n');
    });
    socket.on('error', () => finish(connected ? new AdminCallError('connection-error', 'The admin connection failed.') : notRunning()));
    socket.on('close', () => finish(connected ? new AdminCallError('connection-closed', 'The Hub closed the connection.') : notRunning()));
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > ADMIN_MAX_LINE_BYTES * 16) return finish(new AdminCallError('response-too-large', 'The response is too large.'));
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      try {
        const response = JSON.parse(buffer.slice(0, newline)) as { ok?: boolean; result?: unknown; error?: { code?: string; message?: string } };
        if (response.ok === true) return finish(null, response.result);
        finish(new AdminCallError(response.error?.code ?? 'internal', response.error?.message ?? 'The admin method failed.'));
      } catch {
        finish(new AdminCallError('bad-response', 'The Hub sent an invalid response.'));
      }
    });
  });
}
