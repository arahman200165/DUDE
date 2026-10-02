import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { agentEndpoint, readAgentSecret } from './endpoint.js';
import { FrameDecoder, MAX_FRAME_BYTES, MAX_HANDSHAKE_FRAME_BYTES, ProtocolError, encodeFrame } from './framing.js';
import {
  HANDSHAKE_TIMEOUT_MS, PIPE_PROTOCOL, clientProof, isNonce, isObject, newNonce, proofMatches, serverProof,
} from './handshake.js';
import type { AgentClientConfig, ClientHello, ClientProof } from './handshake.js';

/** Why a connection attempt failed. `no-server` means nobody is listening (or the key does not exist yet): the caller may spawn the agent. */
export class AgentConnectError extends Error {
  constructor(readonly code: 'no-server' | 'handshake-failed' | 'timeout' | 'protocol', message: string) {
    super(message);
    this.name = 'AgentConnectError';
  }
}

export interface AgentPipeClient {
  readonly boot: unknown;
  readonly agentVersion: string;
  /** Fire a frame to the agent (the caller correlates ids). */
  post(message: unknown): void;
  /** Frames from the agent that are not responses to `call`. */
  onMessage(listener: (message: unknown) => void): void;
  /** Fires once when the connection ends, for any reason. */
  onClose(listener: (error?: Error) => void): void;
  /** Request/response convenience (uses negative ids so it never collides with the caller's own). */
  call(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
  close(): void;
}

export interface ConnectAgentPipeOptions {
  storeDir: string;
  config: AgentClientConfig;
  timeoutMs?: number;
  /** Test seams. */
  secret?: Buffer;
  endpoint?: string;
}

export function connectAgentPipe(options: ConnectAgentPipeOptions): Promise<AgentPipeClient> {
  return new Promise<AgentPipeClient>((resolve, reject) => {
    let secret: Buffer;
    try {
      secret = options.secret ?? readAgentSecret(options.storeDir);
    } catch {
      reject(new AgentConnectError('no-server', 'The agent has not created its pipe key.'));
      return;
    }
    const endpoint = options.endpoint ?? agentEndpoint(options.storeDir);
    const socket: Socket = connect(endpoint);
    socket.setNoDelay(true);
    const decoder = new FrameDecoder(MAX_HANDSHAKE_FRAME_BYTES);
    const clientNonce = newNonce();
    let stage: 'connecting' | 'hello' | 'ready' | 'open' | 'dead' = 'connecting';
    let serverNonce = '';
    let agentVersion = '';
    let bootValue: unknown;
    let failure: Error | undefined;
    const messageListeners: Array<(message: unknown) => void> = [];
    const closeListeners: Array<(error?: Error) => void> = [];
    const calls = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    let nextCallId = -1;

    const timer = setTimeout(() => abort(new AgentConnectError('timeout', 'The agent handshake timed out.')), options.timeoutMs ?? HANDSHAKE_TIMEOUT_MS);

    function abort(error: Error): void {
      failure ??= error;
      socket.destroy();
    }

    const post = (message: unknown): void => {
      if (socket.destroyed) return;
      socket.write(encodeFrame(message));
    };

    const client: AgentPipeClient = {
      get boot() { return bootValue; },
      get agentVersion() { return agentVersion; },
      post,
      onMessage: (listener) => { messageListeners.push(listener); },
      onClose: (listener) => { closeListeners.push(listener); },
      call: (method, params, timeoutMs = 10_000) => new Promise((res, rej) => {
        const id = nextCallId--;
        const callTimer = setTimeout(() => { calls.delete(id); rej(new ProtocolError('timeout', `${method} timed out.`)); }, timeoutMs);
        calls.set(id, { resolve: res, reject: rej, timer: callTimer });
        post({ id, method, params: params ?? {} });
      }),
      close: () => { socket.end(); },
    };

    socket.once('connect', () => {
      stage = 'hello';
      const hello: ClientHello = { t: 'client-hello', v: PIPE_PROTOCOL, clientNonce };
      post(hello);
    });

    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (stage === 'connecting' && (error.code === 'ENOENT' || error.code === 'ECONNREFUSED')) {
        failure ??= new AgentConnectError('no-server', `No agent is listening (${error.code}).`);
      } else failure ??= error;
    });

    socket.on('close', () => {
      clearTimeout(timer);
      const was = stage;
      stage = 'dead';
      const error = failure;
      for (const [id, entry] of calls) { clearTimeout(entry.timer); entry.reject(new ProtocolError('closed', 'The connection closed.')); calls.delete(id); }
      if (was === 'open') {
        for (const listener of closeListeners) { try { listener(error); } catch { /* ignore */ } }
      } else {
        reject(error instanceof AgentConnectError ? error : new AgentConnectError('protocol', error?.message ?? 'The agent closed the connection during the handshake.'));
      }
    });

    const onFrame = (message: unknown): void => {
      if (stage === 'hello') {
        if (!isObject(message) || message['t'] !== 'server-hello' || message['v'] !== PIPE_PROTOCOL || !isNonce(message['serverNonce']) || typeof message['agentVersion'] !== 'string') {
          abort(new AgentConnectError('handshake-failed', 'Bad server hello.'));
          return;
        }
        // The server proves itself first; nothing more is sent to an unauthenticated peer.
        if (!proofMatches(serverProof(secret, clientNonce, message['serverNonce']), message['proof'])) {
          abort(new AgentConnectError('handshake-failed', 'The agent failed to prove it holds the pipe key.'));
          return;
        }
        serverNonce = message['serverNonce'];
        agentVersion = message['agentVersion'];
        stage = 'ready';
        const proof: ClientProof = { t: 'client-proof', proof: clientProof(secret, clientNonce, serverNonce), config: options.config };
        post(proof);
        return;
      }
      if (stage === 'ready') {
        if (!isObject(message) || message['t'] !== 'ready') {
          abort(new AgentConnectError('handshake-failed', 'Expected ready.'));
          return;
        }
        bootValue = message['boot'];
        stage = 'open';
        decoder.maxBytes = MAX_FRAME_BYTES;
        clearTimeout(timer);
        resolve(client);
        return;
      }
      if (stage === 'open') {
        if (isObject(message) && typeof message['id'] === 'number' && calls.has(message['id'])) {
          const entry = calls.get(message['id'])!;
          calls.delete(message['id']);
          clearTimeout(entry.timer);
          entry.resolve(message);
          return;
        }
        for (const listener of messageListeners) { try { listener(message); } catch { /* ignore */ } }
      }
    };

    socket.on('data', (chunk: Buffer) => {
      if (stage === 'dead') return;
      try {
        for (const message of decoder.push(chunk)) onFrame(message);
      } catch (error) {
        abort(error as Error);
      }
    });
  });
}
