import path from 'node:path';
import {
  HUB_TUNNEL_DASHBOARD_LOCATION, HUB_TUNNEL_DASHBOARD_SERVICE_TYPE, HUB_TUNNEL_DISCLOSURE, HUB_TUNNEL_HOST_HEADER_NOTE, HUB_TUNNEL_NO_TLS_VERIFY_NOTE, HUB_TUNNEL_PHRASE,
} from '@dude/contracts/hub';
import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { readSecretLine } from '../cli/passphrase.js';
import type { ReadPassphraseOptions } from '../cli/passphrase.js';
import { formatReadiness } from '../diagnostics/readiness.js';
import type { Blocker } from '../diagnostics/readiness.js';
import {
  EXIT_FAILURE, EXIT_OK, EXIT_USAGE, defaultInstallDir, deleteFirewallRule, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus,
} from './common.js';
import type { ResolvedDeps, ServiceDeps } from './common.js';
import { runServiceControl } from './lifecycle.js';
import { auditNativeListeners } from './listeners.js';

export type TunnelAction = 'on' | 'off' | 'status';

export interface TunnelCommandOptions {
  action: TunnelAction;
  hostname?: string;
  /** The token printed by the preview; without it only the preview runs. */
  confirm?: string;
  /** `on`: the typed phrase. */
  type?: string;
  /** `on`: read the Cloudflare connector token from standard input (or a no-echo prompt); it is never an argument. */
  tokenStdin?: boolean;
  acceptUnverifiedReachability?: boolean;
  /** `off`: also delete the stored connector token. */
  forgetToken?: boolean;
  dataDir?: string;
  installDir?: string;
}

export interface TunnelCommandDeps extends ServiceDeps {
  /** Standard input for the connector token (default: the process's). */
  stdin?: ReadPassphraseOptions['stdin'];
  /** Replaces the token source (tests). */
  readToken?: () => Promise<string>;
}

/** The connector start waits for the Cloudflare edge, so the apply call gets far longer than an ordinary admin call. */
const APPLY_CALL_MS = 120_000;

const text = (value: unknown, fallback = '(unknown)'): string => (typeof value === 'string' && value.length > 0 ? value : typeof value === 'number' ? String(value) : fallback);

interface PreviewResult {
  confirmToken?: unknown;
  expiresAt?: unknown;
  consequenceClass?: unknown;
  requiredPhrase?: unknown;
  readiness?: { warnings?: Blocker[]; checkedAtApply?: unknown };
  summary?: Record<string, unknown>;
}

/** The readable `on` preview on stderr: exactly what will change, the Cloudflare dashboard values to enter, and the disclosure. */
function onPreviewLines(preview: PreviewResult): string {
  const s = preview.summary ?? {};
  const dashboard = (typeof s['dashboard'] === 'object' && s['dashboard'] !== null ? s['dashboard'] : {}) as Record<string, unknown>;
  const lines = [
    'Tunnel preview (nothing has been changed)',
    `  Domain:       ${text(s['hostname'])} (www.${text(s['hostname'])} redirects to it)`,
    `  Effect:       publishes this Hub on that domain through Cloudflare; the Hub keeps listening on loopback only, no inbound port or firewall rule is opened`,
    `  Writes:       the proxy trust (loopback connector only) and the tunnel setting in hub.json; stores the connector token (${s['tokenStored'] === true ? 'one is already stored' : 'you will supply it with --token-stdin'}); starts the supervised cloudflared; removes the LAN firewall rule (the Hub listens on loopback only)`,
    `  In the Cloudflare dashboard (${HUB_TUNNEL_DASHBOARD_LOCATION}), the hostname must point at:`,
    `    Service:      ${HUB_TUNNEL_DASHBOARD_SERVICE_TYPE}, ${text(dashboard['service'])}`,
    `    TLS:          No TLS Verify = on (${HUB_TUNNEL_NO_TLS_VERIFY_NOTE})`,
    `    HTTP Host Header: ${HUB_TUNNEL_HOST_HEADER_NOTE}`,
  ];
  for (const line of HUB_TUNNEL_DISCLOSURE) lines.push(`  Disclosure:   ${line}`);
  const warnings = preview.readiness?.warnings ?? [];
  for (const warning of warnings) if (warning.id !== 'tunnel-edge-tls') lines.push(`  Warning:      ${warning.id}: ${warning.reason}`);
  lines.push('  Checked when applied: the connector must connect to Cloudflare and the gate is run again.');
  return `${lines.join('\n')}\n`;
}

