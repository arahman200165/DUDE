import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const PIPE_PROTOCOL = 1;
export const HANDSHAKE_TIMEOUT_MS = 10_000;

/** What the desktop tells the agent about itself; the agent opens the store from it. */
export interface AgentClientConfig {
  appInfo: unknown;
  capabilities: unknown;
  machineGuid: string | null;
}

export interface ClientHello { t: 'client-hello'; v: number; clientNonce: string }
export interface ServerHello { t: 'server-hello'; v: number; serverNonce: string; proof: string; agentVersion: string; protocol: number }
export interface ClientProof { t: 'client-proof'; proof: string; config: AgentClientConfig }
export interface ReadyFrame { t: 'ready'; boot: unknown }

export const newNonce = (): string => randomBytes(16).toString('hex');

export function serverProof(secret: Buffer, clientNonce: string, serverNonce: string): string {
  return createHmac('sha256', secret).update(`dude-agent-server|${clientNonce}|${serverNonce}`).digest('hex');
}

export function clientProof(secret: Buffer, clientNonce: string, serverNonce: string): string {
  return createHmac('sha256', secret).update(`dude-agent-client|${serverNonce}|${clientNonce}`).digest('hex');
}

export function proofMatches(expected: string, actual: unknown): boolean {
  if (typeof actual !== 'string' || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'));
}

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isNonce = (value: unknown): value is string => typeof value === 'string' && value.length >= 8 && value.length <= 128;
