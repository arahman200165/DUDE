import { createHash } from 'node:crypto';
import { Value } from 'typebox/value';
import { HUB_TUNNEL_DISCLOSURE, HUB_TUNNEL_PHRASE, HubDiagnosticsReport, hubTunnelDashboard } from '@dude/contracts/hub';
import { applyTunnelChange, loadOrCreateHubConfig, normalizeTunnelHostname, writeHubConfig } from '../config/hub-config.js';
import type { DiagnosticsHostFacts } from '../diagnostics/engine.js';
import { evaluatePublicReadiness } from '../diagnostics/readiness.js';
import type { Blocker } from '../diagnostics/readiness.js';
import { getAuthorityEpoch } from '../hub/authority.js';
import { audit } from '../security/audit.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { TunnelStartError } from '../tunnel/cloudflared.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import type { AdminMethodContext } from './methods.js';

/** ConfirmationStore actions of `network tunnel on` and `off`. Only the admin pipe can issue or consume them. */
export const TUNNEL_ON_ACTION = 'network.tunnel.on';
export const TUNNEL_OFF_ACTION = 'network.tunnel.off';
/**
 * Turning the tunnel on is exposure-widening: it publishes the Hub on the owner's domain through a third party (`system-config`),
 * starts a supervised child process (`process-management`) and stores the Cloudflare connector token (`secret-management`).
 * Turning it off narrows exposure but still stops that process and rewrites the exposure configuration.
 */
export const TUNNEL_ON_CONSEQUENCE_CLASS = ['system-config', 'process-management', 'secret-management'] as const;
export const TUNNEL_OFF_CONSEQUENCE_CLASS = ['system-config', 'process-management'] as const;

const ADMIN_BINDING = 'cli';
/** How long `on` waits for the connector to report ready before it refuses (cloudflared normally takes a few seconds). */
export const TUNNEL_READY_TIMEOUT_MS = 45_000;
const TOKEN_SHAPE = /^[A-Za-z0-9+/=_-]{32,4096}$/;

const record = (params: unknown): Record<string, unknown> => (typeof params === 'object' && params !== null && !Array.isArray(params) ? (params as Record<string, unknown>) : {});

/**
 * Managed-tunnel admin methods (32-SS1, Milestone 837, PD-143): `network.tunnel.preview|apply|status`. Credential class: the local
 * admin pipe (an elevated CLI on the Hub machine). There is no HTTP route, sync credential or web credential that can issue or
 * consume the confirmation, store the connector token or change exposure; `GET /api/v1/tunnel` is a read model only.
 *
 * The connector token travels only in the `apply` parameters (the CLI reads it from standard input): it is stored through the tunnel
 * runtime, never audited, logged, echoed in a result or an error, and never part of a digest.
 */
