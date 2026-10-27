import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { validateBackupPassphrase } from '../backup/kdf.js';
import { readPassphrase } from '../cli/passphrase.js';
import type { ReadPassphraseOptions } from '../cli/passphrase.js';
import type { BackupCliAction } from '../cli/args.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ResolvedDeps, ServiceDeps } from './common.js';

export type BackupAction = BackupCliAction;

export interface BackupCommandOptions {
  action: BackupAction;
  folder?: string;
  file?: string;
  confirm?: string;
  /** `backup create --for-transfer`: the Hub is retired once the backup is written and verified. */
  forTransfer?: boolean;
  everyHours?: number;
  /** 31G `--keep`: accepted, no longer used (retention is 7 daily / 4 weekly / 6 monthly, pruned by `backup prune`). */
  keep?: number;
  /** A destination id (`--destination` or `--id`). */
  destination?: string;
  label?: string;
  backupId?: string;
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
  reactivate: 'Reactivating the Hub',
  run: 'Running a backup',
  prune: 'Pruning backups',
  rewrap: 'Changing the backup passphrase',
  'destination-add': 'Adding a backup destination',
  'destination-list': 'Listing backup destinations',
  'destination-remove': 'Removing a backup destination',
  'destination-verify': 'Verifying a backup',
};
/** Everything that writes, reads a secret or changes the schedule needs the elevated terminal; the lists and the status only read. */
const ELEVATED: ReadonlySet<BackupAction> = new Set(['create', 'verify', 'schedule-set', 'schedule-off', 'reactivate', 'run', 'prune', 'rewrap', 'destination-add', 'destination-remove', 'destination-verify']);
const TWO_STEP: Partial<Record<BackupAction, string>> = { prune: 'backup prune', rewrap: 'backup rewrap', 'destination-remove': 'backup destination remove', reactivate: 'backup reactivate' };
const RETIRE_WARNING = 'This Hub will be RETIRED after the backup is written and verified: it will refuse sign-in, sync and pairing until you run "dude-hub backup reactivate". Restore the backup on the new machine before you retire anything you need.';
const RETIRED_NOTICE = 'This Hub is now retired (transferred).';

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

const RETENTION_TEXT = '7 daily, 4 weekly and 6 monthly';
const MASTER_KEY_NOTE = 'The Hub keeps a random backup key on this computer, protected by Windows, so scheduled backups run unattended; the passphrase itself is not stored and only wraps that key in each destination.';

