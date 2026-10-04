import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupError } from '@dude/hub-backup';
import type { BackupErrorCode } from '@dude/hub-backup';
import { RESTORE_CONSEQUENCE_CLASS, RESTORE_PHRASE_OLD_HUB_GONE, RESTORE_PHRASE_REPLACE, RestoreError } from '../backup/restore.js';
import type { ApplyRestoreOptions, PreviewRestoreOptions, RestoreErrorCode, RestorePreview, RestoreResult, RestoreSummary } from '../backup/restore.js';
import { BACKUP_PASSPHRASE_ENV } from '../cli/passphrase.js';
import { runRestore } from './restore.js';
import type { RestoreCommandDeps, RestoreCommandOptions } from './restore.js';
import { fixture } from './test-helpers.js';

const PASSPHRASE = 'correct horse battery staple';
const FILE = path.resolve(path.parse(process.cwd()).root, 'dude-backups', 'dude-hub-20260101T000000Z.dudebackup');
const TOKEN = 'restore-token-abc123';

function summaryOf(over: Partial<RestoreSummary> = {}): RestoreSummary {
  return {
    source: { hubInstanceId: 'old-hub-1', authorityEpoch: 4, schemaVersion: 8, hubVersion: '1.2.3', createdAt: '2026-01-01T00:00:00.000Z' },
    newEpoch: 5,
    forTransfer: false,
    counts: { devices: 2, audit_events: 31 },
    targetState: 'empty',
    requiresOldHubGonePhrase: true,
    requiresReplacePhrase: false,
    consequenceClass: RESTORE_CONSEQUENCE_CLASS,
    ...over,
  };
}

interface Harness {
  f: ReturnType<typeof fixture>;
  run: (options?: Partial<RestoreCommandOptions>) => Promise<number>;
  previews: PreviewRestoreOptions[];
  applies: ApplyRestoreOptions[];
  asked: () => number;
  running: string[];
  err: () => string;
  all: () => string;
}

function harness(
  initial: Parameters<typeof fixture>[0] = {},
  extra: Partial<RestoreCommandDeps> & { summary?: RestoreSummary; applyError?: Error; previewError?: Error; hubRunning?: boolean } = {},
): Harness {
  const f = fixture(initial);
  const previews: PreviewRestoreOptions[] = [];
  const applies: ApplyRestoreOptions[] = [];
  const running: string[] = [];
  let asked = 0;
  const { summary, applyError, previewError, hubRunning, ...rest } = extra;
  const deps: RestoreCommandDeps = {
    ...f.deps,
    readPassphrase: async () => { asked++; return PASSPHRASE; },
    isRunning: async (root) => { running.push(root); return hubRunning ?? false; },
    backupDeps: { deriveKey: async () => new Uint8Array(32), randomBytes: (n) => new Uint8Array(n), now: () => new Date(0) },
    previewRestore: async (options): Promise<RestorePreview> => {
      previews.push(options);
      if (previewError) throw previewError;
      return { confirmToken: TOKEN, expiresAt: '2026-01-01T00:01:00.000Z', summary: summary ?? summaryOf() };
    },
    applyRestore: async (options): Promise<RestoreResult> => {
      applies.push(options);
      if (applyError) throw applyError;
      return { hubInstanceId: 'new-hub-2', authorityEpoch: 5, devices: 2, replacedDir: null };
    },
    ...rest,
  };
  const run = (options: Partial<RestoreCommandOptions> = {}): Promise<number> => runRestore({ file: FILE, dataDir: f.dataDir, ...options }, deps);
  return {
    f, run, previews, applies, running, asked: () => asked,
    err: () => f.err.join(''),
    all: () => `${f.out.join('')}\n${f.err.join('')}`,
  };
}