export function buildTunnelMethods(context: AdminMethodContext, shared: { now: () => number; confirmations: ConfirmationStore; parseHostFacts: (raw: unknown) => Pick<DiagnosticsHostFacts, 'publicFirewall' | 'nativeListeners'> | null }): Record<string, AdminMethod> {
  const { now, confirmations, parseHostFacts } = shared;
  const runtime = (): NonNullable<AdminMethodContext['tunnel']> => {
    if (!context.tunnel) throw new AdminError('unavailable', 'The managed tunnel is not available in this context.');
    return context.tunnel;
  };
  const configFile = (): string => {
    if (!context.configFile) throw new AdminError('unavailable', 'The exposure configuration cannot be changed in this context.');
    return context.configFile;
  };
  const auditCli = (event: Parameters<typeof audit>[1]['event'], outcome: 'success' | 'failure', detail: Record<string, unknown>): void =>
    audit(context.db, { event, outcome, actorKind: 'cli', detail, now: now() });
  let applying = false;

  /** The hostname an `on` is for: the parameter, else the one already configured. Validated; never echoes an invalid value. */
  const hostnameFor = (input: Record<string, unknown>, configured: string | undefined): string => {
    const raw = input['hostname'] ?? configured;
    if (raw === undefined) throw new AdminError('bad-request', 'hostname is required (your public domain, for example notes.example.com).');
    try {
      return normalizeTunnelHostname(raw, 'hostname');
    } catch (error) {
      throw new AdminError('bad-request', (error as Error).message);
    }
  };

  const digestOf = (action: string, hostname: string | null, accept: boolean): string => {
    const config = loadOrCreateHubConfig(configFile());
    return createHash('sha256').update(JSON.stringify({
      action, hostname, accept, hubInstanceId: context.hubInstanceId, epoch: getAuthorityEpoch(context.db),
      bind: config.bind, exposure: config.exposure,
    })).digest('hex');
  };

  /** The readiness report as if the tunnel were on for `hostname`; refuses when the diagnostics cannot be built. */
  const readinessFor = async (hostname: string, accept: boolean, hostFacts: unknown) => {
    if (!context.diagnostics) throw new AdminError('unavailable', 'Diagnostics are not available in this context, so readiness cannot be verified.');
    const host = parseHostFacts(hostFacts);
    const reported = await context.diagnostics({ mode: 'public', tunnel: { hostname }, ...(host ? { host } : {}) });
    if (!Value.Check(HubDiagnosticsReport, reported)) throw new AdminError('unavailable', 'The diagnostics report was not valid, so readiness cannot be verified.');
    return evaluatePublicReadiness(reported, { acceptUnverifiedReachability: accept });
  };

  const refusal = (blockers: Blocker[], warnings: Blocker[]): AdminError =>
    new AdminError('refused', `The Hub is not ready to be published through the tunnel: ${blockers.length} blocker${blockers.length === 1 ? '' : 's'}.`, { ready: false, blockers, warnings, requiredPhrase: HUB_TUNNEL_PHRASE });

  return {
    /** The read model plus the exact phrase. Writes nothing. */
    'network.tunnel.status': () => ({ ...runtime().status(), requiredPhrase: HUB_TUNNEL_PHRASE }),

    /** Step one: validates, builds the readiness report as if the tunnel were on, and stages a single-use confirmation. Writes nothing. */
    'network.tunnel.preview': async (params) => {
      const input = record(params);
      const action = input['action'];
      if (action !== 'on' && action !== 'off') throw new AdminError('bad-request', 'action must be "on" or "off".');
      const tunnel = runtime();
      const config = loadOrCreateHubConfig(configFile());
      const at = now();
      const accept = input['acceptUnverifiedReachability'] === true;

      if (action === 'off') {
        const configured = config.exposure.tunnel;
        if (configured === undefined) throw new AdminError('conflict', 'The tunnel is not configured.');
        const confirmToken = confirmations.issue({ action: TUNNEL_OFF_ACTION, digest: digestOf('off', configured.hostname, false), bindingId: ADMIN_BINDING, now: at });
        return {
          confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: [...TUNNEL_OFF_CONSEQUENCE_CLASS],
          summary: {
            action: 'off', hostname: configured.hostname, stopsConnector: true, removesProxyConfiguration: true, tokenKept: true,
            returnsToPrivateMode: config.exposure.mode === 'public', restartRequired: true,
            note: 'The Cloudflare dashboard still routes the hostname to this machine until you delete the public hostname or the tunnel there.',
          },
        };
      }

      const hostname = hostnameFor(input, config.exposure.tunnel?.hostname);
      try { applyTunnelChange(config, { hostname }); } catch (error) { throw new AdminError('conflict', (error as Error).message); }
      if (!tunnel.facts().supported) throw new AdminError('unsupported', 'The managed tunnel runs only in the Windows Hub; it is not available in this deployment.');
      const readiness = await readinessFor(hostname, accept, input['hostFacts']);
      // The connector is started and checked at apply time; a preview never starts a process, so its state is not a finding here.
      const atApply = (b: Blocker): boolean => b.id === 'tunnel-connector-ready';
      const blockers = readiness.blockers.filter((b) => !atApply(b));
      if (blockers.length > 0) throw refusal(blockers, readiness.warnings);
      const confirmToken = confirmations.issue({ action: TUNNEL_ON_ACTION, digest: digestOf('on', hostname, accept), bindingId: ADMIN_BINDING, now: at });
      return {
        confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: [...TUNNEL_ON_CONSEQUENCE_CLASS],
        requiredPhrase: HUB_TUNNEL_PHRASE,
        readiness: { ready: true, blockers: [], warnings: readiness.warnings, checkedAtApply: ['tunnel-connector-ready'] },
        summary: {
          action: 'on', hostname, port: context.getPort(), widensExposure: true, tokenStored: tunnel.tokenPresent(), needsConnectorToken: !tunnel.tokenPresent(),
          startsConnector: true, writesProxyConfiguration: true, restartRequired: true,
          dashboard: hubTunnelDashboard(hostname, context.getPort()),
          disclosure: [...HUB_TUNNEL_DISCLOSURE],
        },
      };
    },

    /** Step two: stores the token, starts the connector, runs the gate and only then writes the configuration. */
    'network.tunnel.apply': async (params) => {
      const input = record(params);
      const action = input['action'];
      if (action !== 'on' && action !== 'off') throw new AdminError('bad-request', 'action must be "on" or "off".');
      const confirmToken = input['confirmToken'];
      if (typeof confirmToken !== 'string' || confirmToken.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
      const tunnel = runtime();
      const file = configFile();
      if (applying) throw new AdminError('conflict', 'Another tunnel change is in progress.');
      applying = true;
      try {
        const config = loadOrCreateHubConfig(file);
        const accept = input['acceptUnverifiedReachability'] === true;

        if (action === 'off') {
          const configured = config.exposure.tunnel;
          if (configured === undefined) throw new AdminError('conflict', 'The tunnel is not configured.');
          const forgetToken = input['forgetToken'] === true;
          const result = confirmations.consumeDetailed({ token: confirmToken, action: TUNNEL_OFF_ACTION, digest: digestOf('off', configured.hostname, false), bindingId: ADMIN_BINDING, now: now() });
          if (result === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
          if (result === 'digest-mismatch') throw new AdminError('conflict', 'The configuration changed since the preview. Run the preview again.');
          await tunnel.stop();
          writeHubConfig(file, applyTunnelChange(config, null));
          const forgotten = forgetToken ? tunnel.forgetToken() : false;
          auditCli('tunnel.disabled', 'success', { hostname: configured.hostname, forgotten });
          return { tunnel: null, previous: { hostname: configured.hostname }, tokenForgotten: forgotten, restartRequired: true };
        }

        // on: cheap checks first, so a typo burns neither the confirmation nor a connector start.
        const hostname = hostnameFor(input, config.exposure.tunnel?.hostname);
        if (input['acknowledgement'] !== HUB_TUNNEL_PHRASE) {
          throw new AdminError('refused', `To publish the Hub through Cloudflare, type the exact phrase "${HUB_TUNNEL_PHRASE}".`, { requiredPhrase: HUB_TUNNEL_PHRASE });
        }
        let next;
        try { next = applyTunnelChange(config, { hostname }); } catch (error) { throw new AdminError('conflict', (error as Error).message); }
        const supplied = input['connectorToken'];
        if (supplied !== undefined && (typeof supplied !== 'string' || !TOKEN_SHAPE.test(supplied.trim()))) {
          throw new AdminError('bad-request', 'The connector token is not in the shape Cloudflare issues (copy the whole token from the dashboard).');
        }
        if (supplied === undefined && !tunnel.tokenPresent()) {
          throw new AdminError('bad-request', 'No connector token is stored. Supply it with --token-stdin.');
        }
        const result = confirmations.consumeDetailed({ token: confirmToken, action: TUNNEL_ON_ACTION, digest: digestOf('on', hostname, accept), bindingId: ADMIN_BINDING, now: now() });
        if (result === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
        if (result === 'digest-mismatch') throw new AdminError('conflict', 'The hostname or the Hub configuration changed since the preview. Run the preview again.');

        if (typeof supplied === 'string') {
          try { tunnel.putToken(supplied.trim()); } catch { throw new AdminError('unavailable', 'The connector token could not be stored on this machine.'); }
          auditCli('tunnel.token-set', 'success', {});
        }
        const wasRunning = tunnel.supervisorStatus().state === 'running';
        const stopIfOurs = async (): Promise<void> => { if (!wasRunning && config.exposure.tunnel === undefined) await tunnel.stop().catch(() => undefined); };
        try {
          await tunnel.start();
        } catch (error) {
          const code = error instanceof TunnelStartError ? error.code : 'start-failed';
          // A TunnelStartError message is value-free by construction; anything else is not echoed.
          throw new AdminError('tunnel-failed', error instanceof TunnelStartError ? error.message : 'The tunnel connector could not be started.', { reason: code });
        }
        if (!(await tunnel.waitReady(context.tunnelReadyTimeoutMs ?? TUNNEL_READY_TIMEOUT_MS))) {
          const status = tunnel.supervisorStatus();
          await stopIfOurs();
          throw new AdminError('tunnel-failed', 'The tunnel connector did not connect to Cloudflare in time. Check the token and the Cloudflare dashboard, then run the preview again.', { reason: status.lastError ?? 'not-ready' });
        }
        const readiness = await readinessFor(hostname, accept, input['hostFacts']);
        if (!readiness.ready) {
          await stopIfOurs();
          throw refusal(readiness.blockers, readiness.warnings);
        }
        writeHubConfig(file, next);
        const warningIds = readiness.warnings.map((w) => w.id);
        auditCli('tunnel.enabled', 'success', { hostname, acceptedUnverifiedReachability: accept, warnings: warningIds });
        return { tunnel: { hostname }, warnings: warningIds, restartRequired: true, disclosure: [...HUB_TUNNEL_DISCLOSURE], status: tunnel.status() };
      } finally {
        applying = false;
      }
    },
  };
}
