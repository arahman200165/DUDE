import { AdminCallError, callAdmin, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { resolveDataDir } from '../config/data-dir.js';

export interface OwnerResetOptions { dataDir?: string; confirm?: string }

export interface OwnerResetDeps {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  call?: (dataDir: string, method: string, params: unknown) => Promise<unknown>;
}

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

/**
 * `dude-hub owner reset`: two steps over the elevated local admin channel; never opens the database.
 * Without `--confirm` it prints the preview and a one-time confirm token (nothing changes). With `--confirm <token>`
 * it applies the reset and prints the one-time reset token, which the operator enters at /hub/recover.
 */
export async function runOwnerReset(options: OwnerResetOptions, deps: OwnerResetDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((t: string) => void process.stdout.write(t));
  const err = deps.stderr ?? ((t: string) => void process.stderr.write(t));
  const call = deps.call ?? ((dataDir, method, params) => callAdmin(dataDir, method, params, 10_000));
  try {
    const dataDir = resolveDataDir({ dataDir: options.dataDir });
    if (options.confirm === undefined) {
      const preview = await call(dataDir, 'owner.reset.preview', {});
      out(`${JSON.stringify(preview)}\n`);
      err('Nothing has changed. Re-run with --confirm <confirmToken> within 60 seconds to revoke every session, delete the recovery codes and issue a one-time reset token.\n');
      return 0;
    }
    const applied = await call(dataDir, 'owner.reset.apply', { confirmToken: options.confirm });
    out(`${JSON.stringify(applied)}\n`);
    return 0;
  } catch (error) {
    err(`${error instanceof Error ? error.message : 'owner reset failed'}\n`);
    return error instanceof AdminCallError && (error.code === HUB_NOT_RUNNING || error.code === 'not-bootstrapped') ? EXIT_USAGE : EXIT_FAILURE;
  }
}
