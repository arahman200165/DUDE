import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { BackupStatusResponse } from '@dude/contracts/hub';
import { HubAdminError, type HubAdminPort } from '../../../../core/hub/hub-admin.port';
import { FAKE_BACKUP_STATUS } from '../../../../core/platform/testing/fake-hub';
import { CORE_SETTINGS_SECTIONS, settingsSectionAvailability } from '../../settings-sections';
import { buttonWithText, configureHubTest, createTestPort, settle, typeInto } from '../hub/testing/hub-test-port';
import { BACKUP_COMMANDS, BackupSettings } from './backup-settings';

const text = (el: HTMLElement, id: string): string => el.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const has = (el: HTMLElement, id: string): boolean => el.querySelector(`[data-testid="${id}"]`) !== null;

const SCHEDULED: BackupStatusResponse = {
  authority: { epoch: 3, state: 'active' },
  lastBackup: { at: new Date(Date.now() - 3 * 3_600_000).toISOString(), ok: true, file: 'dude-hub-20260301.dudebackup', size: 2_621_440 },
  schedule: { configured: true, folder: 'D:\\HubBackups', intervalHours: 24, retention: 7, keyPresent: true },
  defaultFolder: 'C:\\ProgramData\\DUDE\\Hub\\backups',
  devicesNeedingRePair: 0,
};

async function mount(overrides: Partial<HubAdminPort> = {}, host: 'desktop' | 'hub-web' = 'desktop', signedIn = true) {
  const test = createTestPort(overrides);
  configureHubTest(test.port, host);
  const fixture = TestBed.createComponent(BackupSettings);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  if (signedIn) {
    typeInto(el.querySelector('#owner-gate-password') as HTMLInputElement, 'correct horse battery');
    await settle(fixture);
    buttonWithText(el, 'Sign in').click();
    await settle(fixture);
  }
  return { ...test, fixture, el };
}

describe('Backup & Transfer section registration', () => {
  const section = CORE_SETTINGS_SECTIONS.find((s) => s.id === 'backup');
  it('is a core section for desktop and Hub web only, and hidden on the Pages build', () => {
    expect(section?.title).toBe('Backup & Transfer');
    expect(settingsSectionAvailability(section?.hosts, 'desktop')).toBe('available');
    expect(settingsSectionAvailability(section?.hosts, 'hub-web')).toBe('available');
    expect(settingsSectionAvailability(section?.hosts, 'web-standalone')).toBe('hidden');
  });

  it('loads the section component and has unique id and title', async () => {
    expect(await section?.load()).toBe(BackupSettings);
    expect(CORE_SETTINGS_SECTIONS.filter((s) => s.id === 'backup' || s.title === 'Backup & Transfer')).toHaveLength(1);
  });
});

