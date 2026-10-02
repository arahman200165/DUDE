import { connect, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { existsSync, unlinkSync } from 'node:fs';
import { agentEndpoint, ensureAgentSecret } from './endpoint.js';
import { FrameDecoder, MAX_FRAME_BYTES, MAX_HANDSHAKE_FRAME_BYTES, ProtocolError, encodeFrame } from './framing.js';
import {
  HANDSHAKE_TIMEOUT_MS, PIPE_PROTOCOL, clientProof, isNonce, isObject, newNonce, proofMatches, serverProof,
} from './handshake.js';
import type { AgentClientConfig, ServerHello } from './handshake.js';

/** One authenticated client, as seen by the agent. */
export interface AgentPipeConnection {
  send(message: unknown): Promise<void>;
  /** Frames that arrive after the handshake; set during `onConnection`. */
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: (error?: Error) => void): void;
  close(): void;
}

export interface AgentPipeServerOptions {
  storeDir: string;
  agentVersion: string;
  /** Called once per authenticated client with its config; the resolved value is sent as `ready.boot`. */
  onConnection(connection: AgentPipeConnection, config: AgentClientConfig): Promise<unknown> | unknown;
  /** Test seams. */
  secret?: Buffer;
  endpoint?: string;
  handshakeTimeoutMs?: number;
}

export type AgentPipeServerResult =
  | { status: 'listening'; endpoint: string; close(): Promise<void> }
  | { status: 'already-running' };

function probeLive(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(endpoint);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function handleSocket(socket: Socket, options: AgentPipeServerOptions, secret: Buffer, track: (close: () => void) => () => void): void {
  socket.setNoDelay(true);
  const decoder = new FrameDecoder(MAX_HANDSHAKE_FRAME_BYTES);
  const closeListeners: Array<(error?: Error) => void> = [];
  let messageListener: ((message: unknown) => void) | null = null;
  let state: 'hello' | 'proof' | 'opening' | 'open' | 'dead' = 'hello';
  const backlog: unknown[] = [];
  const nonces: { client: string; server: string } = { client: '', server: '' };
  let failure: Error | undefined;

  const untrack = track(() => socket.destroy());
  const timer = setTimeout(() => { if (state !== 'open') fail(new ProtocolError('timeout', 'Handshake timed out.')); }, options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS);

  const write = (message: unknown): Promise<void> => new Promise((resolve, reject) => {
    if (socket.destroyed) { reject(new ProtocolError('closed', 'The connection is closed.')); return; }
    socket.write(encodeFrame(message), (error) => (error ? reject(error) : resolve()));
  });

  function fail(error: Error): void {
    failure ??= error;
    state = 'dead';
    socket.destroy();
  }

  const connection: AgentPipeConnection = {
    send: write,
    onMessage: (listener) => { messageListener = listener; },
    onClose: (listener) => { closeListeners.push(listener); },
    close: () => { socket.end(); },
  };

  socket.on('error', (error) => { failure ??= error; });
  socket.on('close', () => {
    clearTimeout(timer);
    untrack();
    const wasOpen = state === 'open' || state === 'opening';
    state = 'dead';
    if (wasOpen) for (const listener of closeListeners) { try { listener(failure); } catch { /* a listener must not break the server */ } }
  });

  const dispatch = (message: unknown): void => {
    try { messageListener?.(message); } catch { /* handler errors are the handler's business */ }
  };

  const onFrame = (message: unknown): void => {
    if (state === 'hello') {
      if (!isObject(message) || message['t'] !== 'client-hello' || message['v'] !== PIPE_PROTOCOL || !isNonce(message['clientNonce'])) {
        fail(new ProtocolError('handshake-failed', 'Bad client hello.'));
        return;
      }
      nonces.client = message['clientNonce'];
      nonces.server = newNonce();
      state = 'proof';
      const hello: ServerHello = {
        t: 'server-hello', v: PIPE_PROTOCOL, serverNonce: nonces.server, proof: serverProof(secret, nonces.client, nonces.server),
        agentVersion: options.agentVersion, protocol: PIPE_PROTOCOL,
      };
      void write(hello).catch((error: Error) => fail(error));
      return;
    }
    if (state === 'proof') {
      if (!isObject(message) || message['t'] !== 'client-proof' || !proofMatches(clientProof(secret, nonces.client, nonces.server), message['proof']) || !isObject(message['config'])) {
        fail(new ProtocolError('handshake-failed', 'Client proof rejected.'));
        return;
      }
      const config = message['config'] as unknown as AgentClientConfig;
      state = 'opening';
      decoder.maxBytes = MAX_FRAME_BYTES;
      void (async () => {
        try {
          const boot = await options.onConnection(connection, config);
          if (state !== 'opening') return;
          await write({ t: 'ready', boot });
          state = 'open';
          clearTimeout(timer);
          for (const queued of backlog.splice(0)) dispatch(queued);
        } catch (error) {
          fail(error as Error);
        }
      })();
      return;
    }
    if (state === 'opening') { backlog.push(message); return; }
    if (state === 'open') dispatch(message);
  };

  socket.on('data', (chunk: Buffer) => {
    if (state === 'dead') return;
    try {
      for (const message of decoder.push(chunk)) onFrame(message);
    } catch (error) {
      fail(error as Error);
    }
  });
}

/**
 * Listens on the per-user endpoint. Resolves `already-running` when another live agent owns it
 * (`EADDRINUSE` for a Windows pipe; a connectable socket on POSIX, where only stale socket files are removed).
 */
export async function createAgentPipeServer(options: AgentPipeServerOptions): Promise<AgentPipeServerResult> {
  const endpoint = options.endpoint ?? agentEndpoint(options.storeDir);
  const secret = options.secret ?? ensureAgentSecret(options.storeDir);
  const posix = !endpoint.startsWith('\\\\');
  if (posix && existsSync(endpoint)) {
    if (await probeLive(endpoint)) return { status: 'already-running' };
    try { unlinkSync(endpoint); } catch { /* raced with another cleanup */ }
  }

  const sockets = new Set<() => void>();
  const server: Server = createServer((socket) => handleSocket(socket, options, secret, (close) => {
    sockets.add(close);
    return () => { sockets.delete(close); };
  }));

  const listening = await new Promise<'ok' | 'in-use'>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve('in-use');
      else reject(error);
    });
    server.listen(endpoint, () => resolve('ok'));
  });
  if (listening === 'in-use') return { status: 'already-running' };
  server.on('error', () => undefined);
  return {
    status: 'listening',
    endpoint,
    close: () => new Promise<void>((resolve) => {
      for (const close of [...sockets]) close();
      server.close(() => resolve());
    }),
  };
}
