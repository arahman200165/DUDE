import { AdminCallError } from '../admin/admin-client.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';

export type PowerAction = 'status' | 'apply' | 'revert';
export interface PowerOptions { action: PowerAction; confirm?: string; dataDir?: string; installDir?: string }

interface Minutes { sleepAcMinutes: number | null; hibernateAcMinutes: number | null }
interface Preview {
  confirmToken?: string; expiresAt?: string; consequenceClass?: string[];
  summary?: { before?: Minutes; after?: Minutes; commands?: string[]; revertCommands?: string[]; revertWith?: string; scope?: string; why?: string };
}

const minutesText = (value: number | null | undefined): string => (value === null || value === undefined ? 'not set on this computer' : value === 0 ? 'never' : `${String(value)} min`);

/**
 * `dude-hub power status | apply | revert [--confirm <token>]` (32-SS1, Milestone 851, PD-142): the Hub machine's power policy ("never sleep
 * and never hibernate on AC power", so the tunnel stays up and backups run). The Hub reads and changes the power plan itself, so every
 * action needs it running and goes through the admin channel (`power.status`, `power.preview`, `power.apply`, `power.revert`). `apply`
 * and `revert` are two steps: without `--confirm` the preview prints the exact `powercfg` commands, the values before and after and
 * the revert command, and a 60-second token; nothing changes. Changing a power plan needs the elevated terminal when the service is
 * installed. Windows only: any other deployment answers `unsupported`.
 */
export async function runPower(options: PowerOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  if (options.action !== 'status') {
    const state = await serviceState(d);
    if (state !== 'not-installed' && state !== 'unknown') {
      const refused = await requireElevated(d, options.action === 'apply' ? 'Changing the power policy' : 'Reverting the power policy');
      if (refused !== null) return refused;
    }
  }
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. The power policy is read and changed by the running Hub; start it ("dude-hub service start", or "dude-hub run") and run this again.\n');
    return EXIT_USAGE;
  }
  try {
    if (options.action === 'status') {
      const status = (await d.call(dataRoot, 'power.status', {})) as Record<string, unknown>;
      d.out(json(status));
      const verdict = status['verdict'];
      if (verdict === 'needs-change') d.err('This computer can sleep or hibernate on AC power; while it does, the tunnel is down and scheduled backups do not run. Run "dude-hub power apply" to change that.\n');
      else if (verdict === 'ok') d.err('This computer does not sleep or hibernate on AC power.\n');
      else if (verdict === 'unsupported') d.err('The power policy is checked and changed only on the Windows Hub; this deployment does not support it.\n');
      else d.err('The power settings could not be read.\n');
      return EXIT_OK;
    }
    if (options.confirm === undefined) {
      const preview = (await d.call(dataRoot, 'power.preview', { action: options.action })) as Preview;
      const s = preview.summary ?? {};
      const lines = [
        `Power policy ${options.action} preview (nothing has been changed)`,
        `  Scope:        ${s.scope ?? 'the active power plan'}`,
        `  Sleep (AC):   ${minutesText(s.before?.sleepAcMinutes)} -> ${minutesText(s.after?.sleepAcMinutes)}`,
        `  Hibernate (AC): ${minutesText(s.before?.hibernateAcMinutes)} -> ${minutesText(s.after?.hibernateAcMinutes)}`,
        ...(s.commands ?? []).map((c) => `  Runs:         ${c}`),
        ...(options.action === 'apply' ? (s.revertCommands ?? []).map((c) => `  To undo:      ${c}   (or: ${s.revertWith ?? 'dude-hub power revert'})`) : []),
        `  Consequence:  ${(preview.consequenceClass ?? []).join(', ')}`,
      ];
      d.err(`${lines.join('\n')}\n`);
      d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt, consequenceClass: preview.consequenceClass })}\n`);
      d.err(`Nothing has been changed. Re-run with --confirm <confirmToken> within 60 seconds to ${options.action === 'apply' ? 'change the power plan' : 'restore the previous values'}.\n`);
      return EXIT_OK;
    }
    d.out(json(await d.call(dataRoot, `power.${options.action}`, { confirmToken: options.confirm })));
    return EXIT_OK;
  } catch (error) {
    if (error instanceof AdminCallError) {
      if (error.code === 'confirmation-required') {
        d.err(`The confirmation is missing, expired or already used. Run "dude-hub power ${options.action}" again without --confirm to get a new token.\n`);
        return EXIT_FAILURE;
      }
      if (error.code === 'unsupported') {
        d.err(`${error.message}\n`);
        return EXIT_FAILURE;
      }
    }
    d.err(`${error instanceof Error ? error.message : 'The power policy command failed.'}\n`);
    return EXIT_FAILURE;
  }
}
