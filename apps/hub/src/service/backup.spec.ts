import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { BACKUP_PASSPHRASE_ENV } from '../cli/passphrase.js';
import { runBackup } from './backup.js';
import type { BackupCommandDeps, BackupCommandOptions } from './backup.js';
import { fixture } from './test-helpers.js';

const PASSPHRASE = 'correct horse battery staple';
const FOLDER = path.resolve(path.parse(process.cwd()).root, 'dude-backups');
const FILE = path.join(FOLDER, 'dude-hub-20260101T000000Z.dudebackup');

interface Call { method: string; params: Record<string, unknown>; timeoutMs: number | undefined }

/** A Hub that answers `status` and the backup methods with canned results (or throws what `fail` returns). */
function harness(initial: Parameters<typeof fixture>[0] = {}, extra: Partial<BackupCommandDeps> & { fail?: (method: string) => Error | undefined; env?: Record<string, string | undefined>; probe?: Record<string, unknown>; driveStatuses?: Array<Record<string, unknown>>; driveExpiresAt?: string } = {}) {
  const f = fixture(initial);
  const calls: Call[] = [];
  const { fail, env, probe, driveStatuses, driveExpiresAt, ...rest } = extra;
  const statuses = [...(driveStatuses ?? [{ state: 'authorized' }])];
  const deps: BackupCommandDeps = {
    ...f.deps,
    ...(env !== undefined ? { env: { ...f.deps.env, ...env } } : {}),
    call: async (_dataDir, method, params, timeoutMs) => {
      calls.push({ method, params: params as Record<string, unknown>, timeoutMs });
      const error = fail?.(method);
      if (error) throw error;
      switch (method) {
        case 'status': return { ok: true };
        case 'backup.create.preview':
          return {
            confirmToken: 'tok-123', expiresAt: 1_700_000_060_000, consequenceClass: ['filesystem-write', 'secret-management'],
            summary: {
              folder: FOLDER, file: 'dude-hub-20260101T000000Z.dudebackup', onHubVolume: true, sameMachineWarning: 'Keep a copy elsewhere.',
              hubInstanceId: 'hub-1', authorityEpoch: 4, counts: { devices: 2, audit_events: 31 }, passphraseWarning: 'Losing the passphrase makes the backup unrecoverable.',
            },
          };
        case 'backup.create.apply': return { file: FILE, name: path.basename(FILE), size: 4096, sha256: 'ab'.repeat(32), manifest: { counts: {} }, ...(params !== null && typeof params === 'object' && (params as { forTransfer?: unknown }).forTransfer === true ? { retired: true } : {}) };
        case 'backup.reactivate.preview': return { confirmToken: 'rtok-9', expiresAt: 1_700_000_060_000, summary: { state: 'transferred', authorityEpoch: 4, newEpoch: 5 } };
        case 'backup.reactivate.apply': return { reactivated: true, authorityEpoch: 5 };
        case 'backup.list': return { folder: FOLDER, backups: [{ name: path.basename(FILE), size: 4096, modifiedAt: '2026-01-01T00:00:00.000Z' }] };
        case 'backup.verify': return { ok: true, manifest: { formatVersion: 1, counts: { devices: 2 } } };
        case 'backup.schedule.set': return { configured: true, folder: FOLDER, intervalHours: 24, retention: 7, replaced: false };
        case 'backup.schedule.off': return { configured: false, wasConfigured: true };
        case 'backup.destination.add': return { added: true, adopted: false, destination: { id: 'd-1', kind: (params as { kind?: string }).kind } };
        case 'backup.destination.drive.connect.preview':
          return { confirmToken: 'dtok-1', expiresAt: 1_700_000_060_000, consequenceClass: ['secret-management', 'remote-write'], summary: { provider: 'Google Drive', scope: 'https://www.googleapis.com/auth/drive.file', redirectUri: 'https://hub.example.com/api/v1/backup/drive/callback', note: 'Encrypted backups will be copied to your Google account.' } };
        case 'backup.destination.drive.connect.apply':
          return { pendingId: 'p'.repeat(32), authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=STATE123', redirectUri: 'https://hub.example.com/api/v1/backup/drive/callback', expiresAt: driveExpiresAt ?? new Date(600_000).toISOString() };
        case 'backup.destination.drive.connect.status': return statuses.length > 1 ? statuses.shift()! : statuses[0]!;
        case 'backup.destination.drive.connect.complete': return { added: true, adopted: false, destination: { id: 'd-1', kind: 'drive' } };
        case 'backup.destination.probe': return probe ?? { id: 'd-1', kind: 's3', ok: true, conditionalWrites: 'enforced' };
        case 'backup.schedule.status': return { configured: true, folder: FOLDER, intervalHours: 24, retention: 7, last: null, keyPresent: true };
        default: throw new Error(`unexpected ${method}`);
      }
    },
    ...rest,
  };
  const run = (options: BackupCommandOptions): Promise<number> => runBackup({ dataDir: f.dataDir, ...options }, deps);
  const backupCalls = (): Call[] => calls.filter((c) => c.method !== 'status');
  const output = (): string => `${f.out.join('')}\n${f.err.join('')}`;
  return { f, run, calls, backupCalls, output };
}

const withEnv = { env: { [BACKUP_PASSPHRASE_ENV]: PASSPHRASE } };

describe('backup create', () => {
  it('previews without touching the passphrase: token on stdout, summary and warnings on stderr', async () => {
    let asked = 0;
    const h = harness({}, { readPassphrase: async () => { asked++; return PASSPHRASE; } });
    expect(await h.run({ action: 'create', folder: FOLDER })).toBe(0);
    expect(asked).toBe(0);
    expect(h.backupCalls()).toEqual([{ method: 'backup.create.preview', params: { folder: FOLDER }, timeoutMs: undefined }]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ confirmToken: 'tok-123', expiresAt: 1_700_000_060_000 });
    const err = h.f.err.join('');
    expect(err).toContain(FOLDER);
    expect(err).toContain('dude-hub-20260101T000000Z.dudebackup');
    expect(err).toContain('Keep a copy elsewhere.');
    expect(err).toContain('same volume');
    expect(err).toContain('authority epoch 4');
    expect(err).toContain('devices 2, audit_events 31');
    expect(err).toContain('Losing the passphrase makes the backup unrecoverable.');
    expect(err).toMatch(/--confirm <confirmToken> within 60 seconds/);
  });

  it('omits the folder when none was given', async () => {
    const h = harness();
    await h.run({ action: 'create' });
    expect(h.backupCalls()[0]!.params).toEqual({});
  });

  it('applies with the passphrase from the environment, a long timeout, and never prints the passphrase', async () => {
    const h = harness({}, withEnv);
    expect(await h.run({ action: 'create', folder: FOLDER, confirm: 'tok-123' })).toBe(0);
    expect(h.backupCalls()).toEqual([{ method: 'backup.create.apply', params: { confirmToken: 'tok-123', folder: FOLDER, passphrase: PASSPHRASE }, timeoutMs: 10 * 60 * 1000 }]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ file: FILE, size: 4096, sha256: 'ab'.repeat(32) });
    expect(h.f.err.join('')).toContain('Losing the passphrase makes the backup unrecoverable.');
    expect(h.output()).not.toContain(PASSPHRASE);
  });

  it('applies with the first line of a piped stdin', async () => {
    const stdin = new PassThrough();
    stdin.end(`${PASSPHRASE}\r\nignored\r\n`);
    const h = harness({}, { stdin: stdin as unknown as BackupCommandDeps['stdin'] });
    expect(await h.run({ action: 'create', confirm: 'tok-123' })).toBe(0);
    expect(h.backupCalls()[0]!.params['passphrase']).toBe(PASSPHRASE);
    expect(h.output()).not.toContain(PASSPHRASE);
  });

  it('asks for the passphrase twice through the prompt source with the documented prompt text', async () => {
    const asked: { prompt: string; confirm: boolean }[] = [];
    const h = harness({}, { readPassphrase: async (o) => { asked.push(o); return PASSPHRASE; } });
    await h.run({ action: 'create', confirm: 'tok-123' });
    expect(asked).toEqual([{ prompt: 'Backup passphrase (min 12 characters): ', confirm: true }]);
  });

  it('refuses a short passphrase locally without calling apply, and never prints it', async () => {
    const h = harness({}, { env: { [BACKUP_PASSPHRASE_ENV]: 'short-one' } });
    expect(await h.run({ action: 'create', confirm: 'tok-123' })).toBe(1);
    expect(h.backupCalls()).toEqual([]);
    expect(h.f.err.join('')).toMatch(/at least 12 characters/);
    expect(h.output()).not.toContain('short-one');
  });

  it('reports a cancelled or mismatched prompt as a failure without calling apply', async () => {
    const h = harness({}, { readPassphrase: async () => { throw new Error('The two passphrases do not match.'); } });
    expect(await h.run({ action: 'create', confirm: 'tok-123' })).toBe(1);
    expect(h.f.err.join('')).toContain('The two passphrases do not match.');
    expect(h.backupCalls()).toEqual([]);
  });

  it('maps admin errors to clear messages and exit codes', async () => {
    const cases: [string, AdminCallError, number, RegExp][] = [
      ['expired', new AdminCallError('confirmation-required', 'x'), 1, /expired or already used.*backup create/s],
      ['changed', new AdminCallError('conflict', 'The target folder or the Hub changed since the preview. Run the preview again.'), 1, /changed since the preview/],
      ['failed', new AdminCallError('backup-failed', 'The backup could not be created (disk-full). Nothing was kept.', { reason: 'disk-full' }), 1, /Nothing was kept\. \[disk-full\]/],
      ['bad folder', new AdminCallError('bad-request', 'The backup folder cannot be inside the Hub\'s data, configuration or certificate directories.'), 1, /cannot be inside/],
      ['timeout', new AdminCallError('timeout', 'The Hub did not answer in time.'), 1, /may still be working/],
      ['gone', new AdminCallError(HUB_NOT_RUNNING, 'gone'), 2, /not running/],
    ];
    for (const [, error, code, message] of cases) {
      const h = harness({}, { ...withEnv, fail: (method) => (method === 'backup.create.apply' ? error : undefined) });
      expect(await h.run({ action: 'create', confirm: 'tok-123' })).toBe(code);
      expect(h.f.err.join('')).toMatch(message);
      expect(h.output()).not.toContain(PASSPHRASE);
    }
  });

  it('exits 2 without prompting when the Hub is not running', async () => {
    let asked = 0;
    const h = harness({}, { fail: () => new AdminCallError(HUB_NOT_RUNNING, 'The DUDE Hub is not running for this data directory.'), readPassphrase: async () => { asked++; return PASSPHRASE; } });
    expect(await h.run({ action: 'create', confirm: 'tok-123' })).toBe(2);
    expect(asked).toBe(0);
    expect(h.f.err.join('')).toMatch(/Hub is not running/);
  });
});

