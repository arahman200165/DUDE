import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../server/test-helpers.js';
import { parseArgs } from './args.js';
import { NONCE_PATTERN, PROFILE_LIST_KEY, SID_PATTERN, expandEnv, profileKeyFor, runSetupToken } from './setup-token.js';
import type { ExecFn } from './setup-token.js';

const SID = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
const NONCE = 'abcdEFGH1234_-xyz';
const PAYLOAD = { token: 'T'.repeat(43), spkiSha256: 'S'.repeat(43), port: 47600, hubInstanceId: 'hub-1' };

function harness(options: { failIcacls?: boolean } = {}) {
  const root = tempDir('hub-handoff-');
  const calls: { file: string; args: readonly string[] }[] = [];
  const out: string[] = [];
  const errs: string[] = [];
  const exec: ExecFn = async (file, args) => {
    calls.push({ file, args });
    if (file === 'reg.exe') {
      return { stdout: `\r\n${args[1]}\r\n    ProfileImagePath    REG_EXPAND_SZ    %TESTROOT%\\Users\\ada\r\n\r\n` };
    }
    if (options.failIcacls) throw new Error('icacls failed');
    return { stdout: '' };
  };
  const deps = {
    exec, platform: 'win32' as const, env: { TESTROOT: root }, now: () => 5000,
    stdout: (t: string) => { out.push(t); }, stderr: (t: string) => { errs.push(t); },
    call: async () => PAYLOAD,
  };
  const dir = path.join(root, 'Users', 'ada', 'AppData', 'Local', 'DUDE');
  return { root, calls, out, errs, deps, dir };
}

describe('registry key', () => {
  it('splits into the expected segments (backslashes are not collapsed)', () => {
    const segments = profileKeyFor(SID).split('\\');
    expect(segments).toEqual(['HKLM', 'SOFTWARE', 'Microsoft', 'Windows NT', 'CurrentVersion', 'ProfileList', SID]);
    expect(PROFILE_LIST_KEY.split('\\')).toHaveLength(6);
  });

  it('expands environment variables case-insensitively', () => {
    expect(expandEnv('%SystemDrive%\\Users\\x', { SYSTEMDRIVE: 'C:' })).toBe('C:\\Users\\x');
  });
});

describe('validation patterns and parsing', () => {
  it('accepts domain/local and AAD SIDs only', () => {
    expect(SID_PATTERN.test(SID)).toBe(true);
    expect(SID_PATTERN.test('S-1-12-1-1-2-3-4')).toBe(true);
    for (const bad of ['S-1-5-18', 'S-1-5-21', 'S-1-5-21-1 /grant', 'S-1-5-21-1-*', 'x S-1-5-21-1-2', 'S-1-5-21-1\n']) expect(SID_PATTERN.test(bad)).toBe(false);
    expect(NONCE_PATTERN.test(NONCE)).toBe(true);
    expect(NONCE_PATTERN.test('short')).toBe(false);
    expect(NONCE_PATTERN.test('a'.repeat(16) + '/..')).toBe(false);
  });

  it('parses the command', () => {
    expect(parseArgs(['setup-token'])).toEqual({ command: 'setup-token' });
    expect(parseArgs(['setup-token', '--data-dir', 'x', '--deliver-to', SID, '--nonce=' + NONCE])).toEqual({
      command: 'setup-token', dataDir: 'x', deliverTo: SID, nonce: NONCE,
    });
    expect(() => parseArgs(['setup-token', '--bogus'])).toThrow();
    expect(() => parseArgs(['setup-token', '--nonce'])).toThrow();
  });
});

describe('dude-hub setup-token', () => {
  it('prints the token JSON without a hand-off', async () => {
    const h = harness();
    expect(await runSetupToken({ dataDir: h.root }, h.deps)).toBe(0);
    expect(JSON.parse(h.out.join(''))).toEqual({ token: PAYLOAD.token, spkiSha256: PAYLOAD.spkiSha256, port: 47600 });
    expect(h.calls).toHaveLength(0);
  });

  it('delivers the hand-off file with the expected reg and icacls invocations', async () => {
    const h = harness();
    expect(await runSetupToken({ dataDir: h.root, deliverTo: SID, nonce: NONCE }, h.deps)).toBe(0);
    const file = path.join(h.dir, `hub-handoff-${NONCE}.json`);
    expect(h.calls[0]).toEqual({ file: 'reg.exe', args: ['query', `HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\${SID}`, '/v', 'ProfileImagePath'] });
    expect(h.calls[1]).toEqual({ file: 'icacls', args: [file, '/inheritance:r', '/grant:r', `*${SID}:(R,D)`, '*S-1-5-18:(F)'] });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ v: 1, ...PAYLOAD, createdAt: new Date(5000).toISOString() });
    expect(readdirSync(h.dir)).toEqual([`hub-handoff-${NONCE}.json`]); // no temp left behind
    expect(h.out.join('')).not.toContain(PAYLOAD.token);
  });

  it('removes the file and exits non-zero when icacls fails, never printing the token', async () => {
    const h = harness({ failIcacls: true });
    expect(await runSetupToken({ dataDir: h.root, deliverTo: SID, nonce: NONCE }, h.deps)).toBe(1);
    expect(existsSync(path.join(h.dir, `hub-handoff-${NONCE}.json`))).toBe(false);
    expect(readdirSync(h.dir)).toEqual([]);
    expect(h.errs.join('') + h.out.join('')).not.toContain(PAYLOAD.token);
  });

  it('rejects bad SIDs and nonces before touching anything, and non-Windows hosts', async () => {
    const h = harness();
    expect(await runSetupToken({ dataDir: h.root, deliverTo: 'S-1-5-18', nonce: NONCE }, h.deps)).toBe(2);
    expect(await runSetupToken({ dataDir: h.root, deliverTo: SID, nonce: 'bad' }, h.deps)).toBe(2);
    expect(await runSetupToken({ dataDir: h.root, deliverTo: SID }, h.deps)).toBe(2);
    expect(await runSetupToken({ dataDir: h.root, deliverTo: SID, nonce: NONCE }, { ...h.deps, platform: 'linux' })).toBe(2);
    expect(h.calls).toHaveLength(0);
  });
});