function offPreviewLines(preview: PreviewResult): string {
  const s = preview.summary ?? {};
  const lines = [
    'Tunnel off preview (nothing has been changed)',
    `  Domain:       ${text(s['hostname'])}`,
    '  Effect:       stops the cloudflared connector and removes the tunnel and its proxy configuration from hub.json; the stored connector token is kept',
    `  Note:         ${text(s['note'], '')}`,
  ];
  if (s['returnsToPrivateMode'] === true) lines.push('  Also:         the exposure mode returns to private (public mode needs a bind that can accept traffic)');
  return `${lines.join('\n')}\n`;
}

/** One-line failure text and the exit code: 2 when the Hub is not running, else 1. */
function failure(d: ResolvedDeps, error: unknown, what: string): number {
  if (error instanceof AdminCallError) {
    const detail = error.detail as { ready?: boolean; blockers?: Blocker[]; warnings?: Blocker[]; reason?: unknown } | undefined;
    switch (error.code) {
      case HUB_NOT_RUNNING:
        d.err('The Hub is not running. The tunnel is managed by the running Hub; start it ("dude-hub service start") and run this again.\n');
        return EXIT_USAGE;
      case 'confirmation-required':
        d.err('The confirmation is missing, expired or already used. Run "dude-hub network tunnel" again without --confirm to get a new token.\n');
        return EXIT_FAILURE;
      case 'timeout':
        d.err(`${what}: the Hub did not answer in time. It may still be working; check "dude-hub network tunnel status" before trying again.\n`);
        return EXIT_FAILURE;
      case 'refused':
        if (detail && Array.isArray(detail.blockers) && detail.blockers.length > 0) {
          d.err(`${formatReadiness({ ready: false, blockers: detail.blockers, warnings: detail.warnings ?? [] })}\n${error.message} Nothing was changed.\n`);
        } else d.err(`${error.message}\n`);
        return EXIT_FAILURE;
      case 'tunnel-failed':
        d.err(`${error.message}${typeof detail?.reason === 'string' ? ` [${detail.reason}]` : ''}\n`);
        return EXIT_FAILURE;
      default:
        d.err(`${error.message}\n`);
        return EXIT_FAILURE;
    }
  }
  d.err(`${error instanceof Error ? error.message : `${what} failed`}\n`);
  return EXIT_FAILURE;
}

/**
 * `dude-hub network tunnel on|off|status` (32-SS1, Milestone 837, PD-143). Every action goes through the admin channel of the running
 * Hub (`network.tunnel.*`); exposure-widening `on` and the connector-stopping `off` are two steps (a preview that writes nothing and
 * a single-use 60-second confirmation) and need the elevated terminal when the service is installed. `on` also needs the typed phrase.
 * The connector token is read from standard input (or a no-echo prompt), travels only in the apply call, and is never printed.
 */
