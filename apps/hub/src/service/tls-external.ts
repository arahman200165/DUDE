import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ResolvedDeps, ServiceDeps } from './common.js';

export interface TlsImportOptions { cert: string; key: string; chain?: string; dataDir?: string; installDir?: string; cwd?: string }

export interface TlsProxyPinOptions {
  action: 'add' | 'remove' | 'list' | 'activate';
  /** `add`: a PEM certificate file path or a raw base64url SPKI pin. `remove`: the SPKI to remove. */
  value?: string;
  force?: boolean;
  confirm?: string;
  dataDir?: string;
  installDir?: string;
  cwd?: string;
}

export const TLS_IMPORT_NEXT_STEPS =
  'The imported certificate is validated, staged and announced to connected devices. Run "dude-hub tls status" until no device is pending, then "dude-hub tls activate".\n' +
  'Imported certificates are not renewed by the Hub: import a replacement well before this one expires.\n';

/** Resolves the data root and, when the service is installed, demands elevation; then insists a Hub answers on the admin channel. */
async function adminSession(d: ResolvedDeps, what: string, options: { dataDir?: string }, needsElevation: boolean): Promise<{ dataRoot: string } | number> {
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  if (needsElevation) {
    const state = await serviceState(d);
    if (state !== 'not-installed' && state !== 'unknown') {
      const refused = await requireElevated(d, what);
      if (refused !== null) return refused;
    }
  }
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. Start it (service or "dude-hub run"), then run the command again.\n');
    return EXIT_USAGE;
  }
  return { dataRoot };
}

function readPem(file: string, cwd: string, what: string, d: ResolvedDeps): string | null {
  const resolved = path.resolve(cwd, file);
  if (!existsSync(resolved)) { d.err(`The ${what} file ${resolved} does not exist.\n`); return null; }
  try {
    return readFileSync(resolved, 'utf8');
  } catch (error) {
    d.err(`Could not read ${resolved}: ${(error as Error).message}\n`);
    return null;
  }
}

/**
 * `dude-hub tls import --cert <pem> --key <pem> [--chain <pem>]`: reads the files here and sends the PEM text over the admin
 * channel (`tls.import.stage`, audited), where the Hub validates and STAGES it through the dual-pin rotation.
 */
export async function runTlsImport(options: TlsImportOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const cwd = options.cwd ?? process.cwd();
  const cert = readPem(options.cert, cwd, 'certificate', d);
  const key = readPem(options.key, cwd, 'private key', d);
  const chain = options.chain !== undefined ? readPem(options.chain, cwd, 'chain', d) : undefined;
  if (cert === null || key === null || chain === null) return EXIT_FAILURE;
  const session = await adminSession(d, 'Importing a certificate', options, true);
  if (typeof session === 'number') return session;
  try {
    const result = (await d.call(session.dataRoot, 'tls.import.stage', { cert, key, ...(chain !== undefined ? { chain } : {}) })) as { warnings?: string[] };
    d.out(json(result));
    for (const warning of result.warnings ?? []) d.err(`Warning: ${warning}\n`);
    d.err(TLS_IMPORT_NEXT_STEPS);
    return EXIT_OK;
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}

/**
 * `dude-hub tls proxy-pin add|remove|list|activate` for reverse-proxy deployments: TLS ends at the operator's proxy, so
 * devices must pin the proxy's leaf. `add` stages it, devices acknowledge, `activate` and `remove` are two-step (preview, then
 * `--confirm <token>`). `list` and the previews change nothing.
 */
export async function runTlsProxyPin(options: TlsProxyPinOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const session = await adminSession(d, 'Changing proxy pins', options, options.action !== 'list');
  if (typeof session === 'number') return session;
  const { dataRoot } = session;
  try {
    if (options.action === 'list') {
      d.out(json(await d.call(dataRoot, 'tls.proxy.list', {})));
      return EXIT_OK;
    }
    if (options.action === 'add') {
      let pin = options.value ?? '';
      if (!/^[A-Za-z0-9_-]{43}$/.test(pin)) {
        const pem = readPem(pin, options.cwd ?? process.cwd(), 'proxy certificate (or pass a base64url SPKI pin)', d);
        if (pem === null) return EXIT_USAGE;
        pin = pem;
      }
      d.out(json(await d.call(dataRoot, 'tls.proxy.add', { pin })));
      d.err('The proxy pin is staged and announced to connected devices. Run "dude-hub tls proxy-pin list" until no device is pending, then "dude-hub tls proxy-pin activate".\n');
      return EXIT_OK;
    }
    if (options.action === 'activate') {
      const force = options.force === true;
      if (options.confirm === undefined) {
        d.out(json(await d.call(dataRoot, 'tls.proxy.activate.preview', { force })));
        d.err(`Nothing has changed. Re-run with --confirm <confirmToken>${force ? ' --force' : ''} within 60 seconds to activate the staged proxy pin.\n`);
        return EXIT_OK;
      }
      d.out(json(await d.call(dataRoot, 'tls.proxy.activate.apply', { confirmToken: options.confirm, force })));
      return EXIT_OK;
    }
    if (options.value === undefined) { d.err('Usage: dude-hub tls proxy-pin remove <spki> [--confirm <token>].\n'); return EXIT_USAGE; }
    if (options.confirm === undefined) {
      d.out(json(await d.call(dataRoot, 'tls.proxy.remove.preview', { spkiSha256: options.value })));
      d.err('Nothing has changed. Re-run with --confirm <confirmToken> within 60 seconds to remove the proxy pin. Removing the ACTIVE proxy pin means devices can no longer connect through the proxy.\n');
      return EXIT_OK;
    }
    d.out(json(await d.call(dataRoot, 'tls.proxy.remove.apply', { spkiSha256: options.value, confirmToken: options.confirm })));
    return EXIT_OK;
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}
