import { AdminCallError, callAdmin, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { resolveDataDir } from '../config/data-dir.js';

export interface TlsCommandOptions { action: 'status' | 'rotate' | 'activate'; dataDir?: string; restage?: boolean; force?: boolean; confirm?: string }

export interface TlsCommandDeps {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  call?: (dataDir: string, method: string, params: unknown) => Promise<unknown>;
}

/**
 * `dude-hub tls status|rotate|activate`: over the elevated local admin channel; never opens the database.
 * `activate` is two-phase like `owner reset`: without `--confirm` it prints the preview and a one-time token.
 */
export async function runTls(options: TlsCommandOptions, deps: TlsCommandDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((t: string) => void process.stdout.write(t));
  const err = deps.stderr ?? ((t: string) => void process.stderr.write(t));
  const call = deps.call ?? ((dataDir, method, params) => callAdmin(dataDir, method, params, 10_000));
  try {
    const dataDir = resolveDataDir({ dataDir: options.dataDir });
    if (options.action === 'status') {
      out(`${JSON.stringify(await call(dataDir, 'tls.status', {}))}\n`);
      return 0;
    }
    if (options.action === 'rotate') {
      out(`${JSON.stringify(await call(dataDir, 'tls.stage', { restage: options.restage === true }))}\n`);
      err('The next certificate is staged and announced to connected devices. Run "dude-hub tls status" until no device is pending, then "dude-hub tls activate".\n');
      return 0;
    }
    if (options.confirm === undefined) {
      out(`${JSON.stringify(await call(dataDir, 'tls.activate.preview', { force: options.force === true }))}\n`);
      err(
        `Nothing has changed. Re-run with --confirm <confirmToken>${options.force ? ' --force' : ''} within 60 seconds to activate the next certificate.` +
          `${options.force ? ' Devices listed in requirePairing will have to be paired again.' : ''}\n`,
      );
      return 0;
    }
    out(`${JSON.stringify(await call(dataDir, 'tls.activate.apply', { confirmToken: options.confirm, force: options.force === true }))}\n`);
    return 0;
  } catch (error) {
    err(`${error instanceof Error ? error.message : 'tls command failed'}\n`);
    return error instanceof AdminCallError && error.code === HUB_NOT_RUNNING ? 2 : 1;
  }
}
