import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { validateBackupPassphrase } from '../backup/kdf.js';
import { readPassphrase } from '../cli/passphrase.js';
import type { ReadPassphraseOptions } from '../cli/passphrase.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ResolvedDeps, ServiceDeps } from './common.js';

export type BackupAction = 'create' | 'list' | 'verify' | 'schedule-set' | 'schedule-off' | 'schedule-status';

export interface BackupCommandOptions {
  action: BackupAction;
  folder?: string;
  file?: string;
  confirm?: string;
  everyHours?: number;
  keep?: number;
  dataDir?: string;
  installDir?: string;
}

export interface BackupCommandDeps extends ServiceDeps {
  /** Standard input for the passphrase (default: the process's). */
  stdin?: ReadPassphraseOptions['stdin'];
  /** Replaces the whole passphrase source (tests). */
  readPassphrase?: (options: { prompt: string; confirm: boolean }) => Promise<string>;
}

/** Argon2id, the VACUUM and the verification run inside these calls, so they get far longer than an ordinary admin call. */
const LONG_CALL_MS = 10 * 60 * 1000;
const PASSPHRASE_WARNING = 'Losing the passphrase makes the backup unrecoverable.';
const WHAT: Record<BackupAction, string> = {
  create: 'Creating a backup',
  list: 'Listing backups',
  verify: 'Verifying a backup',
  'schedule-set': 'Scheduling backups',
  'schedule-off': 'Turning off scheduled backups',
  'schedule-status': 'Showing the backup schedule',
};
/** Everything that writes, reads a secret or changes the schedule needs the elevated terminal; list and status only read. */
const ELEVATED: ReadonlySet<BackupAction> = new Set(['create', 'verify', 'schedule-set', 'schedule-off']);

interface PreviewResult {
  confirmToken?: unknown;
  expiresAt?: unknown;
  summary?: {
    folder?: unknown; file?: unknown; onHubVolume?: unknown; sameMachineWarning?: unknown; hubInstanceId?: unknown;
    authorityEpoch?: unknown; counts?: unknown; passphraseWarning?: unknown;
  };
}

const text = (value: unknown, fallback = '(unknown)'): string => (typeof value === 'string' && value.length > 0 ? value : typeof value === 'number' ? String(value) : fallback);

function describeCounts(counts: unknown): string {
  if (typeof counts !== 'object' || counts === null) return '';
  const parts = Object.entries(counts as Record<string, unknown>).filter(([, n]) => typeof n === 'number').map(([name, n]) => `${name} ${n}`);
  return parts.join(', ');
}

/** The readable preview on stderr; the token goes to stdout separately. */
function previewLines(preview: PreviewResult): string {
  const s = preview.summary ?? {};
  const lines = [
    'Backup preview (nothing has been written)',
    `  Folder:    ${text(s.folder)}`,
    `  File:      ${text(s.file)}`,
    `  Hub:       ${text(s.hubInstanceId)}, authority epoch ${text(s.authorityEpoch)}`,
  ];
  const counts = describeCounts(s.counts);
  if (counts.length > 0) lines.push(`  Contents:  ${counts}`);
  lines.push(`  Warning:   ${text(s.sameMachineWarning, 'A backup stored on the Hub\'s own machine does not protect against losing that machine.')}${s.onHubVolume === true ? ' (This folder is on the same volume as the Hub data.)' : ''}`);
  lines.push(`  Warning:   ${PASSPHRASE_WARNING}`);
  return `${lines.join('\n')}\n`;
}

/** A clear one-line message for an admin failure and the exit code: 2 when the Hub is not running, else 1. */
function failure(d: ResolvedDeps, error: unknown, what: string): number {
  if (error instanceof AdminCallError) {
    const detail = error.detail as { reason?: unknown } | undefined;
    switch (error.code) {
      case HUB_NOT_RUNNING:
        d.err('The Hub is not running. Backups are made by the running Hub; start it and run this again.\n');
        return EXIT_USAGE;
      case 'confirmation-required':
        d.err('The confirmation is missing, expired or already used. Run "dude-hub backup create" again to get a new token.\n');
        return EXIT_FAILURE;
      case 'timeout':
        d.err(`${what}: the Hub did not answer in time. It may still be working; check "dude-hub backup list" before trying again.\n`);
        return EXIT_FAILURE;
      case 'backup-failed':
        d.err(`${error.message}${typeof detail?.reason === 'string' ? ` [${detail.reason}]` : ''}\n`);
        return EXIT_FAILURE;
      case 'wrong-passphrase-or-corrupt':
        d.err('The passphrase is wrong or the file is damaged. Nothing was changed.\n');
        return EXIT_FAILURE;
      default:
        d.err(`${error.message}\n`);
        return EXIT_FAILURE;
    }
  }
  d.err(`${error instanceof Error ? error.message : `${what} failed`}\n`);
  return EXIT_FAILURE;
}

