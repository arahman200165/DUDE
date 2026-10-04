import { existsSync } from 'node:fs';
import path from 'node:path';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import { hubPaths } from '../config/data-dir.js';
import { applyProxyChange, exposureReadModel, loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import {
  EXIT_FAILURE, EXIT_OK, EXIT_USAGE, addFirewallRule, defaultInstallDir, deleteFirewallRule, firewallRuleExists, json, requireElevated,
  resolveDeps, serviceDataDir, serviceState, tryAdminStatus,
} from './common.js';
import type { ServiceDeps } from './common.js';
import { runServiceControl } from './lifecycle.js';
import { formatReadiness, PUBLIC_EXPOSURE_PHRASE } from '../diagnostics/readiness.js';
import type { Blocker } from '../diagnostics/readiness.js';
import { gatherPublicFirewallFact } from './firewall.js';
import { auditNativeListeners } from './listeners.js';

export interface NetworkOptions {
  action: 'lan-on' | 'lan-off' | 'status' | 'proxy-on' | 'proxy-off' | 'proxy-status' | 'mode-private' | 'mode-public';
  /** `proxy-on`: trusted proxy addresses or CIDRs. */
  trusted?: string[];
  /** `proxy-on`: the externally visible `https://name[:port]`. */
  publicOrigin?: string;
  /** `mode-public`: `--accept-unverified-reachability` (a missing or stale external-reachability record becomes a warning; audited). */
  acceptUnverifiedReachability?: boolean;
  /** `mode-public`: the `--type` confirmation phrase. Without it only the readiness report is printed. */
  type?: string;
  dataDir?: string;
  installDir?: string;
}

/**
 * `dude-hub network lan on|off|status`.
 * Installed service: the change goes through the admin channel (`network.set`, audited), then the Private-profile
 * firewall rule is added or removed and the service restarts so the bind applies.
 * Foreground dev (no service): the config file is edited directly, only while no Hub is running; no firewall, no restart.
 */
export async function runNetwork(options: NetworkOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const state = await serviceState(d);
  const installed = state !== 'not-installed' && state !== 'unknown';
  if (installed) {
    const refused = await requireElevated(d, 'Changing the network mode');
    if (refused !== null) return refused;
  }
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const paths = hubPaths(dataRoot);
  const installDir = path.resolve(options.installDir ?? defaultInstallDir(d.env));
  const admin = await tryAdminStatus(d, dataRoot);

  if (options.action === 'status' || options.action === 'proxy-status') {
    const configured = existsSync(paths.configFile) ? loadOrCreateHubConfig(paths.configFile) : null;
    const reported = admin?.['exposure'];
    const exposure = reported ?? (configured ? exposureReadModel(configured, { port: configured.port }, null) : null);
    d.out(json({
      running: admin !== null,
      exposure,
      runningBind: admin?.['bind'] ?? null,
      configuredBind: configured?.bind ?? null,
      port: admin?.['port'] ?? configured?.port ?? null,
      firewallRule: d.platform === 'win32' ? await firewallRuleExists(d.exec) : null,
      serviceState: state,
    }));
    return EXIT_OK;
  }

  if (options.action === 'proxy-on' || options.action === 'proxy-off' || options.action === 'mode-private' || options.action === 'mode-public') {
    return runExposureChange(options, { d, deps, dataRoot, paths, installDir, admin, installed, state });
  }

  const bind = options.action === 'lan-on' ? 'lan' : 'loopback';
  let port: number;
  let restartNeeded = false;
  if (admin !== null) {
    if (!installed) {
      d.err('A Hub is running in the foreground. Stop it and run this command again, or start it with --bind.\n');
      return EXIT_FAILURE;
    }
    try {
      const result = (await d.call(dataRoot, 'network.set', { bind })) as { port?: number; restartRequired?: boolean };
      port = result.port ?? HUB_DEFAULT_PORT;
      restartNeeded = true;
    } catch (error) {
      d.err(`${(error as Error).message}\n`);
      return EXIT_FAILURE;
    }
  } else {
    // No running Hub: edit the config directly (it is service-owned, so only while nothing else can write it).
    try {
      const config = loadOrCreateHubConfig(paths.configFile);
      if (config.bind === 'container') { d.err('Container mode always binds all interfaces.\n'); return EXIT_FAILURE; }
      config.bind = bind;
      writeHubConfig(paths.configFile, config);
      port = config.port;
    } catch (error) {
      d.err(`${(error as Error).message}\n`);
      return EXIT_FAILURE;
    }
    if (installed) d.err('The Hub is not running, so the change was written to its config directly and is not audited. It applies at the next start.\n');
    else d.err('No Windows service is installed: the config was edited only. Start the Hub with "dude-hub run" to apply it; no firewall rule was changed.\n');
  }

  if (installed) {
    const rule = bind === 'lan' ? await addFirewallRule(d.exec, port, installDir) : await deleteFirewallRule(d.exec);
    if (rule.code !== 0 && bind === 'lan') {
      d.err(`The firewall rule could not be added: ${(rule.stderr || rule.stdout).trim()}\n`);
      return EXIT_FAILURE;
    }
    if (restartNeeded && state === 'running') {
      const code = await runServiceControl('restart', { dataDir: dataRoot, installDir }, deps);
      if (code !== EXIT_OK) return code;
    }
  }
  d.out(json({ bind, port, firewallRule: installed ? bind === 'lan' : null, restarted: installed && restartNeeded && state === 'running' }));
  return EXIT_OK;
}

interface ExposureContext {
  d: ReturnType<typeof resolveDeps>;
  deps: ServiceDeps;
  dataRoot: string;
  paths: ReturnType<typeof hubPaths>;
  installDir: string;
  admin: Record<string, unknown> | null;
  installed: boolean;
  state: Awaited<ReturnType<typeof serviceState>>;
}

/**
 * `network proxy on|off` and `network mode private|public`. With a running service the change goes through the admin channel
 * (`network.proxy.set`, `network.mode.set`; audited). Turning the proxy on or off restarts the service so the bind applies, and
 * turning it on removes the LAN firewall rule (the Hub then listens on loopback only). The exposure mode is only enforced at start.
 */
async function runExposureChange(options: NetworkOptions, context: ExposureContext): Promise<number> {
  const { d, dataRoot, paths, installDir, admin, installed, state } = context;
  const proxyAction = options.action === 'proxy-on' || options.action === 'proxy-off';
  if (options.action === 'mode-public') return runPublicMode(options, context);
  let result: Record<string, unknown>;
  let restartNeeded = false;
  if (admin !== null) {
    if (!installed) {
      d.err('A Hub is running in the foreground. Stop it and run this command again.\n');
      return EXIT_FAILURE;
    }
    try {
      result = (await d.call(
        dataRoot,
        proxyAction ? 'network.proxy.set' : 'network.mode.set',
        proxyAction
          ? { enabled: options.action === 'proxy-on', ...(options.action === 'proxy-on' ? { trusted: options.trusted ?? [], publicOrigin: options.publicOrigin ?? '' } : {}) }
          : { mode: 'private' },
      )) as Record<string, unknown>;
      restartNeeded = proxyAction;
    } catch (error) {
      d.err(`${(error as Error).message}\n`);
      return EXIT_FAILURE;
    }
  } else {
    try {
      const config = loadOrCreateHubConfig(paths.configFile);
      if (proxyAction) {
        const next = applyProxyChange(config, options.action === 'proxy-on' ? { trusted: options.trusted ?? [], publicOrigin: options.publicOrigin ?? '' } : null);
        writeHubConfig(paths.configFile, next);
        result = { proxy: next.exposure.proxy ? { trustedCount: next.exposure.proxy.trusted.length, publicOrigin: next.exposure.proxy.publicOrigin } : null, bind: next.bind };
      } else {
        writeHubConfig(paths.configFile, { ...config, exposure: { ...config.exposure, mode: 'private' } });
        result = { mode: 'private', previous: config.exposure.mode };
      }
    } catch (error) {
      d.err(`${(error as Error).message}\n`);
      return EXIT_FAILURE;
    }
    d.err(installed
      ? 'The Hub is not running, so the change was written to its config directly and is not audited. It applies at the next start.\n'
      : 'No Windows service is installed: the config was edited only. Start the Hub with "dude-hub run" to apply it.\n');
  }

  if (installed && options.action === 'proxy-on') {
    const removed = await deleteFirewallRule(d.exec);
    void removed; // an absent rule is fine; the Hub now listens on loopback only
  }
  if (installed && restartNeeded && state === 'running') {
    const code = await runServiceControl('restart', { dataDir: dataRoot, installDir }, context.deps);
    if (code !== EXIT_OK) return code;
  }
  if (options.action === 'proxy-on') {
    d.err('Next: register the proxy certificate so enrolled devices can connect through it: "dude-hub tls proxy-pin add <proxy-leaf.pem>", then wait for devices to acknowledge and run "dude-hub tls proxy-pin activate".\n');
  }
  d.out(json({ ...result, restarted: installed && restartNeeded && state === 'running' }));
  return EXIT_OK;
}

/**
 * `network mode public` (PD-066). The gate lives in the running Hub (`network.mode.set` over the elevated admin channel), because it
 * needs the live diagnostics report. The CLI adds what only an elevated Windows terminal can see (the Public firewall rule and the
 * native-listener audit), prints the blockers and warnings with their fixes, and sends the typed phrase. Without `--type` nothing is
 * written: it prints the readiness report and exits non-zero.
 */
async function runPublicMode(options: NetworkOptions, context: ExposureContext): Promise<number> {
  const { d, dataRoot, installDir, admin, installed } = context;
  if (admin === null) {
    d.err('The Hub is not running. Start the Hub so readiness can be verified ("dude-hub service start", or "dude-hub run"), then run this command again.\n');
    return EXIT_FAILURE;
  }
  if (!installed) {
    d.err('A Hub is running in the foreground. Stop it, install and start the service, and run this command again.\n');
    return EXIT_FAILURE;
  }
  const hostFacts: Record<string, unknown> = {};
  if (d.platform === 'win32') {
    const port = typeof admin['port'] === 'number' ? admin['port'] : HUB_DEFAULT_PORT;
    hostFacts['publicFirewall'] = await gatherPublicFirewallFact(d.exec, port, installDir);
    const audit = await auditNativeListeners(d.exec, d.platform);
    hostFacts['nativeListeners'] = { exposed: audit.exposed, desktopLan: audit.desktopLan, partial: audit.partial };
  }
  try {
    const result = (await d.call(dataRoot, 'network.mode.set', {
      mode: 'public',
      ...(options.type !== undefined ? { acknowledgement: options.type } : {}),
      ...(options.acceptUnverifiedReachability ? { acceptUnverifiedReachability: true } : {}),
      hostFacts,
    })) as Record<string, unknown>;
    const warnings = Array.isArray(result['warnings']) ? (result['warnings'] as string[]) : [];
    if (warnings.length > 0) d.err(`Exposed with warnings: ${warnings.join(', ')}. Run "dude-hub doctor" for details.\n`);
    d.err('The Hub is now configured for Internet exposure. Restart it to apply: "dude-hub service restart". Return to private any time with "dude-hub network mode private".\n');
    d.out(json({ ...result, restarted: false }));
    return EXIT_OK;
  } catch (error) {
    const detail = (error as { detail?: { ready?: boolean; blockers?: Blocker[]; warnings?: Blocker[] } }).detail;
    if (detail && Array.isArray(detail.blockers) && Array.isArray(detail.warnings)) {
      const ready = detail.blockers.length === 0;
      d.err(`${formatReadiness({ ready, blockers: detail.blockers, warnings: detail.warnings })}\n`);
      if (ready) {
        d.err(options.type === undefined
          ? `Nothing was changed. To expose the Hub to the Internet, re-run with: --type "${PUBLIC_EXPOSURE_PHRASE}"\n`
          : `${(error as Error).message}\n`);
        return EXIT_USAGE;
      }
      d.err(`${(error as Error).message} Nothing was changed.\n`);
      return EXIT_FAILURE;
    }
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}
