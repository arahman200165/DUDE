import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { hubPaths } from '../config/data-dir.js';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import {
  EXIT_FAILURE, EXIT_OK, EXIT_USAGE, HUB_EXE, SERVICE_NAME, WRAPPER_EXE, WRAPPER_XML,
  defaultInstallDir, deleteFirewallRule, firewallRuleExists, json, readConfigPort, requireElevated, resolveDeps, serviceDataDir, serviceState,
  tryAdminStatus, waitForHello,
} from './common.js';
import { deleteAcmeRule, deletePublicRule } from './firewall.js';
import type { ResolvedDeps, ServiceDeps } from './common.js';
import { copyStagedFiles, failed, wrapper } from './install.js';

export interface LifecycleOptions { installDir?: string; dataDir?: string }
export interface UpdateOptions extends LifecycleOptions { source?: string }

function context(options: LifecycleOptions, d: ResolvedDeps): { installDir: string; dataRoot: string; port: number } {
  const installDir = path.resolve(options.installDir ?? defaultInstallDir(d.env));
  const dataRoot = serviceDataDir(options.dataDir, d);
  return { installDir, dataRoot, port: readConfigPort(hubPaths(dataRoot).configFile) ?? HUB_DEFAULT_PORT };
}

/** Stops the service and waits until `sc query` reports it stopped (WinSW `stop` already waits; this guards the tail). */
async function stopAndWait(d: ResolvedDeps, installDir: string): Promise<string | null> {
  const state = await serviceState(d);
  if (state === 'stopped') return null;
  const result = await wrapper(d, installDir, 'stop');
  if (result.code !== 0 && (await serviceState(d)) !== 'stopped') return failed(result);
  const deadline = d.now() + 30_000;
  while ((await serviceState(d)) !== 'stopped') {
    if (d.now() >= deadline) return 'The service did not stop within 30 seconds.';
    await d.sleep(500);
  }
  return null;
}

const LOCKED_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * Runs `copy`, retrying while the target is still locked. The SCM can report the service stopped before Windows
 * releases the executable image (process teardown, an antivirus scan of the old binary), so the swap can fail
 * with EPERM/EBUSY for a moment after `stopAndWait`.
 */
export async function copyWhenUnlocked(d: Pick<ResolvedDeps, 'now' | 'sleep'>, copy: () => void, timeoutMs = 30_000): Promise<void> {
  const deadline = d.now() + timeoutMs;
  for (;;) {
    try {
      copy();
      return;
    } catch (error) {
      if (!LOCKED_CODES.has((error as NodeJS.ErrnoException).code ?? '') || d.now() >= deadline) throw error;
      await d.sleep(500);
    }
  }
}

const deviceCountOf =(status: Record<string, unknown> | null): number | null => (typeof status?.['deviceCount'] === 'number' ? status['deviceCount'] : null);

/** `service start|stop|restart`. */
export async function runServiceControl(action: 'start' | 'stop' | 'restart', options: LifecycleOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const refused = await requireElevated(d, `service ${action}`);
  if (refused !== null) return refused;
  const { installDir, dataRoot, port } = context(options, d);
  if ((await serviceState(d)) === 'not-installed') {
    d.err(`The ${SERVICE_NAME} service is not installed.\n`);
    return EXIT_FAILURE;
  }
  if (action === 'stop') {
    const problem = await stopAndWait(d, installDir);
    if (problem) { d.err(`${problem}\n`); return EXIT_FAILURE; }
    d.out(json({ state: 'stopped' }));
    return EXIT_OK;
  }
  if (action === 'restart') {
    const problem = await stopAndWait(d, installDir);
    if (problem) { d.err(`${problem}\n`); return EXIT_FAILURE; }
  }
  const start = await wrapper(d, installDir, 'start');
  if (start.code !== 0) { d.err(`The service did not start: ${failed(start)}\n`); return EXIT_FAILURE; }
  const hello = await waitForHello(d, dataRoot, port);
  if (!hello) { d.err(`The service started but the Hub did not answer within ${Math.round(d.helloTimeoutMs / 1000)} seconds.\n`); return EXIT_FAILURE; }
  d.out(json({ state: 'running', hubVersion: hello.hubVersion, bootstrapped: hello.bootstrapped }));
  return EXIT_OK;
}

/** `service status`: SCM state, hello reachability and admin `status` when running. */
export async function runServiceStatus(options: LifecycleOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const refused = await requireElevated(d, 'service status');
  if (refused !== null) return refused;
  const { dataRoot, port } = context(options, d);
  const state = await serviceState(d);
  const hello = state === 'running' ? await d.hello(dataRoot, port) : null;
  const admin = state === 'running' ? await tryAdminStatus(d, dataRoot) : null;
  d.out(json({ installed: state !== 'not-installed', state, reachable: hello !== null, hello, admin }));
  return EXIT_OK;
}

