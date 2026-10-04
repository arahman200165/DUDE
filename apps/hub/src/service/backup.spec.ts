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
function harness(initial: Parameters<typeof fixture>[0] = {}, extra: Partial<BackupCommandDeps> & { fail?: (method: string) => Error | undefined; env?: Record<string, string | undefined> } = {}) {
  const f = fixture(initial);
  const calls: Call[] = [];
  const { fail, env, ...rest } = extra;
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

  it('sets a schedule with the passphrase, a long timeout and an explanation of the stored key', async () => {
    const asked: { prompt: string; confirm: boolean }[] = [];
    const h = harness({}, { readPassphrase: async (o) => { asked.push(o); return PASSPHRASE; } });
    expect(await h.run({ action: 'schedule-set', folder: FOLDER, everyHours: 24, keep: 7 })).toBe(0);
    expect(asked).toEqual([{ prompt: 'Backup passphrase (min 12 characters): ', confirm: true }]);
    expect(h.backupCalls()).toEqual([{ method: 'backup.schedule.set', params: { folder: FOLDER, intervalHours: 24, retention: 7, passphrase: PASSPHRASE }, timeoutMs: 10 * 60 * 1000 }]);
    const err = h.f.err.join('');
    expect(err).toContain('Losing the passphrase makes the backup unrecoverable.');
    expect(err).toContain('The passphrase itself is not stored.');
    expect(h.output()).not.toContain(PASSPHRASE);
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
