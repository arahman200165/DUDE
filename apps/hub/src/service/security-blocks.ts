import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';

export interface SecurityBlocksOptions { action: 'list' | 'clear'; ip?: string; dataDir?: string; installDir?: string }

/**
 * `dude-hub security blocks list|clear <address>`: the elevated recovery path for addresses the Hub blocked after repeated
 * failed credentials or a request flood. The block table belongs to the running Hub, so both actions need it running and go
 * through the admin channel (`security.blocks.list|clear`; a clear is audited as `security.ip-unblocked`).
 */
export async function runSecurityBlocks(options: SecurityBlocksOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  if (options.action === 'clear' && options.ip === undefined) {
    d.err('Usage: dude-hub security blocks clear <address>.\n');
    return EXIT_USAGE;
  }
  const state = await serviceState(d);
  if (state !== 'not-installed' && state !== 'unknown') {
    const refused = await requireElevated(d, 'Managing blocked addresses');
    if (refused !== null) return refused;
  }
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. Blocked addresses are held by the running Hub; start it and run this again.\n');
    return EXIT_FAILURE;
  }
  try {
    if (options.action === 'list') {
      d.out(json(await d.call(dataRoot, 'security.blocks.list', {})));
      return EXIT_OK;
    }
    const result = (await d.call(dataRoot, 'security.blocks.clear', { ip: options.ip })) as { cleared: boolean };
    d.out(json(result));
    if (!result.cleared) d.err('That address was not blocked.\n');
    return EXIT_OK;
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}
