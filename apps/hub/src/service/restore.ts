import { BackupError } from '@dude/hub-backup';
import type { BackupDeps } from '@dude/hub-backup';
import { nodeBackupDeps } from '../backup/kdf.js';
import { RESTORE_PHRASE_OLD_HUB_GONE, RESTORE_PHRASE_REPLACE, RestoreError, applyRestore, previewRestore } from '../backup/restore.js';
import type { RestoreSummary } from '../backup/restore.js';
import { readPassphrase } from '../cli/passphrase.js';
import type { ReadPassphraseOptions } from '../cli/passphrase.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, isHubRunning, json, requireElevated, resolveDeps, serviceDataDir, serviceState } from './common.js';
import type { ResolvedDeps, ServiceDeps } from './common.js';

export interface RestoreCommandOptions {
  file: string;
  confirm?: string;
  /** The phrase the operator typed for `--replace` (validated exactly here). */
  replace?: string;
  /** The phrase the operator typed for `--old-hub-gone` (validated exactly here). */
  oldHubGone?: string;
  dataDir?: string;
  installDir?: string;
}

export interface RestoreCommandDeps extends ServiceDeps {
  /** Standard input for the passphrase (default: the process's). */
  stdin?: ReadPassphraseOptions['stdin'];
  /** Replaces the whole passphrase source (tests). */
  readPassphrase?: (options: { prompt: string; confirm: boolean }) => Promise<string>;
  /** Replaces the running check (tests). */
  isRunning?: (root: string) => Promise<boolean>;
  /** Key derivation, randomness and clock for the backup library (default: Node's Argon2id; tests inject a cheap one). */
  backupDeps?: BackupDeps;
  /** Replace the restore library calls (tests). */
  previewRestore?: typeof previewRestore;
  applyRestore?: typeof applyRestore;
}

const SENTENCE_RE_PAIR = 'Every device must be paired again; their local data is kept.';
const SENTENCE_TLS = 'A new TLS identity will be issued; public/Internet exposure is turned off until you re-enable it.';
const SENTENCE_OLD_HUB = `This backup was not made with --for-transfer. If the old Hub is still running, two Hubs would exist. Pass --old-hub-gone "${RESTORE_PHRASE_OLD_HUB_GONE}" to confirm it is gone.`;
const WHAT = 'Restoring a Hub backup';

const text = (value: unknown, fallback = '(unknown)'): string => (typeof value === 'string' && value.length > 0 ? value : typeof value === 'number' ? String(value) : fallback);

function describeCounts(counts: Record<string, number>): string {
  return Object.entries(counts).filter(([, n]) => typeof n === 'number').map(([name, n]) => `${name} ${n}`).join(', ');
}

/** The readable preview on stderr; the token goes to stdout separately. */
function previewLines(file: string, dataRoot: string, summary: RestoreSummary): string {
  const lines = [
    'Restore preview (nothing has been changed)',
    `  Backup:     ${file}`,
    `  Source:     Hub ${text(summary.source.hubInstanceId)}, authority epoch ${text(summary.source.authorityEpoch)}, DUDE Hub ${text(summary.source.hubVersion)}`,
    `  Created:    ${text(summary.source.createdAt)}`,
    `  New epoch:  ${text(summary.newEpoch)} (a new Hub instance id is generated)`,
  ];
  const counts = describeCounts(summary.counts);
  if (counts.length > 0) lines.push(`  Contents:   ${counts}`);
  lines.push(`  Transfer:   ${summary.forTransfer ? 'made for transfer (--for-transfer)' : 'not made for transfer'}`);
  lines.push(`  Target:     ${dataRoot} (${summary.targetState === 'existing' ? 'already contains a Hub' : 'empty'})`);
  lines.push('', SENTENCE_RE_PAIR, SENTENCE_TLS);
  if (summary.requiresOldHubGonePhrase) lines.push(SENTENCE_OLD_HUB);
  if (summary.requiresReplacePhrase) {
    lines.push(`This data directory already contains a Hub. Existing data will be moved to backups/replaced-<stamp>. Pass --replace "${RESTORE_PHRASE_REPLACE}".`);
  }
  return `${lines.join('\n')}\n`;
}

/** A clear message and the exit code for a restore or backup-library failure. Nothing here can contain the passphrase. */
function failure(d: ResolvedDeps, error: unknown): number {
  if (error instanceof RestoreError) {
    switch (error.code) {
      case 'confirmation-required':
        d.err(`${error.message}\nRun "dude-hub backup restore --file <file>" without --confirm to get a new token.\n`);
        return EXIT_FAILURE;
      case 'conflict':
        d.err(`${error.message}\n`);
        return EXIT_FAILURE;
      case 'target-not-empty':
        d.err(`This data directory already contains a Hub. Existing data will be moved to backups/replaced-<stamp>. Re-run the same command with --replace "${RESTORE_PHRASE_REPLACE}". The token was not used up; nothing was changed.\n`);
        return EXIT_FAILURE;
      case 'old-hub-gone-required':
        d.err(`${SENTENCE_OLD_HUB} The token was not used up; nothing was changed.\n`);
        return EXIT_FAILURE;
      case 'backup-too-new':
        d.err(`${error.message}\n`);
        return EXIT_FAILURE;
      case 'invalid-backup':
        d.err(`The backup cannot be restored: ${error.message}\n`);
        return EXIT_FAILURE;
      case 'integrity-failed':
        d.err(`${error.message} The existing data was left in place.\n`);
        return EXIT_FAILURE;
    }
  }
  if (error instanceof BackupError) {
    switch (error.code) {
      case 'wrong-passphrase-or-corrupt':
        d.err('The passphrase is wrong or the file is damaged. Nothing was changed.\n');
        break;
      case 'bad-magic':
      case 'bad-header':
        d.err('This is not a DUDE Hub backup file. Nothing was changed.\n');
        break;
      case 'unsupported-version':
        d.err('This backup was made by a newer DUDE Hub; update this Hub before restoring it. Nothing was changed.\n');
        break;
      case 'truncated':
      case 'integrity':
        d.err('The backup file is damaged or incomplete. Nothing was changed.\n');
        break;
      default:
        d.err(`The backup could not be read (${error.code}). Nothing was changed.\n`);
    }
    return EXIT_FAILURE;
  }
  d.err(`${WHAT} failed: ${error instanceof Error ? error.message : 'unexpected error'}. Check the data directory before trying again.\n`);
  return EXIT_FAILURE;
}

