import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP_TEXT, UsageError, parseArgs } from './args.js';

const abs = (...parts: string[]): string => path.resolve(path.parse(process.cwd()).root, ...parts);
const FOLDER = abs('backups', 'dude');
const FILE = abs('backups', 'dude-hub-2026.dudebackup');

describe('backup CLI parsing', () => {
  it('parses backup create with and without --confirm', () => {
    expect(parseArgs(['backup', 'create'])).toEqual({ command: 'backup', action: 'create' });
    expect(parseArgs(['backup', 'create', '--folder', FOLDER, '--data-dir', 'd', '--install-dir', 'i', '--confirm', 'tok'])).toEqual({
      command: 'backup', action: 'create', folder: FOLDER, dataDir: 'd', installDir: 'i', confirm: 'tok',
    });
    expect(parseArgs(['backup', 'create', `--folder=${FOLDER}`, '--confirm=tok'])).toEqual({ command: 'backup', action: 'create', folder: FOLDER, confirm: 'tok' });
  });

  it('parses list, verify and the schedule commands', () => {
    expect(parseArgs(['backup', 'list'])).toEqual({ command: 'backup', action: 'list' });
    expect(parseArgs(['backup', 'list', '--folder', FOLDER])).toEqual({ command: 'backup', action: 'list', folder: FOLDER });
    expect(parseArgs(['backup', 'verify', '--file', FILE, '--data-dir', 'd'])).toEqual({ command: 'backup', action: 'verify', file: FILE, dataDir: 'd' });
    expect(parseArgs(['backup', 'schedule', 'set', '--folder', FOLDER, '--every-hours', '24', '--keep', '7'])).toEqual({
      command: 'backup', action: 'schedule-set', folder: FOLDER, everyHours: 24, keep: 7,
    });
    expect(parseArgs(['backup', 'schedule', 'off'])).toEqual({ command: 'backup', action: 'schedule-off' });
    expect(parseArgs(['backup', 'schedule', 'status', '--data-dir', 'd'])).toEqual({ command: 'backup', action: 'schedule-status', dataDir: 'd' });
  });

  it('never accepts the passphrase as a flag, for any backup command', () => {
    const attempts = [
      ['backup', 'create', '--passphrase', 'hunter2hunter2'],
      ['backup', 'create', '--confirm', 'tok', '--passphrase=hunter2hunter2'],
      ['backup', 'verify', '--file', FILE, '--passphrase', 'hunter2hunter2'],
      ['backup', 'schedule', 'set', '--folder', FOLDER, '--every-hours', '1', '--keep', '1', '--passphrase', 'hunter2hunter2'],
      ['backup', 'list', '--passphrase=x'],
    ];
    for (const argv of attempts) {
      let thrown: unknown;
      try { parseArgs(argv); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(UsageError);
      expect((thrown as Error).message).toMatch(/never accepted as a flag/);
      expect((thrown as Error).message).not.toContain('hunter2hunter2');
    }
    expect(HELP_TEXT).not.toMatch(/--passphrase/);
  });

  it('rejects an unknown subcommand, an unknown flag and a flag from another action', () => {
    expect(() => parseArgs(['backup'])).toThrow(UsageError);
    expect(() => parseArgs(['backup', 'restore'])).toThrow(/Usage: dude-hub backup/);
    expect(() => parseArgs(['backup', 'schedule'])).toThrow(UsageError);
    expect(() => parseArgs(['backup', 'schedule', 'run'])).toThrow(UsageError);
    expect(() => parseArgs(['backup', 'create', '--nope'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'list', '--confirm', 't'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'verify', '--file', FILE, '--folder', FOLDER])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'schedule', 'off', '--keep', '2'])).toThrow(/Unknown flag/);
  });

  it('rejects missing values and missing required flags', () => {
    expect(() => parseArgs(['backup', 'create', '--folder'])).toThrow(/needs a value/);
    expect(() => parseArgs(['backup', 'create', '--confirm', '--folder', FOLDER])).toThrow(/needs a value/);
    expect(() => parseArgs(['backup', 'verify'])).toThrow(/--file/);
    expect(() => parseArgs(['backup', 'verify', '--file'])).toThrow(/needs a value/);
    expect(() => parseArgs(['backup', 'schedule', 'set', '--every-hours', '1', '--keep', '1'])).toThrow(/--folder/);
    expect(() => parseArgs(['backup', 'schedule', 'set', '--folder', FOLDER, '--keep', '1'])).toThrow(/--every-hours is required/);
    expect(() => parseArgs(['backup', 'schedule', 'set', '--folder', FOLDER, '--every-hours', '1'])).toThrow(/--keep is required/);
  });

  it('requires absolute paths', () => {
    expect(() => parseArgs(['backup', 'create', '--folder', 'relative\\dir'])).toThrow(/absolute path/);
    expect(() => parseArgs(['backup', 'list', '--folder', 'backups'])).toThrow(/absolute path/);
    expect(() => parseArgs(['backup', 'verify', '--file', 'x.dudebackup'])).toThrow(/absolute path/);
    expect(() => parseArgs(['backup', 'schedule', 'set', '--folder', '.', '--every-hours', '1', '--keep', '1'])).toThrow(/absolute path/);
  });

  it('requires positive integers within the schedule limits', () => {
    const set = (hours: string, keep: string): string[] => ['backup', 'schedule', 'set', '--folder', FOLDER, '--every-hours', hours, '--keep', keep];
    for (const bad of ['0', '-1', '1.5', 'x', '', '8761', '1e3']) expect(() => parseArgs(set(bad, '3'))).toThrow(/--every-hours must be an integer/);
    for (const bad of ['0', '-2', '2.5', 'many', '1001']) expect(() => parseArgs(set('24', bad))).toThrow(/--keep must be an integer/);
    expect(parseArgs(set('8760', '1000'))).toMatchObject({ everyHours: 8760, keep: 1000 });
    expect(parseArgs(set('1', '1'))).toMatchObject({ everyHours: 1, keep: 1 });
  });

  it('documents the commands in the help text without a passphrase flag', () => {
    for (const line of ['backup create', 'backup list', 'backup verify', 'backup schedule set', 'backup schedule off|status', 'DUDE_HUB_BACKUP_PASSPHRASE']) {
      expect(HELP_TEXT).toContain(line);
    }
  });
});
