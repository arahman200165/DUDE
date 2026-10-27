import { HUB_TUNNEL_DISCLOSURE, HUB_TUNNEL_LOG_LINES_MAX, HUB_TUNNEL_LOG_LINE_MAX } from '@dude/contracts/hub';
import type { HubDiagnosticsTunnel, HubTunnelState, HubTunnelStatusResponse } from '@dude/contracts/hub';
import type { HubPaths } from '../config/data-dir.js';
import { createSecretStore } from '../secrets/secret-store.js';
import type { SecretStore } from '../secrets/secret-store.js';
import type { Supervisor, SupervisorStatus } from '../supervisor/supervisor.js';
import { TUNNEL_SECRET_PURPOSE, createCloudflaredSupervisor } from './cloudflared.js';
import type { CloudflaredSupervisorOptions } from './cloudflared.js';

/**
 * The managed tunnel as the rest of the Hub sees it (32-SS1, Milestone 837, PD-142, PD-143): the supervised `cloudflared` plus the one
 * connector-token secret, and nothing else. It is the ONLY module besides `cloudflared.ts` that touches the secret store for the tunnel,
 * so request handlers, diagnostics and provisioning get facts and presence, never the token (`secrets.spec.ts` lists the importers).
 *
 * `facts()` feeds the diagnostics engine and the readiness gate, `status()` the owner read route and the provisioning component,
 * `start()` and `stop()` the run loop and the elevated admin methods. A degraded or failed connector is audited as `tunnel.degraded`
 * once per transition (never more than once a minute), with a state and a short code, never a message from the child.
 */

/** Never audit `tunnel.degraded` more often than this, however a flapping connector behaves. */
export const TUNNEL_DEGRADED_AUDIT_MIN_MS = 60_000;

/** The configuration the runtime reports on (read live from `hub.json` by the caller). */
export interface TunnelConfigView { enabled: boolean; hostname: string }

export interface TunnelRuntimeOptions {
    paths: Pick<HubPaths, 'root' | 'secretsDir'>;
  /** The live configuration; `undefined` when no tunnel is configured. */
  readConfig: () => TunnelConfigView | undefined;
  /** The port the Hub listens on, for the Cloudflare dashboard origin value. */
  getPort: () => number;
  platform?: NodeJS.Platform;
  now?: () => number;
  /** Writes the `tunnel.degraded` audit event. */
  auditDegraded?: (detail: { state: HubTunnelState; restarts: number; error: string | null }) => void;
  /** Specs: the secret store, or a ready-made supervisor (the stub), instead of the real ones. */
  secrets?: SecretStore;
  supervisor?: Supervisor;
  cloudflared?: Partial<Omit<CloudflaredSupervisorOptions, 'secrets' | 'dataRoot'>>;
}