describe('backup restore: preview', () => {
  it('prints the summary and sentences on stderr and only the token JSON on stdout, without changing anything', async () => {
    const h = harness();
    expect(await h.run()).toBe(0);
    expect(h.previews).toHaveLength(1);
    expect(h.previews[0]).toMatchObject({ file: FILE, dataRoot: h.f.dataDir, passphrase: PASSPHRASE });
    expect(h.applies).toEqual([]);
    expect(JSON.parse(h.f.out.join(''))).toEqual({ confirmToken: TOKEN, expiresAt: '2026-01-01T00:01:00.000Z' });
    const err = h.err();
    expect(err).toContain('nothing has been changed');
    expect(err).toContain('old-hub-1');
    expect(err).toContain('authority epoch 4');
    expect(err).toContain('New epoch:  5');
    expect(err).toContain('2026-01-01T00:00:00.000Z');
    expect(err).toContain('devices 2, audit_events 31');
    expect(err).toContain('not made for transfer');
    expect(err).toContain('empty');
    expect(err).toContain('Every device must be paired again; their local data is kept.');
    expect(err).toContain('A new TLS identity will be issued; public/Internet exposure is turned off until you re-enable it.');
    expect(err).toMatch(/--confirm <confirmToken> within 60 seconds/);
    expect(err).not.toContain(TOKEN);
    expect(h.all()).not.toContain(PASSPHRASE);
  });

  it('asks for the passphrase once, without a confirmation entry', async () => {
    const asked: { prompt: string; confirm: boolean }[] = [];
    const h = harness({}, { readPassphrase: async (o) => { asked.push(o); return PASSPHRASE; } });
    await h.run();
    expect(asked).toEqual([{ prompt: 'Backup passphrase: ', confirm: false }]);
  });

  it('reads the passphrase from the environment when no prompt source is injected', async () => {
    const f = fixture();
    const previews: PreviewRestoreOptions[] = [];
    const deps: RestoreCommandDeps = {
      ...f.deps,
      env: { ...f.deps.env, [BACKUP_PASSPHRASE_ENV]: PASSPHRASE },
      isRunning: async () => false,
      previewRestore: async (options) => { previews.push(options); return { confirmToken: TOKEN, expiresAt: 'x', summary: summaryOf() }; },
    };
    expect(await runRestore({ file: FILE, dataDir: f.dataDir }, deps)).toBe(0);
    expect(previews[0]!.passphrase).toBe(PASSPHRASE);
    expect(`${f.out.join('')}${f.err.join('')}`).not.toContain(PASSPHRASE);
  });

  it('lists the phrases only when the summary requires them', async () => {
    const both = harness({}, { summary: summaryOf({ requiresOldHubGonePhrase: true, requiresReplacePhrase: true, targetState: 'existing' }) });
    await both.run();
    expect(both.err()).toContain('This backup was not made with --for-transfer. If the old Hub is still running, two Hubs would exist. Pass --old-hub-gone "THE OLD HUB IS GONE" to confirm it is gone.');
    expect(both.err()).toContain('This data directory already contains a Hub. Existing data will be moved to backups/replaced-<stamp>. Pass --replace "REPLACE HUB DATA".');
    expect(both.err()).toContain('already contains a Hub)');

    const neither = harness({}, { summary: summaryOf({ forTransfer: true, requiresOldHubGonePhrase: false, requiresReplacePhrase: false }) });
    await neither.run();
    expect(neither.err()).toContain('made for transfer');
    expect(neither.err()).not.toContain('--old-hub-gone');
    expect(neither.err()).not.toContain('--replace');
  });
});

