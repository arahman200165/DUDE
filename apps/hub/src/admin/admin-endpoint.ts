import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export const ADMIN_MAX_LINE_BYTES = 64 * 1024;

export class AdminError extends Error {
  /** `detail` is structured, non-secret data for the CLI (for example the readiness blocker list). */
  constructor(readonly code: string, message: string, readonly detail?: unknown) {
    super(message);
  }
}

export type AdminMethod = (params: unknown) => unknown | Promise<unknown>;

export interface AdminEndpointOptions {
  /** The Hub root directory (the value of `--data-dir`). */
  dataDir: string;
  hubInstanceId: string;
  methods: Record<string, AdminMethod>;
}

export interface AdminEndpoint {
  path: string;
  close(): Promise<void>;
}

export interface AdminEndpointFile { path: string; pid: number; startedAt: string }

export const adminEndpointFile = (dataDir: string): string => path.join(dataDir, 'run', 'admin-endpoint.json');

/** Windows: a per-data-directory named pipe. Elsewhere: a Unix socket under `<dataDir>/run`. */
export function adminEndpointPath(dataDir: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    const id = createHash('sha256').update(dataDir.toLowerCase()).digest('hex').slice(0, 12);
    return `\\\\.\\pipe\\dude-hub-admin-${id}`;
  }
  return path.join(dataDir, 'run', 'admin.sock');
}

/**
 * Local admin channel, so CLI commands never open dude.db while the service runs.
 *
 * Access control (Windows): a named pipe created by Node gets the default DACL, which grants full control
 * only to SYSTEM, Administrators and the creating account (the service account), and read-only access to
 * Everyone. Only those principals can therefore write a request, i.e. in practice elevated admins and the
 * service account itself. Caveat: when the service runs as a dedicated low-privilege account, an
 * unelevated owner session cannot reach the pipe; run the admin CLI elevated. Elsewhere the run directory is
 * 0700 and the socket 0600, so only the service user can connect.
 *
 * Protocol: newline-delimited JSON. Request `{id, method, params}`, response `{id, ok:true, result}` or
 * `{id, ok:false, error:{code, message}}`. Lines are capped at 64 KiB; one request per line, any number per
 * connection.
 */
export async function startAdminEndpoint(options: AdminEndpointOptions): Promise<AdminEndpoint> {
  const endpointPath = adminEndpointPath(options.dataDir);
  const runDir = path.join(options.dataDir, 'run');
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try { chmodSync(runDir, 0o700); } catch { /* best effort */ }
    rmSync(endpointPath, { force: true }); // stale socket from a crashed run
  }

  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    serveConnection(socket, options.methods);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpointPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  if (process.platform !== 'win32') chmodSync(endpointPath, 0o600);

  const file: AdminEndpointFile = { path: endpointPath, pid: process.pid, startedAt: new Date().toISOString() };
  writeFileSync(adminEndpointFile(options.dataDir), JSON.stringify(file) + '\n', { mode: 0o600 });

  return {
    path: endpointPath,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(adminEndpointFile(options.dataDir), { force: true });
      if (process.platform !== 'win32' && existsSync(endpointPath)) rmSync(endpointPath, { force: true });
    },
  };
}

function reply(socket: net.Socket, payload: unknown): void {
  if (!socket.destroyed) socket.write(JSON.stringify(payload) + '\n');
}

function serveConnection(socket: net.Socket, methods: Record<string, AdminMethod>): void {
  let buffer = Buffer.alloc(0);
  let queue: Promise<void> = Promise.resolve(); // responses stay in request order
  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const newline = buffer.indexOf(0x0a);
      if (newline < 0) {
        if (buffer.length > ADMIN_MAX_LINE_BYTES) {
          reply(socket, { id: null, ok: false, error: { code: 'line-too-long', message: 'Request line exceeds 64 KiB.' } });
          socket.end();
        }
        return;
      }
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      if (line.length > ADMIN_MAX_LINE_BYTES) {
        reply(socket, { id: null, ok: false, error: { code: 'line-too-long', message: 'Request line exceeds 64 KiB.' } });
        socket.end();
        return;
      }
      const text = line.toString('utf8');
      queue = queue.then(async () => reply(socket, await handleLine(text, methods)));
    }
  });
}

async function handleLine(line: string, methods: Record<string, AdminMethod>): Promise<unknown> {
  let request: unknown;
  try {
    request = JSON.parse(line);
  } catch {
    return { id: null, ok: false, error: { code: 'bad-request', message: 'Request is not valid JSON.' } };
  }
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return { id: null, ok: false, error: { code: 'bad-request', message: 'Request must be an object.' } };
  }
  const { id, method, params } = request as { id?: unknown; method?: unknown; params?: unknown };
  const responseId = typeof id === 'string' || typeof id === 'number' ? id : null;
  if (typeof method !== 'string' || !Object.hasOwn(methods, method)) {
    return { id: responseId, ok: false, error: { code: 'unknown-method', message: 'Unknown admin method.' } };
  }
  try {
    const result = await methods[method]!(params);
    return { id: responseId, ok: true, result: result ?? null };
  } catch (error) {
    if (error instanceof AdminError) return { id: responseId, ok: false, error: { code: error.code, message: error.message, ...(error.detail !== undefined ? { detail: error.detail } : {}) } };
    return { id: responseId, ok: false, error: { code: 'internal', message: 'The admin method failed.' } };
  }
}
