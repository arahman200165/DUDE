import { AdminCallError } from '../admin/admin-client.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';

export interface StandbyOptions { action: 'list' | 'grant' | 'revoke'; deviceId?: string; confirm?: string; dataDir?: string; installDir?: string }

interface Preview { confirmToken: string; expiresAt: string; consequenceClass: string[]; summary: Record<string, unknown> }

/**
 * `dude-hub standby list | grant <deviceId> | revoke <deviceId> [--confirm <token>]` (32-SS1, Milestone 849, PD-151): the owner's
 * warm-standby grant, held by the running Hub, so every action needs it running and goes through the admin channel
 * (`standby.list`, `standby.grant.preview|apply`, `standby.revoke.preview|apply`). Grant and revoke are two-step: without `--confirm`
 * the preview prints what would change and a 60-second token, and nothing changes.
 */
export async function runStandby(options: StandbyOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  if (options.action !== 'list' && options.deviceId === undefined) {
    d.err(`Usage: dude-hub standby ${options.action} <deviceId> [--confirm <token>].\n`);
    return EXIT_USAGE;
  }
  const state = await serviceState(d);
  if (state !== 'not-installed' && state !== 'unknown') {
    const refused = await requireElevated(d, 'Managing warm-standby access');
    if (refused !== null) return refused;
  }
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. Standby grants are held by the running Hub; start it and run this again.\n');
    return EXIT_FAILURE;
  }
  try {
    if (options.action === 'list') {
      d.out(json(await d.call(dataRoot, 'standby.list', {})));
      return EXIT_OK;
    }
    const deviceId = options.deviceId!;
    if (options.confirm === undefined) {
      const preview = (await d.call(dataRoot, `standby.${options.action}.preview`, { deviceId })) as Preview;
      const lines = [`Standby ${options.action} preview (nothing has been changed)`, `  consequence: ${preview.consequenceClass.join(', ')}`];
      for (const [name, value] of Object.entries(preview.summary ?? {})) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') lines.push(`  ${name}: ${String(value)}`);
      }
      d.err(`${lines.join('\n')}\n`);
      d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt })}\n`);
      d.err(`Nothing has been changed. Re-run with --confirm <confirmToken> within 60 seconds to ${options.action} standby access for this device.\n`);
      return EXIT_OK;
    }
    d.out(json(await d.call(dataRoot, `standby.${options.action}.apply`, { deviceId, confirmToken: options.confirm })));
    return EXIT_OK;
  } catch (error) {
    if (error instanceof AdminCallError && error.code === 'confirmation-required') {
      d.err(`The confirmation is missing, expired or already used. Run "dude-hub standby ${options.action} ${options.deviceId ?? ''}" again to get a new token.\n`);
      return EXIT_FAILURE;
    }
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}