/** Removes the installed binaries. The running executable cannot delete itself on Windows, so it is reported as left over. */
function removeInstalled(installDir: string): string[] {
  const left: string[] = [];
  for (const name of [WRAPPER_EXE, WRAPPER_XML, HUB_EXE, 'DudeHub.wrapper.log', 'service']) {
    const target = path.join(installDir, name);
    if (!existsSync(target)) continue;
    try { rmSync(target, { recursive: true, force: true }); } catch { left.push(target); }
  }
  try { if (existsSync(installDir) && readdirSync(installDir).length === 0) rmSync(installDir, { recursive: true, force: true }); } catch { /* not empty or busy */ }
  return left;
}

/** `service uninstall`: removes the service, firewall rule and binaries; the data directory is always kept. */
export async function runServiceUninstall(options: LifecycleOptions & { keepData?: boolean }, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const refused = await requireElevated(d, 'Uninstalling the DUDE Hub service');
  if (refused !== null) return refused;
  const { installDir, dataRoot } = context(options, d);
  const state = await serviceState(d);

  // Read the impact before stopping: how many registered devices will lose their Hub.
  const status = state === 'running' ? await tryAdminStatus(d, dataRoot) : null;
  const registeredDevices = deviceCountOf(status);

  if (state !== 'not-installed') {
    const problem = await stopAndWait(d, installDir);
    if (problem) { d.err(`${problem}\n`); return EXIT_FAILURE; }
    const removed = existsSync(path.join(installDir, WRAPPER_EXE))
      ? await wrapper(d, installDir, 'uninstall')
      : await d.exec('sc.exe', ['delete', SERVICE_NAME]);
    if (removed.code !== 0) { d.err(`Removing the service failed: ${failed(removed)}\n`); return EXIT_FAILURE; }
  }
  if (await firewallRuleExists(d.exec)) await deleteFirewallRule(d.exec);
  // PD-068: the Public and ACME http-01 rules are CLI-managed and never outlive the service (idempotent).
  await deletePublicRule(d.exec).catch(() => undefined);
  await deleteAcmeRule(d.exec).catch(() => undefined);
  const leftOver = removeInstalled(installDir);
  d.out(json({
    uninstalled: true,
    dataKept: true,
    dataDir: dataRoot,
    registeredDevices,
    ...(leftOver.length > 0 ? { leftOver, note: 'These files are in use and can be deleted after this process exits.' } : {}),
  }));
  d.err(`Your Hub data was kept at ${dataRoot}${registeredDevices !== null ? ` (${registeredDevices} registered device${registeredDevices === 1 ? '' : 's'} will stop syncing until a Hub is running again)` : ''}. Use "dude-hub purge" to delete it.\n`);
  return EXIT_OK;
}

/** `service update --source <dir>`: stop, replace the binaries and web assets, start, verify. Migrations run at service start. */
export async function runServiceUpdate(options: UpdateOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const refused = await requireElevated(d, 'Updating the DUDE Hub service');
  if (refused !== null) return refused;
  if (!options.source) { d.err('Usage: dude-hub service update --source <staged directory>.\n'); return EXIT_USAGE; }
  const source = path.resolve(options.source);
  if (!existsSync(path.join(source, HUB_EXE))) { d.err(`${HUB_EXE} was not found in ${source}.\n`); return EXIT_USAGE; }
  const { installDir, dataRoot } = context(options, d);
  if (path.resolve(installDir) === source) { d.err('The source and the install directory are the same.\n'); return EXIT_USAGE; }
  if ((await serviceState(d)) === 'not-installed') { d.err(`The ${SERVICE_NAME} service is not installed.\n`); return EXIT_FAILURE; }

  const port = readConfigPort(hubPaths(dataRoot).configFile) ?? HUB_DEFAULT_PORT;
  const before = await d.hello(dataRoot, port);
  const devices = deviceCountOf(await tryAdminStatus(d, dataRoot));
  const startedStopping = d.now();

  const problem = await stopAndWait(d, installDir);
  if (problem) { d.err(`${problem}\n`); return EXIT_FAILURE; }
  try {
    await copyWhenUnlocked(d, () => copyStagedFiles(source, installDir, { wrapperToo: false }));
  } catch (error) {
    d.err(`Replacing the binaries failed: ${(error as Error).message}\nStarting the previous version again.\n`);
    await wrapper(d, installDir, 'start');
    return EXIT_FAILURE;
  }
  const start = await wrapper(d, installDir, 'start');
  if (start.code !== 0) { d.err(`The updated service did not start: ${failed(start)}\n`); return EXIT_FAILURE; }
  const after = await waitForHello(d, dataRoot, port);
  if (!after) { d.err(`The updated Hub did not answer within ${Math.round(d.helloTimeoutMs / 1000)} seconds. Check "dude-hub doctor --data-dir ${dataRoot}".\n`); return EXIT_FAILURE; }
  d.out(json({
    updated: true,
    oldHubVersion: before?.hubVersion ?? null,
    newHubVersion: after.hubVersion,
    registeredDevices: devices,
    downtimeMs: d.now() - startedStopping,
    bootstrapped: after.bootstrapped,
  }));
  return EXIT_OK;
}