const RETIRE = /RETIRED after the backup is written and verified.*"dude-hub backup reactivate"/s;

describe('backup create --for-transfer', () => {
  it('sends forTransfer in the preview, prints the retire warning and keeps the token on stdout', async () => {
    const h = harness();
    expect(await h.run({ action: 'create', folder: FOLDER, forTransfer: true })).toBe(0);
    expect(h.backupCalls()).toEqual([{ method: 'backup.create.preview', params: { folder: FOLDER, forTransfer: true }, timeoutMs: undefined }]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ confirmToken: 'tok-123', expiresAt: 1_700_000_060_000 });
    expect(h.f.err.join('')).toMatch(RETIRE);
    expect(h.f.err.join('')).toContain('and --for-transfer');
  });

  it('sends forTransfer in the apply, warns before asking for the passphrase and reports the retirement', async () => {
    const order: string[] = [];
    const h = harness({}, { readPassphrase: async () => { order.push(`ask after ${h.f.err.join('').includes('RETIRED') ? 'warning' : 'nothing'}`); return PASSPHRASE; } });
    expect(await h.run({ action: 'create', folder: FOLDER, confirm: 'tok-123', forTransfer: true })).toBe(0);
    expect(order).toEqual(['ask after warning']);
    expect(h.backupCalls()).toEqual([{ method: 'backup.create.apply', params: { confirmToken: 'tok-123', folder: FOLDER, passphrase: PASSPHRASE, forTransfer: true }, timeoutMs: 10 * 60 * 1000 }]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ file: FILE, size: 4096, sha256: 'ab'.repeat(32), retired: true });
    expect(h.f.err.join('')).toMatch(RETIRE);
    expect(h.f.err.join('')).toContain('This Hub is now retired (transferred).');
    expect(h.output()).not.toContain(PASSPHRASE);
  });

  it('does not claim a retirement the Hub did not report, and plain create never mentions one', async () => {
    const h = harness({}, { ...withEnv, call: async (_dir, method) => (method === 'status' ? { ok: true } : { file: FILE, size: 1, sha256: 'cd'.repeat(32) }) });
    expect(await h.run({ action: 'create', confirm: 'tok-123', forTransfer: true })).toBe(0);
    expect(h.f.err.join('')).not.toContain('is now retired');
    expect(h.f.err.join('')).toContain('did not report that it was retired');
    const plain = harness({}, withEnv);
    await plain.run({ action: 'create', confirm: 'tok-123' });
    expect(plain.backupCalls()[0]!.params).not.toHaveProperty('forTransfer');
    expect(plain.f.err.join('')).not.toMatch(/RETIRED|retired/);
  });

  it('is elevated in both steps like create', async () => {
    for (const confirm of [undefined, 'tok']) {
      const h = harness({ state: 'running', elevated: false }, withEnv);
      expect(await h.run({ action: 'create', forTransfer: true, ...(confirm !== undefined ? { confirm } : {}) })).toBe(2);
      expect(h.calls).toEqual([]);
    }
  });
});

