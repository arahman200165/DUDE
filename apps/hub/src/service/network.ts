import { existsSync } from 'node:fs';
import path from 'node:path';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import { hubPaths } from '../config/data-dir.js';
import { loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import {
  EXIT_FAILURE, EXIT_OK, EXIT_USAGE, addFirewallRule, defaultInstallDir, deleteFirewallRule, firewallRuleExists, json, requireElevated,
  resolveDeps, serviceDataDir, serviceState, tryAdminStatus,
} from './common.js';
import type { ServiceDeps } from './common.js';
import { runServiceControl } from './lifecycle.js';

export interface NetworkOptions { action: 'lan-on' | 'lan-off' | 'status'; dataDir?: string; installDir?: string }

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

  if (options.action === 'status') {
    const configured = existsSync(paths.configFile) ? loadOrCreateHubConfig(paths.configFile) : null;
    d.out(json({
      running: admin !== null,
      runningBind: admin?.['bind'] ?? null,
      configuredBind: configured?.bind ?? null,
      port: admin?.['port'] ?? configured?.port ?? null,
      firewallRule: d.platform === 'win32' ? await firewallRuleExists(d.exec) : null,
      serviceState: state,
    }));
    return EXIT_OK;
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