export interface TunnelRuntime {
  /** Starts the connector (the Hub run loop at boot, or the `on` gate). Rejects with the `TunnelStartError` of a refused launch. */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Waits until the connector is ready; false when it failed or the time ran out. */
  waitReady(timeoutMs: number): Promise<boolean>;
  tokenPresent(): boolean;
  /** Stores the connector token (DPAPI). The value is never echoed, logged or returned. */
  putToken(token: string): void;
  /** Removes the stored token. True when one existed. */
  forgetToken(): boolean;
  /** Diagnostics facts for `candidate` (the configuration the report is for: the live one, or the one a change would write). */
  facts(candidate?: TunnelConfigView): HubDiagnosticsTunnel;
  status(): HubTunnelStatusResponse;
  /** The raw supervisor state (specs and the stop-on-exit hook). */
  supervisorStatus(): SupervisorStatus;
  /** Synchronous last resort for a process `exit` handler. */
  killNow(): void;
  dispose(): void;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

export function createTunnelRuntime(options: TunnelRuntimeOptions): TunnelRuntime {
  const platform = options.platform ?? process.platform;
  const now = options.now ?? Date.now;
  const secrets = options.secrets ?? createSecretStore({ secretsDir: options.paths.secretsDir, platform });
  const supervisor = options.supervisor ?? createCloudflaredSupervisor({ secrets, dataRoot: options.paths.root, platform, ...options.cloudflared });
  const supported = platform === 'win32' || options.cloudflared?.launch !== undefined;
  let lastReadyAt: number | null = null;
  let lastState: HubTunnelState = 'stopped';
  let lastAuditedAt = 0;

  const tokenPresent = (): boolean => {
    try { return secrets.status()[TUNNEL_SECRET_PURPOSE].present; } catch { return false; }
  };

  const stateOf = (status: SupervisorStatus, configured: boolean): HubTunnelState => {
    switch (status.state) {
      case 'stopped': return configured ? 'stopped' : 'not-configured';
      case 'starting':
      case 'restarting': return 'connecting';
      case 'failed': return 'failed';
      case 'running': return status.ready ? 'ready' : lastReadyAt !== null && status.startedAt !== null && lastReadyAt >= status.startedAt ? 'degraded' : 'connecting';
    }
  };

  const unsubscribe = supervisor.onChange((status) => {
    if (status.ready) lastReadyAt = now();
    const state = stateOf(status, options.readConfig() !== undefined);
    const previous = lastState;
    lastState = state;
    if ((state === 'degraded' || state === 'failed') && previous !== state && now() - lastAuditedAt >= TUNNEL_DEGRADED_AUDIT_MIN_MS) {
      lastAuditedAt = now();
      try { options.auditDegraded?.({ state, restarts: status.restarts, error: status.lastError }); } catch { /* an audit failure never takes the connector down */ }
    }
  });

  return {
    start: () => supervisor.start(),
    stop: () => supervisor.stop(),
    async waitReady(timeoutMs) {
      const deadline = now() + timeoutMs;
      for (;;) {
        const status = supervisor.status();
        if (status.state === 'running' && status.ready) return true;
        if (status.state === 'failed' || status.state === 'stopped') return false;
        if (now() >= deadline) return false;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    tokenPresent,
    putToken(token) { secrets.put(TUNNEL_SECRET_PURPOSE, token); },
    forgetToken() { return secrets.delete(TUNNEL_SECRET_PURPOSE); },
    facts(candidate) {
      const config = candidate ?? options.readConfig();
      const status = supervisor.status();
      const idle = status.state === 'stopped' && status.startedAt === null && status.lastError === null;
      return {
        enabled: config?.enabled === true,
        hostname: config?.hostname ?? null,
        tokenPresent: tokenPresent(),
        supported,
        connector: idle && config === undefined ? null : {
          state: status.state, ready: status.ready, restarts: status.restarts, lastError: status.lastError,
        },
      };
    },
    status() {
      const config = options.readConfig();
      const status = supervisor.status();
      const state = stateOf(status, config !== undefined);
      const logTail = supervisor.logs().slice(-HUB_TUNNEL_LOG_LINES_MAX).map((line) => ({ at: iso(line.at), stream: line.stream, text: clip(line.text, HUB_TUNNEL_LOG_LINE_MAX) }));
      return {
        configured: config !== undefined,
        enabled: config?.enabled === true,
        hostname: config?.hostname ?? null,
        supported,
        state,
        ready: state === 'ready',
        tokenPresent: tokenPresent(),
        restarts: status.restarts,
        lastError: status.lastError,
        startedAt: status.startedAt === null ? null : iso(status.startedAt),
        lastReadyAt: lastReadyAt === null ? null : iso(lastReadyAt),
        dashboard: config === undefined ? null : { hostname: config.hostname, service: `https://127.0.0.1:${String(options.getPort())}`, noTlsVerify: true, httpHostHeader: null },
        disclosure: [...HUB_TUNNEL_DISCLOSURE],
        logTail,
      };
    },
    supervisorStatus: () => supervisor.status(),
    killNow: () => supervisor.killNow(),
    dispose: unsubscribe,
  };
}