describe('backup reactivate', () => {
  it('previews without writing, printing the summary on stderr and the token on stdout', async () => {
    let asked = 0;
    const h = harness({}, { readPassphrase: async () => { asked++; return PASSPHRASE; } });
    expect(await h.run({ action: 'reactivate' })).toBe(0);
    expect(asked).toBe(0);
    expect(h.backupCalls()).toEqual([{ method: 'backup.reactivate.preview', params: {}, timeoutMs: undefined }]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ confirmToken: 'rtok-9', expiresAt: 1_700_000_060_000 });
    expect(h.f.err.join('')).toContain('state: transferred');
    expect(h.f.err.join('')).toMatch(/--confirm <confirmToken> within 60 seconds/);
  });

  it('applies with the token only (no passphrase) and prints the new epoch', async () => {
    let asked = 0;
    const h = harness({}, { readPassphrase: async () => { asked++; return PASSPHRASE; } });
    expect(await h.run({ action: 'reactivate', confirm: 'rtok-9' })).toBe(0);
    expect(asked).toBe(0);
    expect(h.backupCalls()).toEqual([{ method: 'backup.reactivate.apply', params: { confirmToken: 'rtok-9' }, timeoutMs: undefined }]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ reactivated: true, authorityEpoch: 5 });
    expect(h.f.err.join('')).toContain('authority epoch 5');
  });

  it('is refused in both steps without elevation when the service is installed, and runs elevated', async () => {
    for (const confirm of [undefined, 'rtok-9']) {
      const h = harness({ state: 'running', elevated: false });
      expect(await h.run({ action: 'reactivate', ...(confirm !== undefined ? { confirm } : {}) })).toBe(2);
      expect(h.calls).toEqual([]);
      expect(h.f.err.join('')).toMatch(/elevated \(Administrator\) terminal/);
    }
    expect(await harness({ state: 'running', elevated: true }).run({ action: 'reactivate' })).toBe(0);
  });

  it('maps a conflict (not transferred), an expired token and a stopped Hub to clear messages', async () => {
    const conflict = harness({}, { fail: (method) => (method === 'backup.reactivate.preview' ? new AdminCallError('conflict', 'This Hub is not retired, so there is nothing to reactivate.') : undefined) });
    expect(await conflict.run({ action: 'reactivate' })).toBe(1);
    expect(conflict.f.err.join('')).toContain('This Hub is not retired, so there is nothing to reactivate.');
    const expired = harness({}, { fail: (method) => (method === 'backup.reactivate.apply' ? new AdminCallError('confirmation-required', 'x') : undefined) });
    expect(await expired.run({ action: 'reactivate', confirm: 'rtok-9' })).toBe(1);
    expect(expired.f.err.join('')).toMatch(/expired or already used.*backup reactivate/s);
    const gone = harness({}, { fail: () => new AdminCallError(HUB_NOT_RUNNING, 'gone') });
    expect(await gone.run({ action: 'reactivate' })).toBe(2);
    expect(gone.f.err.join('')).toMatch(/Reactivation is done by the running Hub/);
  });
});