/**
 * `dude-hub backup restore --file <abs> [--data-dir <dir>] [--confirm <token>] [--replace "REPLACE HUB DATA"] [--old-hub-gone "THE OLD HUB IS GONE"]`.
 * An OFFLINE, two-step command: it refuses while a Hub runs on the data directory and, when a Windows service is installed, outside an
 * elevated terminal. The preview decrypts and validates the file and prints a single-use token; `--confirm` restores. The typed phrases
 * are compared exactly (case-sensitive); the restore library itself refuses, without spending the token, when a phrase is needed and
 * absent. The passphrase comes from the environment, standard input or a hidden prompt and is never printed, logged or put in a message.
 */
export async function runRestore(options: RestoreCommandOptions, deps: RestoreCommandDeps = {}): Promise<number> {
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
    const refused = await requireElevated(d, WHAT);
    if (refused !== null) return refused;
  }
  if (await (deps.isRunning ? deps.isRunning(dataRoot) : isHubRunning(dataRoot, d))) {
    d.err('The Hub is running (or its service is not stopped). Stop it first with "dude-hub service stop"; restore is an offline command and refuses to run against a live Hub.\n');
    return EXIT_USAGE;
  }
  // The typed phrases are checked before anything is read or decrypted.
  if (options.replace !== undefined && options.replace !== RESTORE_PHRASE_REPLACE) {
    d.err(`The --replace phrase must be exactly "${RESTORE_PHRASE_REPLACE}" (case-sensitive). Nothing was changed.\n`);
    return EXIT_FAILURE;
  }
  if (options.oldHubGone !== undefined && options.oldHubGone !== RESTORE_PHRASE_OLD_HUB_GONE) {
    d.err(`The --old-hub-gone phrase must be exactly "${RESTORE_PHRASE_OLD_HUB_GONE}" (case-sensitive). Nothing was changed.\n`);
    return EXIT_FAILURE;
  }

  let passphrase: string;
  try {
    passphrase = deps.readPassphrase !== undefined
      ? await deps.readPassphrase({ prompt: 'Backup passphrase: ', confirm: false })
      : await readPassphrase({
        env: d.env, stdin: deps.stdin ?? process.stdin, prompt: 'Backup passphrase: ', confirm: false,
        stderr: { write: (chunk: string | Uint8Array): boolean => { d.err(String(chunk)); return true; } },
      });
  } catch (error) {
    d.err(`${error instanceof Error ? error.message : 'The passphrase could not be read.'}\n`);
    return EXIT_FAILURE;
  }

  const backupDeps = deps.backupDeps ?? nodeBackupDeps();
  try {
    if (options.confirm === undefined) {
      const preview = await (deps.previewRestore ?? previewRestore)({ file: options.file, passphrase, dataRoot, deps: backupDeps, now: d.now });
      d.err(previewLines(options.file, dataRoot, preview.summary));
      d.out(`${JSON.stringify({ confirmToken: preview.confirmToken, expiresAt: preview.expiresAt })}\n`);
      const needed = [...(preview.summary.requiresReplacePhrase ? ['--replace'] : []), ...(preview.summary.requiresOldHubGonePhrase ? ['--old-hub-gone'] : [])];
      d.err(`Nothing has been changed. Re-run with --confirm <confirmToken> within 60 seconds${needed.length > 0 ? ` (adding ${needed.join(' and ')} as listed above)` : ''} to restore.\n`);
      return EXIT_OK;
    }
    const result = await (deps.applyRestore ?? applyRestore)({
      file: options.file, passphrase, dataRoot, confirmToken: options.confirm, deps: backupDeps, now: d.now,
      replaceExisting: options.replace === RESTORE_PHRASE_REPLACE,
      oldHubGoneConfirmed: options.oldHubGone === RESTORE_PHRASE_OLD_HUB_GONE,
    });
    d.out(json({ hubInstanceId: result.hubInstanceId, authorityEpoch: result.authorityEpoch, devices: result.devices, replacedDir: result.replacedDir }));
    d.err([
      'The backup was restored.',
      ...(result.replacedDir !== null ? [`The previous data was moved to ${result.replacedDir}.`] : []),
      'Next steps:',
      '  1. Start the Hub ("dude-hub service start", or "dude-hub run").',
      '  2. Sign in with the old owner password.',
      `  3. Pair each device again (${result.devices} ${result.devices === 1 ? 'device needs' : 'devices need'} it); their local data is kept.`,
      '',
    ].join('\n'));
    return EXIT_OK;
  } catch (error) {
    return failure(d, error);
  }
}