/**
 * `dude-hub backup create|list|verify|schedule set|off|status`: every action goes through the admin channel of the running Hub
 * (it never opens the database). The passphrase is read from the environment, standard input or a hidden prompt, travels only in
 * the admin-call params, and is never printed, logged or echoed.
 */
export async function runBackup(options: BackupCommandOptions, deps: BackupCommandDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  if (ELEVATED.has(options.action)) {
    const state = await serviceState(d);
    if (state !== 'not-installed' && state !== 'unknown') {
      const refused = await requireElevated(d, WHAT[options.action]);
      if (refused !== null) return refused;
    }
  }
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. Backups are made by the running Hub; start it and run this again.\n');
    return EXIT_USAGE;
  }

  const askPassphrase = (prompt: string, confirm: boolean): Promise<string> =>
    deps.readPassphrase !== undefined
      ? deps.readPassphrase({ prompt, confirm })
      : readPassphrase({ env: d.env, stdin: deps.stdin ?? process.stdin, stderr: { write: (chunk: string | Uint8Array): boolean => { d.err(String(chunk)); return true; } }, prompt, confirm });
  /** Reads (and, when asked, locally checks) the passphrase. Null after printing why it could not be had. */
  const passphraseFor = async (prompt: string, confirm: boolean, enforceRules: boolean): Promise<string | null> => {
    let passphrase: string;
    try {
      passphrase = await askPassphrase(prompt, confirm);
    } catch (error) {
      d.err(`${error instanceof Error ? error.message : 'The passphrase could not be read.'}\n`);
      return null;
    }
    if (enforceRules) {
      const problem = validateBackupPassphrase(passphrase);
      if (problem !== null) {
        d.err(`${problem}\n`);
        return null;
      }
    }
    return passphrase;
  };
  const callAdminLong = (method: string, params: unknown): Promise<unknown> => d.call(dataRoot, method, params, LONG_CALL_MS);

  try {
    switch (options.action) {
      case 'create': {
        const folder = options.folder !== undefined ? { folder: options.folder } : {};
        if (options.confirm === undefined) {
          const preview = (await d.call(dataRoot, 'backup.create.preview', folder)) as PreviewResult;
          d.err(previewLines(preview));
          d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt })}\n`);
          d.err('Nothing has been written. Re-run with --confirm <confirmToken> within 60 seconds (and the same --folder) to be asked for a passphrase and create the backup.\n');
          return EXIT_OK;
        }
        d.err(`${PASSPHRASE_WARNING}\n`);
        const passphrase = await passphraseFor('Backup passphrase (min 12 characters): ', true, true);
        if (passphrase === null) return EXIT_FAILURE;
        const result = (await callAdminLong('backup.create.apply', { confirmToken: options.confirm, ...folder, passphrase })) as { file?: unknown; size?: unknown; sha256?: unknown };
        d.out(`${JSON.stringify({ file: result.file, size: result.size, sha256: result.sha256 })}\n`);
        return EXIT_OK;
      }
      case 'list': {
        d.out(json(await d.call(dataRoot, 'backup.list', options.folder !== undefined ? { folder: options.folder } : {})));
        return EXIT_OK;
      }
      case 'verify': {
        if (options.file === undefined) {
          d.err('Usage: dude-hub backup verify --file <absolute path to a .dudebackup file>.\n');
          return EXIT_USAGE;
        }
        const passphrase = await passphraseFor('Backup passphrase: ', false, false);
        if (passphrase === null) return EXIT_FAILURE;
        d.out(json(await callAdminLong('backup.verify', { file: options.file, passphrase })));
        return EXIT_OK;
      }
      case 'schedule-set': {
        if (options.folder === undefined || options.everyHours === undefined || options.keep === undefined) {
          d.err('Usage: dude-hub backup schedule set --folder <abs dir> --every-hours <n> --keep <n>.\n');
          return EXIT_USAGE;
        }
        d.err(`${PASSPHRASE_WARNING}\nA key derived from this passphrase is stored on this computer, protected by Windows, so scheduled backups can run unattended. The passphrase itself is not stored.\n`);
        const passphrase = await passphraseFor('Backup passphrase (min 12 characters): ', true, true);
        if (passphrase === null) return EXIT_FAILURE;
        d.out(json(await callAdminLong('backup.schedule.set', { folder: options.folder, intervalHours: options.everyHours, retention: options.keep, passphrase })));
        return EXIT_OK;
      }
      case 'schedule-off':
        d.out(json(await d.call(dataRoot, 'backup.schedule.off', {})));
        return EXIT_OK;
      case 'schedule-status':
        d.out(json(await d.call(dataRoot, 'backup.schedule.status', {})));
        return EXIT_OK;
    }
  } catch (error) {
    return failure(d, error, WHAT[options.action]);
  }
}