describe('elevation', () => {
  it('refuses create (both steps), verify and the schedule writers when the service is installed and the terminal is not elevated', async () => {
    const options: BackupCommandOptions[] = [
      { action: 'create' }, { action: 'create', confirm: 'tok' }, { action: 'verify', file: FILE },
      { action: 'schedule-set', folder: FOLDER, everyHours: 24, keep: 7 }, { action: 'schedule-off' },
    ];
    for (const option of options) {
      let asked = 0;
      const h = harness({ state: 'running', elevated: false }, { ...withEnv, readPassphrase: async () => { asked++; return PASSPHRASE; } });
      expect(await h.run(option)).toBe(2);
      expect(h.calls).toEqual([]);
      expect(asked).toBe(0);
      expect(h.f.err.join('')).toMatch(/elevated \(Administrator\) terminal/);
      expect(h.output()).not.toContain(PASSPHRASE);
    }
  });

  it('lets list and schedule status run without elevation', async () => {
    const list = harness({ state: 'running', elevated: false });
    expect(await list.run({ action: 'list' })).toBe(0);
    const status = harness({ state: 'running', elevated: false });
    expect(await status.run({ action: 'schedule-status' })).toBe(0);
    expect(list.f.system.calls.some((c) => c.startsWith('fltmc'))).toBe(false);
  });

  it('does not require elevation when no service is installed', async () => {
    const h = harness({ state: 'not-installed', elevated: false });
    expect(await h.run({ action: 'create' })).toBe(0);
  });

  it('proceeds when elevated', async () => {
    const h = harness({ state: 'running', elevated: true });
    expect(await h.run({ action: 'create' })).toBe(0);
  });
});

