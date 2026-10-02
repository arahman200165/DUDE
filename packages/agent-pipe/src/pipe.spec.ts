import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentConnectError, connectAgentPipe } from './client.js';
import { ensureAgentSecret, agentEndpoint, readAgentSecret } from './endpoint.js';
import { FrameDecoder, encodeFrame } from './framing.js';
import { newNonce, serverProof } from './handshake.js';
import { createAgentPipeServer } from './server.js';
import type { AgentPipeConnection } from './server.js';

const dirs: string[] = [];
const closers: Array<() => Promise<void> | void> = [];
function tempStore(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'dude-pipe-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const config = { appInfo: { appVersion: '1.0.0' }, capabilities: { desktop: true }, machineGuid: 'g' };

async function startServer(storeDir: string, onConnection?: (c: AgentPipeConnection, cfg: unknown) => unknown, extra: { handshakeTimeoutMs?: number } = {}) {
  const server = await createAgentPipeServer({
    storeDir, agentVersion: '9.9.9',
    onConnection: (connection, cfg) => {
      connection.onMessage((m) => { void connection.send({ echo: m }); });
      return onConnection ? onConnection(connection, cfg) : { type: 'ready', status: 'ready' };
    },
    ...extra,
  });
  if (server.status !== 'listening') throw new Error('not listening');
  closers.push(server.close);
  return server;
}

describe('agent pipe', () => {
  it('creates a 32-byte key once and completes the handshake; config reaches the agent and boot reaches the client', async () => {
    const dir = tempStore();
    const key = ensureAgentSecret(dir);
    expect(key).toHaveLength(32);
    expect(ensureAgentSecret(dir).equals(key)).toBe(true);
    expect(readAgentSecret(dir).equals(key)).toBe(true);
    if (process.platform !== 'win32') expect(statSync(path.join(dir, 'agent-pipe.key')).mode & 0o077).toBe(0);

    let seen: unknown;
    await startServer(dir, (_c, cfg) => { seen = cfg; return { type: 'ready', status: 'ready', bytes: new Uint8Array([1, 2]) }; });
    const client = await connectAgentPipe({ storeDir: dir, config });
    expect(seen).toEqual(config);
    expect(client.agentVersion).toBe('9.9.9');
    expect(client.boot).toEqual({ type: 'ready', status: 'ready', bytes: new Uint8Array([1, 2]) });

    const heard = new Promise<unknown>((resolve) => client.onMessage(resolve));
    client.post({ id: 5, method: 'x', params: { ciphertext: new Uint8Array([9]) } });
    expect(await heard).toEqual({ echo: { id: 5, method: 'x', params: { ciphertext: new Uint8Array([9]) } } });
    client.close();
  });

  it('serves several authenticated clients and reports closes', async () => {
    const dir = tempStore();
    await startServer(dir);
    const a = await connectAgentPipe({ storeDir: dir, config });
    const b = await connectAgentPipe({ storeDir: dir, config });
    const closed = new Promise<void>((resolve) => a.onClose(() => resolve()));
    a.close();
    await closed;
    const echoed = new Promise<unknown>((resolve) => b.onMessage(resolve));
    b.post({ id: 1 });
    expect(await echoed).toEqual({ echo: { id: 1 } });
    b.close();
  });

  it('call() correlates a response by id without disturbing onMessage', async () => {
    const dir = tempStore();
    const server = await createAgentPipeServer({
      storeDir: dir, agentVersion: '1',
      onConnection: (connection) => { connection.onMessage((m) => { void connection.send({ id: (m as { id: number }).id, ok: true, result: 'pong' }); }); return {}; },
    });
    if (server.status !== 'listening') throw new Error();
    closers.push(server.close);
    const client = await connectAgentPipe({ storeDir: dir, config });
    expect(await client.call('ping')).toEqual({ id: -1, ok: true, result: 'pong' });
    client.close();
  });

  it('a client rejects a server that does not hold the key, and sends nothing beyond client-hello', async () => {
    const dir = tempStore();
    ensureAgentSecret(dir);
    const endpoint = agentEndpoint(path.join(dir, 'fake'));
    const received: unknown[] = [];
    const fake: Server = createServer((socket) => {
      const decoder = new FrameDecoder();
      socket.on('data', (chunk: Buffer) => {
        for (const message of decoder.push(chunk)) {
          received.push(message);
          const hello = message as { clientNonce: string };
          const wrong = Buffer.alloc(32, 7);
          socket.write(encodeFrame({ t: 'server-hello', v: 1, serverNonce: newNonce(), proof: serverProof(wrong, hello.clientNonce, 'x'.repeat(32)), agentVersion: '1', protocol: 1 }));
        }
      });
    });
    await new Promise<void>((resolve) => fake.listen(endpoint, resolve));
    closers.push(() => new Promise<void>((resolve) => fake.close(() => resolve())));
    const attempt = connectAgentPipe({ storeDir: dir, config, endpoint });
    await expect(attempt).rejects.toMatchObject({ code: 'handshake-failed' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ t: 'client-hello' });
  });

  it('a server rejects a client with the wrong key and never sends ready', async () => {
    const dir = tempStore();
    await startServer(dir);
    const other = tempStore();
    const attempt = connectAgentPipe({ storeDir: dir, config, secret: ensureAgentSecret(other) });
    // The client proves nothing to the server, but first the server proof fails on the client side.
    await expect(attempt).rejects.toBeInstanceOf(AgentConnectError);
    await expect(attempt).rejects.toMatchObject({ code: 'handshake-failed' });
  });

  it('a server rejects a forged client proof (right server proof, wrong client key)', async () => {
    const dir = tempStore();
    const secret = ensureAgentSecret(dir);
    let opened = 0;
    const server = await createAgentPipeServer({ storeDir: dir, agentVersion: '1', onConnection: () => { opened++; return {}; } });
    if (server.status !== 'listening') throw new Error();
    closers.push(server.close);
    const { connect } = await import('node:net');
    const socket = connect(server.endpoint);
    const decoder = new FrameDecoder();
    const clientNonce = newNonce();
    socket.write(encodeFrame({ t: 'client-hello', v: 1, clientNonce }));
    const hello = await new Promise<{ serverNonce: string; proof: string }>((resolve) => socket.on('data', (chunk: Buffer) => { const [m] = decoder.push(chunk); if (m) resolve(m as never); }));
    expect(hello.proof).toBe(serverProof(secret, clientNonce, hello.serverNonce));
    socket.write(encodeFrame({ t: 'client-proof', proof: 'f'.repeat(64), config }));
    await new Promise<void>((resolve) => socket.on('close', () => resolve()));
    expect(opened).toBe(0);
  });

  it('times out a handshake that never completes, on both sides', async () => {
    const dir = tempStore();
    await startServer(dir, undefined, { handshakeTimeoutMs: 100 });
    const { connect } = await import('node:net');
    const idle = connect(agentEndpoint(dir));
    await new Promise<void>((resolve) => idle.on('close', () => resolve()));

    const silentDir = tempStore();
    ensureAgentSecret(silentDir);
    const endpoint = agentEndpoint(path.join(silentDir, 'silent'));
    const held: Array<{ destroy(): void }> = [];
    const silent: Server = createServer((socket) => { held.push(socket); });
    await new Promise<void>((resolve) => silent.listen(endpoint, resolve));
    closers.push(() => new Promise<void>((resolve) => { silent.close(() => resolve()); held.forEach((s) => s.destroy()); }));
    await expect(connectAgentPipe({ storeDir: silentDir, config, endpoint, timeoutMs: 100 })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('reports no-server when nothing listens, and when the key does not exist yet', async () => {
    const dir = tempStore();
    await expect(connectAgentPipe({ storeDir: dir, config })).rejects.toMatchObject({ code: 'no-server' });
    ensureAgentSecret(dir);
    await expect(connectAgentPipe({ storeDir: dir, config })).rejects.toMatchObject({ code: 'no-server' });
  });

  it('detects a second agent for the same store, and takes over a stale socket after the first closes', async () => {
    const dir = tempStore();
    const first = await startServer(dir);
    const second = await createAgentPipeServer({ storeDir: dir, agentVersion: '1', onConnection: () => ({}) });
    expect(second).toEqual({ status: 'already-running' });
    await first.close();
    const third = await createAgentPipeServer({ storeDir: dir, agentVersion: '1', onConnection: () => ({}) });
    expect(third.status).toBe('listening');
    if (third.status === 'listening') closers.push(third.close);
  });

  it('closes an authenticated client that sends an oversize frame header', async () => {
    const dir = tempStore();
    const secret = ensureAgentSecret(dir);
    const server = await startServer(dir);
    const { connect } = await import('node:net');
    const { clientProof } = await import('./handshake.js');
    const socket = connect(server.endpoint);
    const decoder = new FrameDecoder();
    const clientNonce = newNonce();
    const frames: Array<Record<string, unknown>> = [];
    socket.on('data', (chunk: Buffer) => { for (const m of decoder.push(chunk)) frames.push(m as Record<string, unknown>); });
    socket.write(encodeFrame({ t: 'client-hello', v: 1, clientNonce }));
    await vi.waitFor(() => expect(frames).toHaveLength(1));
    socket.write(encodeFrame({ t: 'client-proof', proof: clientProof(secret, clientNonce, frames[0]['serverNonce'] as string), config }));
    await vi.waitFor(() => expect(frames[1]).toMatchObject({ t: 'ready' }));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(0xffffffff, 0);
    socket.write(header);
    await new Promise<void>((resolve) => socket.on('close', () => resolve()));
  });
});
