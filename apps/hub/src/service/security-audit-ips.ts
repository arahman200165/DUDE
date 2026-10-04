import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';

export interface SecurityAuditIpsOptions { mode?: 'full' | 'truncated'; dataDir?: string; installDir?: string }

/**
 * `dude-hub security audit-ips [full|truncated]`: shows or sets whether new audit rows and session records keep client addresses
 * in full or truncated (IPv4 a.b.c.0, IPv6 first three groups). Existing rows are not rewritten. The setting belongs to the running
 * Hub, so both forms go through the admin channel (`security.audit-ips.get|set`; a change is audited as `security.audit-ips-changed`).
 */
export async function runSecurityAuditIps(options: SecurityAuditIpsOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const state = await serviceState(d);
  if (state !== 'not-installed' && state !== 'unknown') {
    const refused = await requireElevated(d, 'Changing audit address privacy');
    if (refused !== null) return refused;
  }
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. The audit address setting is held by the running Hub; start it and run this again.\n');
    return EXIT_FAILURE;
  }
  try {
    d.out(json(options.mode === undefined ? await d.call(dataRoot, 'security.audit-ips.get', {}) : await d.call(dataRoot, 'security.audit-ips.set', { mode: options.mode })));
    return EXIT_OK;
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}