describe('backup list, verify and schedule', () => {
  it('lists backups, passing the folder only when given', async () => {
    const h = harness();
    expect(await h.run({ action: 'list', folder: FOLDER })).toBe(0);
    expect(h.backupCalls()).toEqual([{ method: 'backup.list', params: { folder: FOLDER }, timeoutMs: undefined }]);
    expect(JSON.parse(h.f.out.join('')).backups).toHaveLength(1);
    const plain = harness();
    await plain.run({ action: 'list' });
    expect(plain.backupCalls()[0]!.params).toEqual({});
  });

  it('verifies a file with the passphrase (no confirmation prompt) and prints the manifest summary', async () => {
    const asked: { prompt: string; confirm: boolean }[] = [];
    const h = harness({}, { readPassphrase: async (o) => { asked.push(o); return PASSPHRASE; } });
    expect(await h.run({ action: 'verify', file: FILE })).toBe(0);
    expect(asked).toEqual([{ prompt: 'Backup passphrase: ', confirm: false }]);
    expect(h.backupCalls()).toEqual([{ method: 'backup.verify', params: { file: FILE, passphrase: PASSPHRASE }, timeoutMs: 10 * 60 * 1000 }]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ ok: true, manifest: { formatVersion: 1, counts: { devices: 2 } } });
    expect(h.output()).not.toContain(PASSPHRASE);
  });

  it('maps a wrong passphrase on verify to a clear failure that does not echo it', async () => {
    const h = harness({}, { ...withEnv, fail: (method) => (method === 'backup.verify' ? new AdminCallError('wrong-passphrase-or-corrupt', 'detail') : undefined) });
    expect(await h.run({ action: 'verify', file: FILE })).toBe(1);
    expect(h.f.err.join('')).toMatch(/passphrase is wrong or the file is damaged/);
    expect(h.output()).not.toContain(PASSPHRASE);
  });

  it('sets a schedule with a folder: the passphrase, a long timeout and an explanation of the stored key; --keep is reported as unused', async () => {
    const asked: { prompt: string; confirm: boolean }[] = [];
    const h = harness({}, { readPassphrase: async (o) => { asked.push(o); return PASSPHRASE; } });
    expect(await h.run({ action: 'schedule-set', folder: FOLDER, everyHours: 24, keep: 7 })).toBe(0);
    expect(asked).toEqual([{ prompt: 'Backup passphrase (min 12 characters): ', confirm: true }]);
    expect(h.backupCalls()).toEqual([{ method: 'backup.schedule.set', params: { intervalHours: 24, folder: FOLDER, passphrase: PASSPHRASE }, timeoutMs: 10 * 60 * 1000 }]);
    const err = h.f.err.join('');
    expect(err).toContain('Losing the passphrase makes the backup unrecoverable.');
    expect(err).toContain('the passphrase itself is not stored');
    expect(err).toContain('--keep is no longer used');
    expect(h.output()).not.toContain(PASSPHRASE);
  });

  it('sets a folder-less schedule without asking for a passphrase', async () => {
    let asked = 0;
    const h = harness({}, { readPassphrase: async () => { asked += 1; return PASSPHRASE; } });
    expect(await h.run({ action: 'schedule-set', everyHours: 12 })).toBe(0);
    expect(asked).toBe(0);
    expect(h.backupCalls()).toEqual([{ method: 'backup.schedule.set', params: { intervalHours: 12 }, timeoutMs: 10 * 60 * 1000 }]);
  });

  it('turns the schedule off and shows its status without a passphrase', async () => {
    let asked = 0;
    const h = harness({}, { readPassphrase: async () => { asked++; return PASSPHRASE; } });
    expect(await h.run({ action: 'schedule-off' })).toBe(0);
    expect(await h.run({ action: 'schedule-status' })).toBe(0);
    expect(h.backupCalls().map((c) => c.method)).toEqual(['backup.schedule.off', 'backup.schedule.status']);
    expect(asked).toBe(0);
    expect(h.f.out.join('')).toContain('"keyPresent": true');
  });

  it('exits 1 with the admin message for an unexpected admin failure', async () => {
    const h = harness({}, { fail: (method) => (method === 'backup.list' ? new AdminCallError('unavailable', 'The backup folder could not be read.') : undefined) });
    expect(await h.run({ action: 'list', folder: FOLDER })).toBe(1);
    expect(h.f.err.join('')).toContain('The backup folder could not be read.');
  });
});

