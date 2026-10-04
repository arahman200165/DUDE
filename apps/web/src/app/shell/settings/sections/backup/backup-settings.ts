import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { BackupStatusResponse } from '@dude/contracts/hub';
import { formatBytes } from '@dude/tool-engine/shared/fs/format-size';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import { CopyButton } from '../../../../shared/components/copy-button/copy-button';
import { StatusGlyph } from '../../../../shared/components/status-glyph/status-glyph';
import { hubErrorText, relativeTime } from '../hub/hub-format';
import { HubOwnerSession } from '../hub/hub-owner-session.service';
import { OwnerGate } from '../hub/owner-gate';

// Settings > Backup & Transfer copy and the elevated `dude-hub` commands it shows (PD-071..PD-074). Nothing here runs a command.
export interface BackupCommand {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  /** One plain sentence on when to run it; shown under the command. */
  readonly note?: string;
}

/** Placeholders (`<dir>`, `<path>`) are for the operator to replace; the copy button copies them as written. */
export const BACKUP_COMMANDS: readonly BackupCommand[] = [
  { id: 'create', label: 'Back up now', command: 'dude-hub backup create', note: 'Asks for a passphrase and writes an encrypted backup file.' },
  {
    id: 'schedule', label: 'Schedule unattended backups', command: 'dude-hub backup schedule set --folder <dir> --every-hours 24 --keep 7',
    note: 'Unattended backups use a protected derived key, never your passphrase.',
  },
  {
    id: 'transfer', label: 'Retire this Hub for a move', command: 'dude-hub backup create --for-transfer',
    note: 'Writes a backup, then retires this Hub (read-only) so only one Hub is active.',
  },
  { id: 'restore', label: 'Restore on the new machine', command: 'dude-hub backup restore --file <path>', note: 'Run on the NEW machine with the Hub stopped. Every device must then be paired again.' },
  { id: 'reactivate', label: 'Return a retired Hub to service', command: 'dude-hub backup reactivate', note: 'Only for a Hub that was retired by a transfer and is still wanted here.' },
];

export const PASSPHRASE_WARNING = 'Losing the backup passphrase makes a backup unrecoverable. DUDE cannot recover it.';
export const TRANSFERRED_NOTICE = 'This Hub was transferred and is read-only';
export const SAME_MACHINE_WARNING = "A backup folder on the Hub's own machine does not protect you if that machine is lost. Copy backups to another disk or another machine.";
export const SCHEDULE_KEY_NOTE = 'Unattended backups use a protected derived key, never your passphrase.';
export const SCHEDULE_NO_KEY_NOTE = 'The schedule has no protected key, so scheduled backups cannot run. Set the schedule again with the command below.';

/** The code a transferred Hub answers (api-client `HUB_TRANSFERRED_CODE`); the desktop Agent forwards it unchanged. */
const TRANSFERRED_CODE = 'hub-transferred';

/**
 * Settings > Backup & Transfer (Phase 31G, PD-071..PD-074). View-only by design, like Endpoint & Exposure: it reports the Hub's authority,
 * last backup and schedule and shows the elevated `dude-hub` command for each action. Creating, restoring or transferring a Hub is never
 * done from this window, so a stolen owner session cannot export or replace the Hub's data.
 */
@Component({
  selector: 'app-backup-settings',
  imports: [CopyButton, OwnerGate, RouterLink, StatusGlyph],
  templateUrl: './backup-settings.html',
})
export class BackupSettings {
  private readonly hub = inject(HUB_ADMIN);
  protected readonly session = inject(HubOwnerSession);

  protected readonly status = signal<BackupStatusResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The Hub answered the distinct `hub-transferred` error instead of a status (everything but `hello` is refused once transferred). */
  private readonly refusedAsTransferred = signal(false);
  protected readonly transferred = computed(() => this.refusedAsTransferred() || this.status()?.authority.state === 'transferred');

  protected readonly commands = BACKUP_COMMANDS;
  protected readonly passphraseWarning = PASSPHRASE_WARNING;
  protected readonly transferredNotice = TRANSFERRED_NOTICE;
  protected readonly sameMachineWarning = SAME_MACHINE_WARNING;
  protected readonly scheduleKeyNote = SCHEDULE_KEY_NOTE;
  protected readonly scheduleNoKeyNote = SCHEDULE_NO_KEY_NOTE;
  protected readonly bytes = formatBytes;

  constructor() {
    effect(() => {
      if (this.session.signedIn()) untracked(() => void this.load());
      else this.status.set(null);
    });
  }

  protected refresh(): void {
    if (this.session.signedIn()) void this.load();
  }

  protected when(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : `${date.toLocaleString()} (${relativeTime(iso)})`;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.status.set(await this.hub.backupStatus());
      this.error.set(null);
      this.refusedAsTransferred.set(false);
    } catch (error) {
      if (this.session.noteError(error, { unauthorizedMeansExpired: true })) return;
      this.refusedAsTransferred.set(error instanceof HubAdminError && error.code === TRANSFERRED_CODE);
      this.error.set(hubErrorText(error, 'The backup status could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }
}