describe('backup restore: apply', () => {
  it('applies with the exact phrases, then prints the result and the next steps', async () => {
    const h = harness();
    expect(await h.run({ confirm: TOKEN, replace: RESTORE_PHRASE_REPLACE, oldHubGone: RESTORE_PHRASE_OLD_HUB_GONE })).toBe(0);
    expect(h.previews).toEqual([]);
    expect(h.applies).toHaveLength(1);
    expect(h.applies[0]).toMatchObject({ file: FILE, dataRoot: h.f.dataDir, confirmToken: TOKEN, passphrase: PASSPHRASE, replaceExisting: true, oldHubGoneConfirmed: true });
    expect(JSON.parse(h.f.out.join(''))).toEqual({ hubInstanceId: 'new-hub-2', authorityEpoch: 5, devices: 2, replacedDir: null });
    const err = h.err();
    expect(err).toContain('Start the Hub');
    expect(err).toContain('old owner password');
    expect(err).toMatch(/Pair each device again/);
    expect(h.all()).not.toContain(PASSPHRASE);
  });

  it('does not claim a phrase the operator did not type', async () => {
    const h = harness();
    expect(await h.run({ confirm: TOKEN })).toBe(0);
    expect(h.applies[0]).toMatchObject({ replaceExisting: false, oldHubGoneConfirmed: false });
  });

  it('names the replaced directory in the next steps', async () => {
    const replaced = path.join(path.parse(process.cwd()).root, 'hub', 'backups', 'replaced-20260101T000000Z');
    const h = harness({}, { applyRestore: async () => ({ hubInstanceId: 'n', authorityEpoch: 6, devices: 1, replacedDir: replaced }) });
    expect(await h.run({ confirm: TOKEN, replace: RESTORE_PHRASE_REPLACE })).toBe(0);
    expect(h.err()).toContain(replaced);
    expect(JSON.parse(h.f.out.join('')).replacedDir).toBe(replaced);
  });

  it('rejects near-miss phrases before reading the passphrase or touching anything', async () => {
    const wrong = ['replace hub data', 'REPLACE HUB DATA ', ' REPLACE HUB DATA', 'REPLACE HUB DATA.', 'REPLACE  HUB DATA', ''];
    for (const phrase of wrong) {
      const h = harness();
      expect(await h.run({ confirm: TOKEN, replace: phrase })).toBe(1);
      expect(h.err()).toContain('--replace phrase must be exactly "REPLACE HUB DATA" (case-sensitive)');
      expect(h.asked()).toBe(0);
      expect(h.applies).toEqual([]);
    }
    for (const phrase of ['the old hub is gone', 'THE OLD HUB IS GONE ', 'The Old Hub Is Gone', 'THE OLD HUB IS GONE!']) {
      const h = harness();
      expect(await h.run({ confirm: TOKEN, oldHubGone: phrase })).toBe(1);
      expect(h.err()).toContain('--old-hub-gone phrase must be exactly "THE OLD HUB IS GONE" (case-sensitive)');
      expect(h.asked()).toBe(0);
      expect(h.applies).toEqual([]);
    }
    // The preview step refuses them too: a typed phrase is never silently ignored.
    const preview = harness();
    expect(await preview.run({ replace: 'replace hub data' })).toBe(1);
    expect(preview.previews).toEqual([]);
  });

  it('turns the library refusals for a missing phrase into a retry hint that says the token was kept', async () => {
    const replace = harness({}, { applyError: new RestoreError('target-not-empty', 'internal') });
    expect(await replace.run({ confirm: TOKEN })).toBe(1);
    expect(replace.err()).toContain('--replace "REPLACE HUB DATA"');
    expect(replace.err()).toContain('backups/replaced-<stamp>');
    expect(replace.err()).toContain('token was not used up');
    const gone = harness({}, { applyError: new RestoreError('old-hub-gone-required', 'internal') });
    expect(await gone.run({ confirm: TOKEN })).toBe(1);
    expect(gone.err()).toContain('--old-hub-gone "THE OLD HUB IS GONE"');
    expect(gone.err()).toContain('If the old Hub is still running, two Hubs would exist');
    expect(gone.err()).toContain('token was not used up');
  });
});

describe('backup restore: offline and elevation guards', () => {
  it('refuses with exit 2 while a Hub is running on the data directory, before reading the passphrase', async () => {
    for (const options of [{}, { confirm: TOKEN }]) {
      const h = harness({}, { hubRunning: true });
      expect(await h.run(options)).toBe(2);
      expect(h.running).toEqual([h.f.dataDir]);
      expect(h.asked()).toBe(0);
      expect(h.previews).toEqual([]);
      expect(h.applies).toEqual([]);
      expect(h.err()).toMatch(/Hub is running.*Stop it first.*offline command/s);
    }
  });

  it('refuses without elevation when the service is installed and leaves everything alone', async () => {
    for (const options of [{}, { confirm: TOKEN, replace: RESTORE_PHRASE_REPLACE }]) {
      const h = harness({ state: 'stopped', elevated: false });
      expect(await h.run(options)).toBe(2);
      expect(h.err()).toMatch(/elevated \(Administrator\) terminal/);
      expect(h.running).toEqual([]);
      expect(h.asked()).toBe(0);
      expect(h.previews).toEqual([]);
      expect(h.applies).toEqual([]);
      expect(h.all()).not.toContain(PASSPHRASE);
    }
  });

  it('proceeds elevated with a stopped service, and without elevation when no service is installed', async () => {
    expect(await harness({ state: 'stopped', elevated: true }).run()).toBe(0);
    expect(await harness({ state: 'not-installed', elevated: false }).run()).toBe(0);
  });

  it('resolves the data root from --data-dir, falling back to DUDE_HUB_DATA_DIR', async () => {
    const f = fixture();
    const roots: string[] = [];
    const deps: RestoreCommandDeps = {
      ...f.deps, env: { ...f.deps.env, DUDE_HUB_DATA_DIR: f.dataDir }, readPassphrase: async () => PASSPHRASE,
      isRunning: async (root) => { roots.push(root); return false; },
      previewRestore: async () => ({ confirmToken: TOKEN, expiresAt: 'x', summary: summaryOf() }),
    };
    await runRestore({ file: FILE }, deps);
    expect(roots).toEqual([path.resolve(f.dataDir)]);
  });
});