describe('backup destination add --kind s3 and probe (Milestone 848)', () => {
  const ACCESS = 'AKIAEXAMPLEKEY123456';
  const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  const S3 = { action: 'destination-add', kind: 's3', endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'my-backups', credentialsStdin: true } as const;
  const document = (extra: Record<string, unknown> = {}): string => JSON.stringify({ accessKeyId: ACCESS, secretAccessKey: SECRET, ...extra });

  it('reads the credentials document from standard input, takes the passphrase from the environment and sends credentials and passphrase only in the admin call', async () => {
    const h = harness({}, { ...withEnv, readCredentialsDocument: async () => document({ sessionToken: 'TOKEN123' }) });
    expect(await h.run({ ...S3, prefix: 'hub/one', label: 'Cloud', forcePathStyle: true, allowPrivateNetwork: true })).toBe(0);
    expect(h.backupCalls()).toEqual([{
      method: 'backup.destination.add', timeoutMs: 10 * 60 * 1000,
      params: {
        kind: 's3', endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'my-backups', prefix: 'hub/one', label: 'Cloud', forcePathStyle: true, allowPrivateNetwork: true,
        credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET, sessionToken: 'TOKEN123' }, passphrase: PASSPHRASE,
      },
    }]);
    const err = h.f.err.join('');
    expect(err).toContain('Losing the passphrase makes the backup unrecoverable.');
    expect(err).toContain('stored protected on this computer');
    expect(JSON.parse(h.f.out.join(''))).toEqual({ added: true, adopted: false, destination: { id: 'd-1', kind: 's3' } });
    for (const secret of [ACCESS, SECRET, 'TOKEN123', PASSPHRASE]) expect(h.output(), secret).not.toContain(secret);
  });

  it('omits the optional flags when they were not given and keeps virtual-hosted as an explicit false', async () => {
    const h = harness({}, { ...withEnv, readCredentialsDocument: async () => document() });
    expect(await h.run({ ...S3 })).toBe(0);
    expect(h.backupCalls()[0]!.params).toEqual({ kind: 's3', endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'my-backups', credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET }, passphrase: PASSPHRASE });
    expect(await h.run({ ...S3, forcePathStyle: false })).toBe(0);
    expect(h.backupCalls()[1]!.params).toMatchObject({ forcePathStyle: false });
  });

  it('takes the passphrase from the document (and strips it from the credentials), preferring it to the environment', async () => {
    const h = harness({}, { env: { [BACKUP_PASSPHRASE_ENV]: 'a different environment passphrase' }, readCredentialsDocument: async () => document({ passphrase: PASSPHRASE }) });
    expect(await h.run({ ...S3 })).toBe(0);
    const params = h.backupCalls()[0]!.params as { credentials: Record<string, unknown>; passphrase: string };
    expect(params.passphrase).toBe(PASSPHRASE);
    expect(params.credentials).toEqual({ accessKeyId: ACCESS, secretAccessKey: SECRET });
    expect(h.output()).not.toContain(PASSPHRASE);
  });

  it('reads a real piped stdin and then needs the passphrase from elsewhere, because stdin is used up', async () => {
    const stdin = new PassThrough();
    stdin.end(document());
    const missing = harness({}, { stdin: stdin as unknown as BackupCommandDeps['stdin'] });
    expect(await missing.run({ ...S3 })).toBe(1);
    expect(missing.f.err.join('')).toContain(BACKUP_PASSPHRASE_ENV);
    expect(missing.backupCalls()).toEqual([]);

    const piped = new PassThrough();
    piped.end(document());
    const h = harness({}, { ...withEnv, stdin: piped as unknown as BackupCommandDeps['stdin'] });
    expect(await h.run({ ...S3 })).toBe(0);
    expect(h.backupCalls()[0]!.params).toMatchObject({ credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET }, passphrase: PASSPHRASE });
    expect(h.output()).not.toContain(SECRET);
  });

  it('asks interactively only when a prompt is available and applies the passphrase rules', async () => {
    const asked: string[] = [];
    const h = harness({}, { readCredentialsDocument: async () => document(), readPassphrase: async (o) => { asked.push(o.prompt); return PASSPHRASE; } });
    expect(await h.run({ ...S3 })).toBe(0);
    expect(asked).toEqual(['Backup passphrase (min 12 characters): ']);
    const short = harness({}, { env: { [BACKUP_PASSPHRASE_ENV]: 'short' }, readCredentialsDocument: async () => document() });
    expect(await short.run({ ...S3 })).toBe(1);
    expect(short.backupCalls()).toEqual([]);
    expect(short.f.err.join('')).toMatch(/at least 12/);
  });

  it('refuses bad documents and missing flags with a usage exit and never echoes the document', async () => {
    const bad = async (read: () => Promise<string>): Promise<string> => {
      const h = harness({}, { ...withEnv, readCredentialsDocument: read });
      expect(await h.run({ ...S3 })).toBe(2);
      expect(h.backupCalls()).toEqual([]);
      expect(h.output()).not.toContain(SECRET);
      return h.f.err.join('');
    };
    expect(await bad(async () => `{ not json ${SECRET}`)).toContain('must be a JSON object');
    expect(await bad(async () => `["${SECRET}"]`)).toContain('must be a JSON object');
    expect(await bad(async () => `"${SECRET}"`)).toContain('must be a JSON object');
    expect(await bad(async () => { throw new Error('The S3 credentials document is empty.'); })).toContain('is empty');
    const flagless = harness({}, { ...withEnv, readCredentialsDocument: async () => document() });
    expect(await flagless.run({ action: 'destination-add', kind: 's3', endpoint: 'https://s3.example.com', credentialsStdin: true })).toBe(2);
    expect(await flagless.run({ action: 'destination-add', kind: 's3', endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'b' })).toBe(2);
    expect(flagless.f.err.join('')).toContain('--credentials-stdin');
    expect(flagless.backupCalls()).toEqual([]);
  });

  it('passes an admin refusal through without the secret and exits non-zero', async () => {
    const h = harness({}, { ...withEnv, readCredentialsDocument: async () => document(), fail: (m) => (m === 'backup.destination.add' ? new AdminCallError('bad-request', 'endpoint must be an https URL.') : undefined) });
    expect(await h.run({ ...S3 })).toBe(1);
    expect(h.f.err.join('')).toContain('endpoint must be an https URL.');
    expect(h.output()).not.toContain(SECRET);
  });

  it('stays elevated-only like the other destination commands', async () => {
    const h = harness({ state: 'running', elevated: false }, { ...withEnv, readCredentialsDocument: async () => document() });
    expect(await h.run({ ...S3 })).not.toBe(0);
    expect(h.backupCalls()).toEqual([]);
    const probe = harness({ state: 'running', elevated: false });
    expect(await probe.run({ action: 'destination-probe', destination: 'd-1' })).not.toBe(0);
    expect(probe.backupCalls()).toEqual([]);
  });

  it('probe prints the report and exits 0 when it is ok, 1 when a step failed, with a long timeout', async () => {
    const ok = harness();
    expect(await ok.run({ action: 'destination-probe', destination: 'd-1' })).toBe(0);
    expect(ok.backupCalls()).toEqual([{ method: 'backup.destination.probe', params: { id: 'd-1' }, timeoutMs: 10 * 60 * 1000 }]);
    expect(JSON.parse(ok.f.out.join(''))).toEqual({ id: 'd-1', kind: 's3', ok: true, conditionalWrites: 'enforced' });
    const failed = harness({}, { probe: { id: 'd-1', kind: 's3', ok: false, failedStep: 'multipart', reason: 'server', write: true } });
    expect(await failed.run({ action: 'destination-probe', destination: 'd-1' })).toBe(1);
    expect(JSON.parse(failed.f.out.join(''))).toMatchObject({ ok: false, failedStep: 'multipart', reason: 'server' });
    const refused = harness({}, { fail: (m) => (m === 'backup.destination.probe' ? new AdminCallError('not-found', 'Unknown backup destination.') : undefined) });
    expect(await refused.run({ action: 'destination-probe', destination: 'nope' })).toBe(1);
    expect(refused.f.err.join('')).toContain('Unknown backup destination.');
  });
});