export async function runTunnel(options: TunnelCommandOptions, deps: TunnelCommandDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const state = await serviceState(d);
  const installed = state !== 'not-installed' && state !== 'unknown';
  if (options.action !== 'status' && installed) {
    const refused = await requireElevated(d, options.action === 'on' ? 'Turning on the tunnel' : 'Turning off the tunnel');
    if (refused !== null) return refused;
  }
  const admin = await tryAdminStatus(d, dataRoot);
  if (admin === null) {
    d.err('The Hub is not running. The tunnel is managed by the running Hub; start it ("dude-hub service start", or "dude-hub run") and run this again.\n');
    return EXIT_USAGE;
  }
  const installDir = path.resolve(options.installDir ?? defaultInstallDir(d.env));
  const what = options.action === 'status' ? 'Showing the tunnel' : options.action === 'on' ? 'Turning on the tunnel' : 'Turning off the tunnel';

  try {
    if (options.action === 'status') {
      const status = (await d.call(dataRoot, 'network.tunnel.status', {})) as Record<string, unknown>;
      d.out(json(status));
      if (status['configured'] === true) d.err(`${HUB_TUNNEL_DISCLOSURE.join('\n')}\n`);
      return EXIT_OK;
    }

    if (options.action === 'off') {
      if (options.confirm === undefined) {
        const preview = (await d.call(dataRoot, 'network.tunnel.preview', { action: 'off' })) as PreviewResult;
        d.err(offPreviewLines(preview));
        d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt, consequenceClass: preview.consequenceClass })}\n`);
        d.err('Nothing has been changed. Re-run with --confirm <confirmToken> within 60 seconds to turn the tunnel off (add --forget-token to delete the stored connector token as well).\n');
        return EXIT_OK;
      }
      const result = (await d.call(dataRoot, 'network.tunnel.apply', { action: 'off', confirmToken: options.confirm, ...(options.forgetToken === true ? { forgetToken: true } : {}) }, APPLY_CALL_MS)) as Record<string, unknown>;
      const restarted = await restartIfRunning(d, deps, { dataRoot, installDir, installed, state });
      d.err('The tunnel connector was stopped and the tunnel configuration removed. Also delete the public hostname (or the tunnel) in the Cloudflare dashboard so the domain no longer routes to this machine.\n');
      d.out(json({ ...result, restarted }));
      return EXIT_OK;
    }

    // on
    const hostFacts: Record<string, unknown> = {};
    if (d.platform === 'win32') {
      const audit = await auditNativeListeners(d.exec, d.platform);
      hostFacts['nativeListeners'] = { exposed: audit.exposed, desktopLan: audit.desktopLan, partial: audit.partial };
    }
    const shared = {
      ...(options.hostname !== undefined ? { hostname: options.hostname } : {}),
      ...(options.acceptUnverifiedReachability === true ? { acceptUnverifiedReachability: true } : {}),
      hostFacts,
    };
    if (options.confirm === undefined) {
      const preview = (await d.call(dataRoot, 'network.tunnel.preview', { action: 'on', ...shared })) as PreviewResult;
      d.err(onPreviewLines(preview));
      d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt, consequenceClass: preview.consequenceClass })}\n`);
      const needsToken = preview.summary?.['needsConnectorToken'] === true;
      d.err(`Nothing has been changed. Re-run with --confirm <confirmToken> --type "${HUB_TUNNEL_PHRASE}"${needsToken ? ' --token-stdin' : ''} within 60 seconds (and the same --hostname).\n`);
      return EXIT_OK;
    }
    if (options.type !== HUB_TUNNEL_PHRASE) {
      d.err(`To publish the Hub through Cloudflare, type the exact phrase: --type "${HUB_TUNNEL_PHRASE}". Nothing was changed.\n`);
      return EXIT_USAGE;
    }
    let connectorToken: string | undefined;
    if (options.tokenStdin === true) {
      try {
        connectorToken = deps.readToken !== undefined
          ? await deps.readToken()
          : await readSecretLine({ stdin: deps.stdin ?? process.stdin, stderr: { write: (chunk: string | Uint8Array): boolean => { d.err(String(chunk)); return true; } }, prompt: 'Cloudflare tunnel connector token: ' }, 'connector token');
      } catch (error) {
        d.err(`${error instanceof Error ? error.message : 'The connector token could not be read.'}\n`);
        return EXIT_FAILURE;
      }
    }
    const result = (await d.call(dataRoot, 'network.tunnel.apply', {
      action: 'on', confirmToken: options.confirm, acknowledgement: options.type, ...shared, ...(connectorToken !== undefined ? { connectorToken } : {}),
    }, APPLY_CALL_MS)) as Record<string, unknown>;
    if (installed) void (await deleteFirewallRule(d.exec)); // the Hub listens on loopback only now; an absent rule is fine
    const restarted = await restartIfRunning(d, deps, { dataRoot, installDir, installed, state });
    const warnings = Array.isArray(result['warnings']) ? (result['warnings'] as string[]).filter((w) => w !== 'tunnel-edge-tls') : [];
    if (warnings.length > 0) d.err(`Published with warnings: ${warnings.join(', ')}. Run "dude-hub doctor" for details.\n`);
    d.err(`${restarted ? 'The service was restarted to apply it.' : 'Restart the Hub to apply it ("dude-hub service restart").'} Then verify from outside your network (a phone on cellular data) in the Hub web Settings > Endpoint, and keep the Cloudflare dashboard values from the preview.\n`);
    const { status: _status, ...rest } = result;
    d.out(json({ ...rest, restarted }));
    return EXIT_OK;
  } catch (error) {
    return failure(d, error, what);
  }
}

async function restartIfRunning(
  d: ResolvedDeps, deps: ServiceDeps, context: { dataRoot: string; installDir: string; installed: boolean; state: Awaited<ReturnType<typeof serviceState>> },
): Promise<boolean> {
  if (!context.installed || context.state !== 'running') return false;
  const code = await runServiceControl('restart', { dataDir: context.dataRoot, installDir: context.installDir }, deps);
  if (code !== EXIT_OK) d.err('The service did not restart cleanly; restart it yourself ("dude-hub service restart").\n');
  return code === EXIT_OK;
}
