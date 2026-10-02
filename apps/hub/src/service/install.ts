import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import { ensureLayout } from '../config/data-dir.js';
import { loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import {
  EXIT_FAILURE, EXIT_OK, EXIT_USAGE, HUB_EXE, SERVICE_ACCOUNT, SERVICE_NAME, WRAPPER_EXE, WRAPPER_XML,
  addFirewallRule, defaultInstallDir, json, requireElevated, resolveDeps, serviceDataDir, serviceState, waitForHello,
} from './common.js';
import type { ExecResult, ResolvedDeps, ServiceDeps } from './common.js';
import { buildServiceXml } from './winsw-xml.js';

export interface InstallOptions { installDir?: string; dataDir?: string; port?: number; lan?: boolean }

/** Runs the WinSW wrapper from the install directory. */
export const wrapper = (d: ResolvedDeps, installDir: string, ...args: string[]): Promise<ExecResult> => d.exec(path.join(installDir, WRAPPER_EXE), args);

export const failed = (result: ExecResult): string => (result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`).slice(0, 400);

/** Copies the staged binaries (and web assets) into the install directory when run from elsewhere. */
export function copyStagedFiles(sourceDir: string, installDir: string, options: { wrapperToo: boolean }): string[] {
  const source = path.resolve(sourceDir);
  const target = path.resolve(installDir);
  if (source === target) return [];
  if (!existsSync(path.join(source, HUB_EXE))) throw new Error(`${HUB_EXE} was not found in ${source}. Run this command from the staged Hub directory or pass --source.`);
  if (options.wrapperToo && !existsSync(path.join(source, WRAPPER_EXE))) throw new Error(`${WRAPPER_EXE} (the service wrapper) was not found in ${source}.`);
  mkdirSync(target, { recursive: true });
  const copied: string[] = [];
  const replace = (name: string): void => {
    const temp = path.join(target, `${name}.new`);
    cpSync(path.join(source, name), temp);
    renameSync(temp, path.join(target, name));
    copied.push(name);
  };
  replace(HUB_EXE);
  if (options.wrapperToo) replace(WRAPPER_EXE);
  const web = path.join(source, 'service', 'web');
  if (existsSync(web)) {
    rmSync(path.join(target, 'service', 'web'), { recursive: true, force: true });
    mkdirSync(path.join(target, 'service'), { recursive: true });
    cpSync(web, path.join(target, 'service', 'web'), { recursive: true });
    copied.push('service/web');
  }
  return copied;
}

/** `dude-hub service install`: copies files, registers the WinSW service under NT SERVICE\DudeHub, locks down the data directory, starts and verifies. */
export async function runServiceInstall(options: InstallOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const refused = await requireElevated(d, 'Installing the DUDE Hub service');
  if (refused !== null) return refused;
  const installDir = path.resolve(options.installDir ?? defaultInstallDir(d.env));
  const dataRoot = serviceDataDir(options.dataDir, { env: d.env, platform: d.platform });
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) {
    d.err('--port must be an integer from 1 to 65535.\n');
    return EXIT_USAGE;
  }

  const state = await serviceState(d);
  if (state !== 'not-installed') {
    d.err(`The ${SERVICE_NAME} service is already registered (state: ${state}). Use "dude-hub service update --source <dir>" to update, or "dude-hub service uninstall" first.\n`);
    return EXIT_FAILURE;
  }

  try {
    copyStagedFiles(d.sourceDir, installDir, { wrapperToo: true });
    if (!existsSync(path.join(installDir, WRAPPER_EXE))) throw new Error(`${WRAPPER_EXE} was not found in ${installDir}.`);
    writeFileSync(path.join(installDir, WRAPPER_XML), buildServiceXml({ dataDir: dataRoot }), 'utf8');
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }

  const install = await wrapper(d, installDir, 'install');
  if (install.code !== 0) {
    d.err(`Registering the service failed: ${failed(install)}\n`);
    return EXIT_FAILURE;
  }
  // The virtual account needs no password; the SCM grants it the logon-as-service right.
  const account = await d.exec('sc.exe', ['config', SERVICE_NAME, 'obj=', SERVICE_ACCOUNT]);
  if (account.code !== 0) {
    d.err(`Setting the service account failed: ${failed(account)}\nThe service is registered but not started; run "dude-hub service uninstall" to remove it.\n`);
    return EXIT_FAILURE;
  }

  // Lock the data directory down before the Hub writes anything into it: SYSTEM and Administrators full, the service account modify.
  mkdirSync(dataRoot, { recursive: true });
  const acl = await d.exec('icacls', [dataRoot, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', `${SERVICE_ACCOUNT}:(OI)(CI)M`]);
  if (acl.code !== 0) {
    d.err(`Securing the data directory failed: ${failed(acl)}\nThe service was not started.\n`);
    return EXIT_FAILURE;
  }
  // The account must also be able to read the binaries when the install directory is not under Program Files.
  const read = await d.exec('icacls', [installDir, '/grant', `${SERVICE_ACCOUNT}:(OI)(CI)RX`]);
  if (read.code !== 0) d.err(`Warning: granting the service account read access to the install directory failed: ${failed(read)}\n`);

  const paths = ensureLayout(dataRoot);
  mkdirSync(path.join(paths.logsDir, 'service'), { recursive: true });
  const config = loadOrCreateHubConfig(paths.configFile);
  config.port = options.port ?? config.port ?? HUB_DEFAULT_PORT;
  config.bind = options.lan === true ? 'lan' : 'loopback';
  const web = path.join(installDir, 'service', 'web');
  if (existsSync(web)) config.webRoot = web;
  writeHubConfig(paths.configFile, config);

  if (options.lan === true) {
    const rule = await addFirewallRule(d.exec, config.port, installDir);
    if (rule.code !== 0) d.err(`Warning: the LAN firewall rule could not be added: ${failed(rule)}\n`);
  }

  const start = await wrapper(d, installDir, 'start');
  if (start.code !== 0) {
    d.err(`The service was installed but did not start: ${failed(start)}\n`);
    return EXIT_FAILURE;
  }
  const hello = await waitForHello(d, dataRoot, config.port);
  if (!hello) {
    d.err(`The service was installed and started, but the Hub did not answer within ${Math.round(d.helloTimeoutMs / 1000)} seconds. See ${path.join(paths.logsDir, 'service')} and "dude-hub doctor --data-dir ${dataRoot}".\n`);
    return EXIT_FAILURE;
  }
  d.out(json({
    installed: true,
    url: `https://127.0.0.1:${config.port}`,
    spkiSha256: hello.tls.spkiSha256,
    hubVersion: hello.hubVersion,
    bind: config.bind,
    installDir,
    dataDir: dataRoot,
  }));
  return EXIT_OK;
}