describe('backup destination add --kind drive (Milestone 856)', () => {
  const SECRET = 'GOCSPX-example-client-secret-0123';
  const DRIVE = { action: 'destination-add', kind: 'drive', clientId: 'abc.apps.googleusercontent.com', credentialsStdin: true } as const;
  const document = (extra: Record<string, unknown> = {}): string => JSON.stringify({ clientSecret: SECRET, ...extra });

  it('step one only previews: the token on stdout, the summary on stderr, the secret only in the admin call, and nothing is started', async () => {
    const h = harness({}, { readCredentialsDocument: async () => document() });
    expect(await h.run({ ...DRIVE, redirectOrigin: 'https://hub.example.com', label: 'My Drive' })).toBe(0);
    expect(h.backupCalls()).toEqual([{
      method: 'backup.destination.drive.connect.preview', timeoutMs: undefined,
      params: { clientId: 'abc.apps.googleusercontent.com', clientSecret: SECRET, label: 'My Drive', redirectOrigin: 'https://hub.example.com' },
    }]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ confirmToken: 'dtok-1', expiresAt: 1_700_000_060_000 });
    const err = h.f.err.join('');
    expect(err).toContain('Google Drive connect preview (nothing has been changed)');
    expect(err).toContain('drive.file');
    expect(err).toContain('consequence: secret-management, remote-write');
    expect(err).toMatch(/--confirm <confirmToken> within 60 seconds/);
    expect(h.output()).not.toContain(SECRET);
  });

  it('step two spends the token, prints the consent URL, waits for the approval, then adds the destination with the passphrase', async () => {
    const h = harness({}, { ...withEnv, readCredentialsDocument: async () => document(), driveStatuses: [{ state: 'waiting' }, { state: 'waiting' }, { state: 'authorized' }] });
    expect(await h.run({ ...DRIVE, confirm: 'dtok-1', label: 'My Drive' })).toBe(0);
    expect(h.backupCalls().map((c) => c.method)).toEqual([
      'backup.destination.drive.connect.apply', 'backup.destination.drive.connect.status', 'backup.destination.drive.connect.status', 'backup.destination.drive.connect.status', 'backup.destination.drive.connect.complete',
    ]);
    expect(h.backupCalls()[0]!.params).toEqual({ clientId: 'abc.apps.googleusercontent.com', clientSecret: SECRET, label: 'My Drive', confirmToken: 'dtok-1' });
    expect(h.backupCalls()[1]!.params).toEqual({ pendingId: 'p'.repeat(32) });
    expect(h.backupCalls()[4]).toEqual({ method: 'backup.destination.drive.connect.complete', params: { pendingId: 'p'.repeat(32), passphrase: PASSPHRASE }, timeoutMs: 10 * 60 * 1000 });
    const err = h.f.err.join('');
    expect(err).toContain('https://accounts.google.com/o/oauth2/v2/auth?state=STATE123');
    expect(err).toContain('the drive.file scope only');
    expect(err).toContain('Losing the passphrase makes the backup unrecoverable.');
    expect(JSON.parse(h.f.out.join(''))).toEqual({ added: true, adopted: false, destination: { id: 'd-1', kind: 'drive' } });
    for (const secret of [SECRET, PASSPHRASE]) expect(h.output(), secret).not.toContain(secret);
  });

  it('takes the passphrase from the document, refuses a short one before starting anything, and needs none to reconnect', async () => {
    const fromDocument = harness({}, { readCredentialsDocument: async () => document({ passphrase: PASSPHRASE }) });
    expect(await fromDocument.run({ ...DRIVE, confirm: 't' })).toBe(0);
    expect(fromDocument.backupCalls().at(-1)!.params).toEqual({ pendingId: 'p'.repeat(32), passphrase: PASSPHRASE });
    const short = harness({}, { readCredentialsDocument: async () => document({ passphrase: 'short' }) });
    expect(await short.run({ ...DRIVE, confirm: 't' })).toBe(1);
    expect(short.backupCalls()).toEqual([]);
    const missing = harness({}, { readCredentialsDocument: async () => document() });
    expect(await missing.run({ ...DRIVE, confirm: 't' })).toBe(1);
    expect(missing.backupCalls()).toEqual([]);
    const reconnect = harness({}, { readCredentialsDocument: async () => document() });
    expect(await reconnect.run({ ...DRIVE, confirm: 't', reconnect: 'd-1a2b3c4d' })).toBe(0);
    expect(reconnect.backupCalls()[0]!.params).toMatchObject({ id: 'd-1a2b3c4d' });
    expect(reconnect.backupCalls().at(-1)!.params).toEqual({ pendingId: 'p'.repeat(32) });
  });

  it('exits non-zero without adding anything when the owner declined, the authorization failed or expired, or approval never came', async () => {
    for (const statuses of [[{ state: 'failed', reason: 'declined' }], [{ state: 'expired' }], [{ state: 'unknown' }]]) {
      const h = harness({}, { ...withEnv, readCredentialsDocument: async () => document(), driveStatuses: statuses });
      expect(await h.run({ ...DRIVE, confirm: 't' })).toBe(1);
      expect(h.backupCalls().some((c) => c.method === 'backup.destination.drive.connect.complete')).toBe(false);
    }
    const declined = harness({}, { ...withEnv, readCredentialsDocument: async () => document(), driveStatuses: [{ state: 'failed', reason: 'declined' }] });
    await declined.run({ ...DRIVE, confirm: 't' });
    expect(declined.f.err.join('')).toContain('(declined)');
    const never = harness({}, { ...withEnv, readCredentialsDocument: async () => document(), driveStatuses: [{ state: 'waiting' }], driveExpiresAt: new Date(3_000).toISOString() });
    expect(await never.run({ ...DRIVE, confirm: 't' })).toBe(1);
    expect(never.f.err.join('')).toContain('expired before it was approved');
  });

  it('is a usage error without the client id, the standard-input switch or a client secret in the document', async () => {
    const h = harness({}, { readCredentialsDocument: async () => document() });
    expect(await h.run({ action: 'destination-add', kind: 'drive', credentialsStdin: true })).toBe(2);
    expect(await h.run({ action: 'destination-add', kind: 'drive', clientId: 'abc' })).toBe(2);
    const noSecret = harness({}, { readCredentialsDocument: async () => JSON.stringify({ passphrase: PASSPHRASE }) });
    expect(await noSecret.run({ ...DRIVE })).toBe(2);
    const notJson = harness({}, { readCredentialsDocument: async () => 'not json' });
    expect(await notJson.run({ ...DRIVE })).toBe(2);
    expect(h.backupCalls()).toEqual([]);
  });

  it('reports a spent or expired confirmation with the command to run again', async () => {
    const h = harness({}, { ...withEnv, readCredentialsDocument: async () => document(), fail: (m) => (m === 'backup.destination.drive.connect.apply' ? new AdminCallError('confirmation-required', 'x') : undefined) });
    expect(await h.run({ ...DRIVE, confirm: 'old' })).toBe(1);
    expect(h.f.err.join('')).toContain('backup destination add --kind drive');
  });
});