/** A readable two-step preview on stderr (whatever plain fields the Hub reports); the token goes to stdout separately. */
function genericPreviewLines(title: string, preview: PreviewResult): string {
  const lines = [title];
  for (const [name, value] of Object.entries(preview.summary ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') lines.push(`  ${name}: ${String(value)}`);
    else if (Array.isArray(value)) lines.push(`  ${name}: ${value.length === 0 ? '(none)' : value.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).join(', ')}`);
  }
  const classes = (preview as { consequenceClass?: unknown }).consequenceClass;
  if (Array.isArray(classes)) lines.push(`  consequence: ${classes.join(', ')}`);
  return `${lines.join('\n')}\n`;
}

/** The readable reactivate preview on stderr (whatever string and number fields the Hub reports); the token goes to stdout separately. */
function reactivatePreviewLines(preview: PreviewResult): string {
  const lines = ['Reactivate preview (nothing has been changed)'];
  for (const [name, value] of Object.entries(preview.summary ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') lines.push(`  ${name}: ${String(value)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** A clear one-line message for an admin failure and the exit code: 2 when the Hub is not running, else 1. */
function failure(d: ResolvedDeps, error: unknown, what: string, action: BackupAction = 'create'): number {
  if (error instanceof AdminCallError) {
    const detail = error.detail as { reason?: unknown } | undefined;
    switch (error.code) {
      case HUB_NOT_RUNNING:
        d.err(action === 'reactivate'
          ? 'The Hub is not running. Reactivation is done by the running Hub; start it and run this again.\n'
          : 'The Hub is not running. Backups are made by the running Hub; start it and run this again.\n');
        return EXIT_USAGE;
      case 'confirmation-required':
        d.err(`The confirmation is missing, expired or already used. Run "dude-hub ${TWO_STEP[action] ?? 'backup create'}" again to get a new token.\n`);
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
    d.err(options.action === 'reactivate'
      ? 'The Hub is not running. Reactivation is done by the running Hub; start it and run this again.\n'
      : 'The Hub is not running. Backups are made by the running Hub; start it and run this again.\n');
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
        const transfer = options.forTransfer === true ? { forTransfer: true } : {};
        if (options.confirm === undefined) {
          const preview = (await d.call(dataRoot, 'backup.create.preview', { ...folder, ...transfer })) as PreviewResult;
          d.err(previewLines(preview));
          if (options.forTransfer === true) d.err(`  Warning:   ${RETIRE_WARNING}\n`);
          d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt })}\n`);
          d.err(`Nothing has been written. Re-run with --confirm <confirmToken> within 60 seconds (and the same --folder${options.forTransfer === true ? ' and --for-transfer' : ''}) to be asked for a passphrase and create the backup.\n`);
          return EXIT_OK;
        }
        if (options.forTransfer === true) d.err(`${RETIRE_WARNING}\n`);
        d.err(`${PASSPHRASE_WARNING}\n`);
        const passphrase = await passphraseFor('Backup passphrase (min 12 characters): ', true, true);
        if (passphrase === null) return EXIT_FAILURE;
        const result = (await callAdminLong('backup.create.apply', { confirmToken: options.confirm, ...folder, passphrase, ...transfer })) as { file?: unknown; size?: unknown; sha256?: unknown; retired?: unknown };
        d.out(`${JSON.stringify({ file: result.file, size: result.size, sha256: result.sha256, ...(options.forTransfer === true ? { retired: result.retired === true } : {}) })}\n`);
        if (options.forTransfer === true) {
          d.err(result.retired === true ? `${RETIRED_NOTICE}\n` : 'The backup was written, but the Hub did not report that it was retired. Check "dude-hub status" before restoring elsewhere.\n');
        }
        return EXIT_OK;
      }
      case 'reactivate': {
        if (options.confirm === undefined) {
          const preview = (await d.call(dataRoot, 'backup.reactivate.preview', {})) as PreviewResult;
          d.err(reactivatePreviewLines(preview));
          d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt })}\n`);
          d.err('Nothing has been changed. Re-run with --confirm <confirmToken> within 60 seconds to return this Hub to service with a new authority epoch.\n');
          return EXIT_OK;
        }
        const result = (await d.call(dataRoot, 'backup.reactivate.apply', { confirmToken: options.confirm })) as { authorityEpoch?: unknown; epoch?: unknown };
        const epoch = result.authorityEpoch ?? result.epoch;
        d.out(json(result));
        d.err(`This Hub is active again at authority epoch ${text(epoch)}. Devices paired to it before the transfer may need to be paired again.\n`);
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
        if (options.everyHours === undefined) {
          d.err('Usage: dude-hub backup schedule set --every-hours <n> [--folder <abs dir>].\n');
          return EXIT_USAGE;
        }
        if (options.keep !== undefined) d.err(`--keep is no longer used: every destination keeps ${RETENTION_TEXT} backups, pruned with "dude-hub backup prune".\n`);
        let passphrase: string | null = null;
        if (options.folder !== undefined) {
          d.err(`${PASSPHRASE_WARNING}\n${MASTER_KEY_NOTE}\n`);
          passphrase = await passphraseFor('Backup passphrase (min 12 characters): ', true, true);
          if (passphrase === null) return EXIT_FAILURE;
        }
        d.out(json(await callAdminLong('backup.schedule.set', { intervalHours: options.everyHours, ...(options.folder !== undefined ? { folder: options.folder } : {}), ...(passphrase !== null ? { passphrase } : {}) })));
        return EXIT_OK;
      }
      case 'schedule-off':
        d.out(json(await d.call(dataRoot, 'backup.schedule.off', {})));
        return EXIT_OK;
      case 'schedule-status':
        d.out(json(await d.call(dataRoot, 'backup.schedule.status', {})));
        return EXIT_OK;
      case 'destination-add': {
        if (options.folder === undefined) {
          d.err('Usage: dude-hub backup destination add --folder <abs dir> [--label <text>].\n');
          return EXIT_USAGE;
        }
        d.err(`${PASSPHRASE_WARNING}\n${MASTER_KEY_NOTE}\nIf the folder already holds this Hub's backups, give the passphrase they were made with.\n`);
        const passphrase = await passphraseFor('Backup passphrase (min 12 characters): ', true, true);
        if (passphrase === null) return EXIT_FAILURE;
        d.out(json(await callAdminLong('backup.destination.add', { kind: 'local-folder', folder: options.folder, ...(options.label !== undefined ? { label: options.label } : {}), passphrase })));
        return EXIT_OK;
      }
      case 'destination-list':
        d.out(json(await d.call(dataRoot, 'backup.destination.list', {})));
        return EXIT_OK;
      case 'destination-verify':
        d.out(json(await callAdminLong('backup.destination.verify', { id: options.destination, ...(options.backupId !== undefined ? { backupId: options.backupId } : {}) })));
        return EXIT_OK;
      case 'destination-remove': {
        if (options.confirm === undefined) {
          const preview = (await d.call(dataRoot, 'backup.destination.remove.preview', { id: options.destination })) as PreviewResult;
          d.err(genericPreviewLines('Remove destination preview (nothing has been changed)', preview));
          d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt })}\n`);
          d.err('Nothing has been changed. Re-run with --confirm <confirmToken> within 60 seconds to remove the destination.\n');
          return EXIT_OK;
        }
        d.out(json(await d.call(dataRoot, 'backup.destination.remove.apply', { id: options.destination, confirmToken: options.confirm })));
        return EXIT_OK;
      }
      case 'run': {
        const result = (await callAdminLong('backup.run', options.destination !== undefined ? { destination: options.destination } : {})) as { ok?: unknown };
        d.out(json(result));
        if (result.ok !== true) {
          d.err('At least one destination failed; see the results above and "dude-hub backup destination list".\n');
          return EXIT_FAILURE;
        }
        return EXIT_OK;
      }
      case 'prune': {
        if (options.confirm === undefined) {
          const preview = (await callAdminLong('backup.prune.preview', { destination: options.destination })) as PreviewResult;
          d.err(genericPreviewLines(`Prune preview (nothing has been deleted; retention ${RETENTION_TEXT})`, preview));
          d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt })}\n`);
          d.err('Nothing has been deleted. Re-run with --confirm <confirmToken> within 60 seconds to delete exactly what is listed.\n');
          return EXIT_OK;
        }
        d.out(json(await callAdminLong('backup.prune.apply', { destination: options.destination, confirmToken: options.confirm })));
        return EXIT_OK;
      }
      case 'rewrap': {
        if (options.confirm === undefined) {
          const preview = (await d.call(dataRoot, 'backup.rewrap.preview', {})) as PreviewResult;
          d.err(genericPreviewLines('Passphrase change preview (nothing has been changed)', preview));
          d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt })}\n`);
          d.err('Nothing has been changed. Re-run with --confirm <confirmToken> within 60 seconds to be asked for the NEW passphrase.\n');
          return EXIT_OK;
        }
        d.err(`${PASSPHRASE_WARNING}\nEvery destination's backups will open with the new passphrase only.\n`);
        const passphrase = await passphraseFor('New backup passphrase (min 12 characters): ', true, true);
        if (passphrase === null) return EXIT_FAILURE;
        const result = (await callAdminLong('backup.rewrap.apply', { confirmToken: options.confirm, passphrase })) as { ok?: unknown };
        d.out(json(result));
        return result.ok === true ? EXIT_OK : EXIT_FAILURE;
      }
    }
  } catch (error) {
    return failure(d, error, WHAT[options.action], options.action);
  }
}