describe('BackupSettings', () => {
  it('is behind the owner gate: it asks for sign-in and reads no status until then, yet still lists the commands', async () => {
    const { el, port } = await mount({}, 'desktop', false);
    expect(has(el, 'owner-gate')).toBe(true);
    expect(has(el, 'authority')).toBe(false);
    expect(port.backupStatus).not.toHaveBeenCalled();
    expect(has(el, 'commands')).toBe(true);
    expect(text(el, 'view-only-note')).toContain('never from this window');
  });

  it('shows an active Hub that has never been backed up and has no schedule', async () => {
    const { el, port } = await mount();
    expect(port.backupStatus).toHaveBeenCalledOnce();
    expect(text(el, 'authority-state')).toContain('Active');
    expect(text(el, 'authority-epoch')).toBe('1');
    expect(has(el, 'transferred-notice')).toBe(false);
    expect(text(el, 'no-backup')).toContain('No backup yet');
    expect(text(el, 'no-schedule')).toContain('No schedule');
    expect(text(el, 'default-folder')).toBe(FAKE_BACKUP_STATUS.defaultFolder);
    expect(text(el, 're-pair-none')).toContain('None');
    expect(has(el, 're-pair-link')).toBe(false);
  });

  it('always shows that a folder on the Hub machine does not protect against losing it', async () => {
    const { el } = await mount();
    expect(text(el, 'same-machine-warning')).toContain("does not protect you if that machine is lost");
  });

  it('shows a successful last backup with its time, file name and size, and a schedule with its protected-key note', async () => {
    const { el } = await mount({ backupStatus: async () => SCHEDULED });
    expect(text(el, 'authority-epoch')).toBe('3');
    expect(text(el, 'last-backup-when')).toContain('3 h ago');
    expect(text(el, 'last-backup-result')).toContain('Succeeded');
    expect(text(el, 'last-backup-file')).toBe('dude-hub-20260301.dudebackup');
    expect(text(el, 'last-backup-size')).toBe('2.50 MiB');
    expect(has(el, 'no-backup')).toBe(false);
    expect(text(el, 'schedule-folder')).toBe('D:\\HubBackups');
    expect(text(el, 'schedule-interval')).toBe('24 hours');
    expect(text(el, 'schedule-retention')).toBe('7 backups');
    expect(text(el, 'schedule-key-note')).toBe('Unattended backups use a protected derived key, never your passphrase.');
    expect(has(el, 'no-schedule')).toBe(false);
  });

  it('shows a failed last backup with its short error code and no file or size when none was written', async () => {
    const { el } = await mount({ backupStatus: async () => ({ ...SCHEDULED, lastBackup: { at: SCHEDULED.lastBackup!.at, ok: false, error: 'folder-unwritable' } }) });
    expect(text(el, 'last-backup-result')).toContain('Failed');
    expect(text(el, 'last-backup-error')).toBe('folder-unwritable');
    expect(has(el, 'last-backup-file')).toBe(false);
    expect(has(el, 'last-backup-size')).toBe(false);
  });

  it('warns when a schedule has no protected key and says nothing about the key when it is unknown', async () => {
    const missing = await mount({ backupStatus: async () => ({ ...SCHEDULED, schedule: { ...SCHEDULED.schedule, keyPresent: false } }) });
    expect(text(missing.el, 'schedule-key-missing')).toContain('cannot run');
    expect(has(missing.el, 'schedule-key-note')).toBe(false);
    TestBed.resetTestingModule();
    const unknown = await mount({ backupStatus: async () => ({ ...SCHEDULED, schedule: { configured: true, folder: 'D:\\HubBackups', intervalHours: 1, retention: 1 } }) });
    expect(has(unknown.el, 'schedule-key-note')).toBe(false);
    expect(has(unknown.el, 'schedule-key-missing')).toBe(false);
    expect(text(unknown.el, 'schedule-interval')).toBe('1 hour');
    expect(text(unknown.el, 'schedule-retention')).toBe('1 backup');
  });

  it('shows a prominent read-only notice for a transferred Hub', async () => {
    const { el } = await mount({ backupStatus: async () => ({ ...SCHEDULED, authority: { epoch: 4, state: 'transferred' } }) });
    const notice = el.querySelector('[data-testid="transferred-notice"]') as HTMLElement;
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.textContent).toContain('This Hub was transferred and is read-only');
    expect(notice.textContent).toContain('dude-hub backup reactivate');
    expect(text(el, 'authority-state')).toContain('Transferred');
  });

  it('shows the same notice, not a generic failure, when the Hub answers hub-transferred', async () => {
    const { el } = await mount({ backupStatus: async () => { throw new HubAdminError('hub-transferred', 'transferred'); } });
    expect(text(el, 'transferred-notice')).toContain('This Hub was transferred and is read-only');
    expect(has(el, 'status-error')).toBe(false);
    expect(has(el, 'authority')).toBe(false);
  });

  it('links to Devices with the count when devices need re-pair', async () => {
    const { el } = await mount({ backupStatus: async () => ({ ...SCHEDULED, devicesNeedingRePair: 2 }) });
    expect(text(el, 're-pair-count')).toContain('2 devices need to be paired again after a restore.');
    expect((el.querySelector('[data-testid="re-pair-link"]') as HTMLAnchorElement).getAttribute('href')).toBe('/settings/devices');
    expect(has(el, 're-pair-none')).toBe(false);
  });

  it('uses the singular for one device', async () => {
    const { el } = await mount({ backupStatus: async () => ({ ...SCHEDULED, devicesNeedingRePair: 1 }) });
    expect(text(el, 're-pair-count')).toContain('1 device needs to be paired again');
  });

  it('lists every elevated command and the unmistakable passphrase warning', async () => {
    const { el } = await mount();
    expect(text(el, 'passphrase-warning')).toBe('Losing the backup passphrase makes a backup unrecoverable. DUDE cannot recover it.');
    const shown = Array.from(el.querySelectorAll('[data-testid="command-text"]')).map((c) => c.textContent?.trim());
    expect(shown).toEqual([
      'dude-hub backup create',
      'dude-hub backup schedule set --folder <dir> --every-hours 24 --keep 7',
      'dude-hub backup create --for-transfer',
      'dude-hub backup restore --file <path>',
      'dude-hub backup reactivate',
    ]);
    expect(text(el, 'command-restore')).toContain('Run on the NEW machine with the Hub stopped');
    expect(el.textContent).toContain('Run these elevated on the Hub machine.');
  });

  it('copies each command and the default folder', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { fixture, el } = await mount();
    for (const item of BACKUP_COMMANDS) {
      (el.querySelector(`[data-testid="command-${item.id}"] app-copy-button button`) as HTMLButtonElement).click();
      await settle(fixture);
      expect(writeText).toHaveBeenLastCalledWith(item.command);
    }
    (el.querySelector('[data-testid="default-folder-block"] app-copy-button button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(writeText).toHaveBeenLastCalledWith(FAKE_BACKUP_STATUS.defaultFolder);
  });

  it('shows a loading state while the status is read and the Refresh button reads it again', async () => {
    let release!: (value: BackupStatusResponse) => void;
    const pending = new Promise<BackupStatusResponse>((resolve) => { release = resolve; });
    const backupStatus = vi.fn<HubAdminPort['backupStatus']>().mockReturnValueOnce(pending).mockResolvedValue(SCHEDULED);
    const { fixture, el } = await mount({ backupStatus });
    expect(text(el, 'status-loading')).toContain('Loading the backup status');
    expect((el.querySelector('[data-testid="refresh"]') as HTMLButtonElement).disabled).toBe(true);
    release(FAKE_BACKUP_STATUS);
    await settle(fixture);
    expect(has(el, 'status-loading')).toBe(false);
    (el.querySelector('[data-testid="refresh"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(backupStatus).toHaveBeenCalledTimes(2);
    expect(text(el, 'authority-epoch')).toBe('3');
  });

  it('shows an unreachable Hub with the standard text and keeps the commands', async () => {
    const { el } = await mount({ backupStatus: async () => { throw new HubAdminError('hub-unreachable', 'down'); } });
    expect(text(el, 'status-error')).toContain('The Hub could not be reached');
    expect(has(el, 'authority')).toBe(false);
    expect(has(el, 'transferred-notice')).toBe(false);
    expect(has(el, 'commands')).toBe(true);
  });

  it('falls back to the sign-in gate when the owner session has expired', async () => {
    const { el } = await mount({ backupStatus: async () => { throw new HubAdminError('owner-session-expired', 'expired'); } });
    expect(has(el, 'owner-gate')).toBe(true);
    expect(has(el, 'authority')).toBe(false);
    expect(has(el, 'status-error')).toBe(false);
  });

  it('works on Hub web with the same cookie-session port', async () => {
    const { el, port } = await mount({ backupStatus: async () => SCHEDULED }, 'hub-web');
    expect(port.backupStatus).toHaveBeenCalledOnce();
    expect(text(el, 'schedule-folder')).toBe('D:\\HubBackups');
  });
});
