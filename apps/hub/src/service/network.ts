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

export interface NetworkOptions {
  action: 'lan-on' | 'lan-off' | 'status' | 'proxy-on' | 'proxy-off' | 'proxy-status' | 'mode-private' | 'mode-public';
  /** `proxy-on`: trusted proxy addresses or CIDRs. */
  trusted?: string[];
  /** `proxy-on`: the externally visible `https://name[:port]`. */
  publicOrigin?: string;
  /** `mode-public`: the operator passed `--i-understand-unreleased`. */
  acknowledgeUnreleased?: boolean;
  dataDir?: string;
  installDir?: string;
}

const PUBLIC_REFUSAL =
  'Public exposure is not released until Phase 31F. Re-run with --i-understand-unreleased to write it to the config anyway; ' +
  'even then the Hub will not start in public mode unless DUDE_HUB_UNRELEASED_PUBLIC=1 is set in its environment.';

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
  if (options.action === 'mode-public' && options.acknowledgeUnreleased !== true) {
    d.err(`${PUBLIC_REFUSAL}\n`);
    return EXIT_USAGE;
  }
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
          : { mode: options.action === 'mode-public' ? 'public' : 'private', ...(options.acknowledgeUnreleased ? { acknowledge: true } : {}) },
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
        const mode = options.action === 'mode-public' ? 'public' : 'private';
        writeHubConfig(paths.configFile, { ...config, exposure: { ...config.exposure, mode } });
        result = { mode, previous: config.exposure.mode };
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
  if (options.action === 'mode-public') {
    d.err('Public exposure is not released until Phase 31F: the Hub will refuse to start in public mode unless DUDE_HUB_UNRELEASED_PUBLIC=1 is set in its environment.\n');
  }
  d.out(json({ ...result, restarted: installed && restartNeeded && state === 'running' }));
  return EXIT_OK;
}