describe('backup restore: error mapping', () => {
  const restoreCodes: [RestoreErrorCode, RegExp][] = [
    ['backup-too-new', /newer DUDE Hub/],
    ['confirmation-required', /without --confirm to get a new token/],
    ['conflict', /changed since the preview/],
    ['invalid-backup', /cannot be restored: .*not a SQLite/],
    ['integrity-failed', /integrity check.*left in place/],
    ['target-not-empty', /--replace "REPLACE HUB DATA"/],
    ['old-hub-gone-required', /--old-hub-gone "THE OLD HUB IS GONE"/],
  ];
  const messages: Record<RestoreErrorCode, string> = {
    'backup-too-new': 'This backup was made by a newer DUDE Hub; update this Hub before restoring it.',
    'confirmation-required': 'The confirmation token expired. Run the preview again; nothing was changed.',
    conflict: 'The backup file or the target changed since the preview. Run the preview again; nothing was changed.',
    'invalid-backup': 'The database in the backup is not a SQLite database.',
    'integrity-failed': 'The restored database failed its integrity check.',
    'target-not-empty': 'x',
    'old-hub-gone-required': 'x',
  };

  it('maps every restore refusal to a clear message and exit 1, in both steps', async () => {
    for (const [code, message] of restoreCodes) {
      const applying = harness({}, { applyError: new RestoreError(code, messages[code]) });
      expect(await applying.run({ confirm: TOKEN })).toBe(1);
      expect(applying.err()).toMatch(message);
      expect(applying.all()).not.toContain(PASSPHRASE);
      const previewing = harness({}, { previewError: new RestoreError(code, messages[code]) });
      expect(await previewing.run()).toBe(1);
      expect(previewing.err()).toMatch(message);
      expect(previewing.f.out).toEqual([]);
    }
  });

  it('maps backup-library failures to clear messages that never echo the passphrase', async () => {
    const cases: [BackupErrorCode, RegExp][] = [
      ['wrong-passphrase-or-corrupt', /passphrase is wrong or the file is damaged/],
      ['bad-magic', /not a DUDE Hub backup file/],
      ['bad-header', /not a DUDE Hub backup file/],
      ['unsupported-version', /newer DUDE Hub/],
      ['truncated', /damaged or incomplete/],
      ['integrity', /damaged or incomplete/],
      ['too-large', /could not be read \(too-large\)/],
      ['bad-input', /could not be read \(bad-input\)/],
    ];
    for (const [code, message] of cases) {
      const h = harness({}, { previewError: new BackupError(code, `internal ${PASSPHRASE}`) });
      expect(await h.run()).toBe(1);
      expect(h.err()).toMatch(message);
      expect(h.err()).toContain('Nothing was changed');
      expect(h.all()).not.toContain(PASSPHRASE);
    }
  });

  it('reports an unexpected failure with exit 1 and a pointer to the data directory', async () => {
    const h = harness({}, { applyError: new Error('EPERM: operation not permitted') });
    expect(await h.run({ confirm: TOKEN })).toBe(1);
    expect(h.err()).toContain('EPERM: operation not permitted');
    expect(h.err()).toContain('Check the data directory');
  });

  it('reports an unreadable passphrase as a failure without calling the library', async () => {
    const h = harness({}, { readPassphrase: async () => { throw new Error('The passphrase is empty.'); } });
    expect(await h.run()).toBe(1);
    expect(h.err()).toContain('The passphrase is empty.');
    expect(h.previews).toEqual([]);
  });
});
