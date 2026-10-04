import { callAdmin } from '../admin/admin-client.js';
import { LETS_ENCRYPT_DIRECTORY, LETS_ENCRYPT_STAGING_DIRECTORY } from '../config/hub-config.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ResolvedDeps, ServiceDeps } from './common.js';

export interface TlsAcmeOptions {
  action: 'issue' | 'status';
  names?: string[];
  email?: string;
  agreeTos?: boolean;
  staging?: boolean;
  directory?: string;
  httpPort?: number;
  dataDir?: string;
  installDir?: string;
}

/** An order polls the CA for up to a minute or two; the default 10 s admin timeout would cut it off. */
export const ACME_ADMIN_TIMEOUT_MS = 180_000;

export const TLS_ACME_NEXT_STEPS =
  'The ACME certificate is validated, staged and announced to connected devices. Run "dude-hub tls status" until no device is pending, then "dude-hub tls activate".\n' +
  'The Hub renews an ACME certificate itself (same key) within 30 days of expiry; port 80 (or --http-port) is bound only while an order runs.\n';

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

/**
 * `dude-hub tls acme issue|status`. `issue` orders a certificate over ACME http-01 inside the running Hub (admin method
 * `tls.acme.issue`, audited) and STAGES it through the dual-pin rotation; `status` is read-only.
 */
export async function runTlsAcme(options: TlsAcmeOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const session = await adminSession(d, 'Issuing an ACME certificate', options, options.action === 'issue');
  if (typeof session === 'number') return session;
  const call = deps.call ?? ((dataDir: string, method: string, params: unknown) => callAdmin(dataDir, method, params, options.action === 'issue' ? ACME_ADMIN_TIMEOUT_MS : 10_000));
  try {
    if (options.action === 'status') {
      d.out(json(await call(session.dataRoot, 'tls.acme.status', {})));
      return EXIT_OK;
    }
    let directoryUrl = options.staging ? LETS_ENCRYPT_STAGING_DIRECTORY : options.directory;
    if (directoryUrl === undefined) {
      // No flag: keep the directory saved in hub.json, else default to Let's Encrypt production.
      const status = (await call(session.dataRoot, 'tls.acme.status', {})) as { configured?: boolean };
      if (status.configured !== true) directoryUrl = LETS_ENCRYPT_DIRECTORY;
    }
    d.err('Ordering the certificate; port 80 must be reachable from the Internet for the CA. This can take a minute.\n');
    const result = await call(session.dataRoot, 'tls.acme.issue', {
      names: options.names ?? [],
      ...(directoryUrl !== undefined ? { directoryUrl } : {}),
      ...(options.email !== undefined ? { email: options.email } : {}),
      ...(options.agreeTos ? { agreeTos: true } : {}),
      ...(options.httpPort !== undefined ? { httpPort: options.httpPort } : {}),
    });
    d.out(json(result));
    if (options.staging) d.err('Warning: this certificate came from the Let\'s Encrypt STAGING CA; browsers do not trust it.\n');
    d.err(TLS_ACME_NEXT_STEPS);
    return EXIT_OK;
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}
