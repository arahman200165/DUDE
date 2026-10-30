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

  it('parses backup create --for-transfer and backup reactivate', () => {
    expect(parseArgs(['backup', 'create', '--for-transfer'])).toEqual({ command: 'backup', action: 'create', forTransfer: true });
    expect(parseArgs(['backup', 'create', '--for-transfer', '--folder', FOLDER, '--confirm', 'tok'])).toEqual({
      command: 'backup', action: 'create', forTransfer: true, folder: FOLDER, confirm: 'tok',
    });
    expect(parseArgs(['backup', 'create'])).not.toHaveProperty('forTransfer');
    expect(parseArgs(['backup', 'reactivate'])).toEqual({ command: 'backup', action: 'reactivate' });
    expect(parseArgs(['backup', 'reactivate', '--confirm', 'tok', '--data-dir', 'd', '--install-dir', 'i'])).toEqual({
      command: 'backup', action: 'reactivate', confirm: 'tok', dataDir: 'd', installDir: 'i',
    });
  });

  it('parses backup restore with the typed phrases passed through verbatim', () => {
    expect(parseArgs(['backup', 'restore', '--file', FILE])).toEqual({ command: 'backup-restore', file: FILE });
    expect(parseArgs(['backup', 'restore', '--file', FILE, '--data-dir', 'd', '--install-dir', 'i', '--confirm', 'tok', '--replace', 'REPLACE HUB DATA', '--old-hub-gone', 'THE OLD HUB IS GONE'])).toEqual({
      command: 'backup-restore', file: FILE, dataDir: 'd', installDir: 'i', confirm: 'tok', replace: 'REPLACE HUB DATA', oldHubGone: 'THE OLD HUB IS GONE',
    });
    // A near miss is not normalised here; the command refuses it.
    expect(parseArgs(['backup', 'restore', '--file', FILE, '--replace=replace hub data '])).toMatchObject({ replace: 'replace hub data ' });
    expect(() => parseArgs(['backup', 'restore', '--file', 'x.dudebackup'])).toThrow(/absolute path/);
    expect(() => parseArgs(['backup', 'restore', '--file', FILE, '--replace'])).toThrow(/needs a value/);
  });

  it('never accepts the passphrase as a flag, for any backup command', () => {
    const attempts = [
      ['backup', 'restore', '--file', FILE, '--passphrase', 'hunter2hunter2'],
      ['backup', 'restore', '--passphrase=hunter2hunter2'],
      ['backup', 'reactivate', '--passphrase', 'hunter2hunter2'],
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
    expect(() => parseArgs(['backup', 'restore'])).toThrow(/Usage: dude-hub backup restore --file/);
    expect(() => parseArgs(['backup', 'restore', '--folder', FOLDER, '--backup'])).toThrow(/needs a value/);
    expect(() => parseArgs(['backup', 'restore', '--file', FILE, '--backup', 'x'])).toThrow(/Usage: dude-hub backup restore/);
    expect(() => parseArgs(['backup', 'destination'])).toThrow(/Usage: dude-hub backup destination/);
    expect(() => parseArgs(['backup', 'destination', 'add'])).toThrow(/--folder/);
    expect(() => parseArgs(['backup', 'destination', 'remove'])).toThrow(/--id/);
    expect(() => parseArgs(['backup', 'prune'])).toThrow(/--destination/);
    expect(() => parseArgs(['backup', 'run', '--confirm', 't'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'rewrap', '--folder', FOLDER])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'transfer'])).toThrow(/Usage: dude-hub backup/);
    expect(() => parseArgs(['backup', 'verify', '--file', FILE, '--for-transfer'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'list', '--for-transfer'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'create', '--for-transfer=yes'])).toThrow(/takes no value/);
    expect(() => parseArgs(['backup', 'reactivate', '--folder', FOLDER])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'restore', '--file', FILE, '--folder', FOLDER])).toThrow(/Usage: dude-hub backup restore/);
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
    expect(() => parseArgs(['backup', 'schedule', 'set', '--folder', FOLDER, '--keep', '1'])).toThrow(/--every-hours is required/);
    expect(() => parseArgs(['backup', 'schedule', 'set', '--every-hours', '1', '--keep', '0'])).toThrow(/--keep must be an integer/);
  });

  it('parses the backup v2 commands (Milestone 847): folder-less schedule, destinations, run, prune, rewrap and a folder restore', () => {
    expect(parseArgs(['backup', 'schedule', 'set', '--every-hours', '24'])).toEqual({ command: 'backup', action: 'schedule-set', everyHours: 24 });
    expect(parseArgs(['backup', 'schedule', 'set', '--every-hours', '6', '--folder', FOLDER, '--keep', '3'])).toEqual({ command: 'backup', action: 'schedule-set', everyHours: 6, folder: FOLDER, keep: 3 });
    expect(parseArgs(['backup', 'destination', 'add', '--folder', FOLDER, '--label', 'USB disk'])).toEqual({ command: 'backup', action: 'destination-add', folder: FOLDER, label: 'USB disk' });
    expect(parseArgs(['backup', 'destination', 'list'])).toEqual({ command: 'backup', action: 'destination-list' });
    expect(parseArgs(['backup', 'destination', 'remove', '--id', 'd-1', '--confirm', 't'])).toEqual({ command: 'backup', action: 'destination-remove', destination: 'd-1', confirm: 't' });
    expect(parseArgs(['backup', 'destination', 'verify', '--id', 'd-1', '--backup', 'b'])).toEqual({ command: 'backup', action: 'destination-verify', destination: 'd-1', backupId: 'b' });
    expect(parseArgs(['backup', 'run'])).toEqual({ command: 'backup', action: 'run' });
    expect(parseArgs(['backup', 'run', '--destination', 'd-1'])).toEqual({ command: 'backup', action: 'run', destination: 'd-1' });
    expect(parseArgs(['backup', 'drill'])).toEqual({ command: 'backup', action: 'drill' });
    expect(parseArgs(['backup', 'drill', '--destination', 'd-1'])).toEqual({ command: 'backup', action: 'drill', destination: 'd-1' });
    expect(() => parseArgs(['backup', 'drill', '--confirm', 't'])).toThrow(/Unknown flag/);
    expect(parseArgs(['backup', 'prune', '--destination', 'd-1', '--confirm', 't'])).toEqual({ command: 'backup', action: 'prune', destination: 'd-1', confirm: 't' });
    expect(parseArgs(['backup', 'rewrap', '--confirm', 't'])).toEqual({ command: 'backup', action: 'rewrap', confirm: 't' });
    expect(parseArgs(['backup', 'restore', '--folder', FOLDER, '--backup', 'b', '--confirm', 't'])).toEqual({ command: 'backup-restore', folder: FOLDER, backupId: 'b', confirm: 't' });
    expect(() => parseArgs(['backup', 'destination', 'add', '--folder', FOLDER, '--passphrase', 'x'])).toThrow(/never accepted as a flag/);
  });

  it('parses backup destination add --kind s3 (Milestone 848) with the credentials only from standard input', () => {
    const base = ['backup', 'destination', 'add', '--kind', 's3', '--endpoint', 'https://s3.example.com', '--region', 'us-east-1', '--bucket', 'my-backups', '--credentials-stdin'];
    expect(parseArgs(base)).toEqual({
      command: 'backup', action: 'destination-add', kind: 's3', endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'my-backups', credentialsStdin: true,
    });
    expect(parseArgs([...base, '--prefix', 'hub/one', '--label', 'Cloud', '--force-path-style', '--allow-private-network', '--data-dir', 'd'])).toEqual({
      command: 'backup', action: 'destination-add', kind: 's3', endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'my-backups', credentialsStdin: true,
      prefix: 'hub/one', label: 'Cloud', forcePathStyle: true, allowPrivateNetwork: true, dataDir: 'd',
    });
    expect(parseArgs([...base, '--virtual-hosted'])).toMatchObject({ forcePathStyle: false });
    expect(parseArgs([...base, '--endpoint=https://other.example.com'])).toMatchObject({ endpoint: 'https://other.example.com' });
    expect(parseArgs(base)).not.toHaveProperty('forcePathStyle');
    expect(parseArgs(base)).not.toHaveProperty('allowPrivateNetwork');
    expect(parseArgs(['backup', 'destination', 'add', '--kind', 'local-folder', '--folder', FOLDER])).toEqual({ command: 'backup', action: 'destination-add', folder: FOLDER });
  });

  it('refuses incomplete or mixed S3 destination flags and any S3 secret as an argument', () => {
    const base = ['backup', 'destination', 'add', '--kind', 's3', '--endpoint', 'https://s3.example.com', '--region', 'us-east-1', '--bucket', 'my-backups', '--credentials-stdin'];
    const without = (flag: string): string[] => { const i = base.indexOf(flag); return base.filter((_, j) => j !== i && (flag === '--credentials-stdin' || j !== i + 1)); };
    for (const flag of ['--endpoint', '--region', '--bucket', '--credentials-stdin']) expect(() => parseArgs(without(flag)), flag).toThrow(/Usage: dude-hub backup destination add --kind s3/);
    expect(() => parseArgs([...base, '--folder', FOLDER])).toThrow(/--folder belongs to a local-folder/);
    expect(() => parseArgs([...base, '--force-path-style', '--virtual-hosted'])).toThrow(/only one of/);
    expect(() => parseArgs(['backup', 'destination', 'add', '--kind', 'azure', '--folder', FOLDER])).toThrow(/--kind must be local-folder, s3, drive or onedrive/);
    for (const flag of ['--endpoint', '--region', '--bucket', '--prefix']) expect(() => parseArgs(['backup', 'destination', 'add', '--folder', FOLDER, flag, 'x']), flag).toThrow(/belongs to --kind s3/);
    for (const flag of ['--force-path-style', '--virtual-hosted', '--allow-private-network', '--credentials-stdin']) expect(() => parseArgs(['backup', 'destination', 'add', '--folder', FOLDER, flag]), flag).toThrow(/belongs to --kind s3/);
    expect(() => parseArgs([...base, '--credentials-stdin=yes'])).toThrow(/takes no value/);
    for (const secret of ['--access-key-id', '--secret-access-key', '--session-token', '--credentials', '--secret', '--passphrase']) {
      expect(() => parseArgs([...base, secret, 'AKIAHUNTER2HUNTER2']), secret).toThrow(/Unknown flag|never accepted as a flag/);
      expect(() => parseArgs([...base, `${secret}=AKIAHUNTER2HUNTER2`]), secret).toThrow(/Unknown flag|never accepted as a flag/);
    }
    for (const flag of ['--endpoint', '--region', '--bucket', '--prefix']) expect(() => parseArgs([...base, flag]), flag).toThrow(/needs a value/);
    expect(() => parseArgs(['backup', 'run', '--endpoint', 'https://s3.example.com'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'destination', 'verify', '--id', 'd-1', '--credentials-stdin'])).toThrow(/Unknown flag/);
  });

  it('parses backup destination add --kind drive (Milestone 856): the OAuth client id is a flag, the client secret only comes from standard input, and the confirmation is two-step', () => {
    const base = ['backup', 'destination', 'add', '--kind', 'drive', '--client-id', 'abc.apps.googleusercontent.com', '--credentials-stdin'];
    expect(parseArgs(base)).toEqual({ command: 'backup', action: 'destination-add', kind: 'drive', clientId: 'abc.apps.googleusercontent.com', credentialsStdin: true });
    expect(parseArgs([...base, '--redirect-origin', 'https://hub.example.com', '--label', 'My Drive', '--confirm', 'tok', '--data-dir', 'd'])).toEqual({
      command: 'backup', action: 'destination-add', kind: 'drive', clientId: 'abc.apps.googleusercontent.com', credentialsStdin: true,
      redirectOrigin: 'https://hub.example.com', label: 'My Drive', confirm: 'tok', dataDir: 'd',
    });
    expect(parseArgs([...base, '--reconnect', 'd-1a2b3c4d'])).toMatchObject({ reconnect: 'd-1a2b3c4d' });
    for (const flag of ['--client-id', '--credentials-stdin']) {
      const i = base.indexOf(flag);
      const without = base.filter((_, j) => j !== i && (flag === '--credentials-stdin' || j !== i + 1));
      expect(() => parseArgs(without), flag).toThrow(/Usage: dude-hub backup destination add --kind drive/);
    }
    for (const flag of ['--folder', '--endpoint', '--region', '--bucket', '--prefix']) expect(() => parseArgs([...base, flag, FOLDER]), flag).toThrow(/does not belong to --kind drive/);
    for (const flag of ['--client-id', '--redirect-origin', '--reconnect', '--confirm']) {
      expect(() => parseArgs(['backup', 'destination', 'add', '--folder', FOLDER, flag, 'x']), flag).toThrow(/belongs to --kind drive/);
      expect(() => parseArgs(['backup', 'destination', 'add', '--kind', 's3', '--endpoint', 'https://s3.example.com', '--region', 'r', '--bucket', 'my-backups', '--credentials-stdin', flag, 'x']), flag).toThrow(/belongs to --kind drive/);
    }
    for (const secret of ['--client-secret', '--secret', '--refresh-token', '--token', '--passphrase']) {
      expect(() => parseArgs([...base, secret, 'GOCSPX-hunter2hunter2']), secret).toThrow(/Unknown flag|never accepted as a flag/);
      expect(() => parseArgs([...base, `${secret}=GOCSPX-hunter2hunter2`]), secret).toThrow(/Unknown flag|never accepted as a flag/);
    }
    expect(() => parseArgs([...base, '--credentials-stdin=yes'])).toThrow(/takes no value/);
    expect(HELP_TEXT).toContain('backup destination add --kind drive');
    expect(HELP_TEXT).toContain('drive.file');
  });

  it('parses backup destination add --kind onedrive (Milestone 857): the same flags as Drive, the client secret only from standard input, and the two-step confirmation', () => {
    const base = ['backup', 'destination', 'add', '--kind', 'onedrive', '--client-id', '11111111-2222-3333-4444-555555555555', '--credentials-stdin'];
    expect(parseArgs(base)).toEqual({ command: 'backup', action: 'destination-add', kind: 'onedrive', clientId: '11111111-2222-3333-4444-555555555555', credentialsStdin: true });
    expect(parseArgs([...base, '--redirect-origin', 'https://hub.example.com', '--label', 'My OneDrive', '--confirm', 'tok', '--reconnect', 'd-1a2b3c4d', '--data-dir', 'd'])).toEqual({
      command: 'backup', action: 'destination-add', kind: 'onedrive', clientId: '11111111-2222-3333-4444-555555555555', credentialsStdin: true,
      redirectOrigin: 'https://hub.example.com', label: 'My OneDrive', confirm: 'tok', reconnect: 'd-1a2b3c4d', dataDir: 'd',
    });
    for (const flag of ['--client-id', '--credentials-stdin']) {
      const i = base.indexOf(flag);
      const without = base.filter((_, j) => j !== i && (flag === '--credentials-stdin' || j !== i + 1));
      expect(() => parseArgs(without), flag).toThrow(/Usage: dude-hub backup destination add --kind onedrive/);
    }
    for (const flag of ['--folder', '--endpoint', '--region', '--bucket', '--prefix']) expect(() => parseArgs([...base, flag, FOLDER]), flag).toThrow(/does not belong to --kind onedrive/);
    for (const secret of ['--client-secret', '--secret', '--refresh-token', '--token', '--passphrase']) expect(() => parseArgs([...base, secret, 'hunter2.hunter2~secret']), secret).toThrow(/Unknown flag|never accepted as a flag/);
    expect(() => parseArgs([...base, '--credentials-stdin=yes'])).toThrow(/takes no value/);
    expect(HELP_TEXT).toContain('backup destination add --kind onedrive');
    expect(HELP_TEXT).toContain('Files.ReadWrite.AppFolder');
  });

  it('parses backup destination probe --id and lists the S3 commands in the help text', () => {
    expect(parseArgs(['backup', 'destination', 'probe', '--id', 'd-1'])).toEqual({ command: 'backup', action: 'destination-probe', destination: 'd-1' });
    expect(parseArgs(['backup', 'destination', 'probe', '--id=d-1', '--data-dir', 'd', '--install-dir', 'i'])).toEqual({ command: 'backup', action: 'destination-probe', destination: 'd-1', dataDir: 'd', installDir: 'i' });
    expect(() => parseArgs(['backup', 'destination', 'probe'])).toThrow(/Usage: dude-hub backup destination probe --id <id>/);
    expect(() => parseArgs(['backup', 'destination', 'probe', '--id', 'd-1', '--folder', FOLDER])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['backup', 'destination', 'probe', '--id', 'd-1', '--passphrase', 'x'])).toThrow(/never accepted as a flag/);
    expect(() => parseArgs(['backup', 'destination', 'nope'])).toThrow(/probe --id <id>/);
    expect(HELP_TEXT).toContain('backup destination add --kind s3');
    expect(HELP_TEXT).toContain('--credentials-stdin');
    expect(HELP_TEXT).toContain('backup destination probe --id <id>');
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
    for (const line of ['backup create', 'backup list', 'backup verify', 'backup schedule set', 'backup schedule off|status', 'backup restore', 'backup reactivate', '--for-transfer', 'REPLACE HUB DATA', 'THE OLD HUB IS GONE', 'DUDE_HUB_BACKUP_PASSPHRASE']) {
      expect(HELP_TEXT).toContain(line);
    }
  });
});
