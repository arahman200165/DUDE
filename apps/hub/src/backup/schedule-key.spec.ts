import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DerivedBackupKey } from '@dude/hub-backup';
import type { CaKeyProtector } from '../tls/ca-key-protector.js';
import { tempRoot } from './backup-fixture.js';
import { BACKUP_SCHEDULE_DPAPI_ENTROPY, clearScheduleKey, defaultScheduleKeyProtector, loadScheduleKey, saveScheduleKey, scheduleKeyExists } from './schedule-key.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Reversible fake: XOR with a constant, so a plaintext payload is never what lands on disk. */
const fakeProtector: CaKeyProtector = {
  kind: 'dpapi',
  keyFile: 'schedule-key.bin',
  protect: (plain) => Buffer.from(plain.map((b) => b ^ 0x5a)),
  unprotect: (blob) => Buffer.from(blob.map((b) => b ^ 0x5a)),
};

const derived = (): DerivedBackupKey => ({
  key: new Uint8Array(32).map((_, i) => i + 1),
  salt: new Uint8Array(16).map((_, i) => 200 - i),
  params: { m: 8192, t: 1, p: 1, len: 32 },
});

describe('schedule key', () => {
  it('round-trips through the protector and never stores the key in plaintext', () => {
    const dir = tempRoot('sched');
    roots.push(dir);
    expect(loadScheduleKey(dir, fakeProtector)).toBeNull();
    expect(scheduleKeyExists(dir)).toBe(false);
    const input = derived();
    saveScheduleKey(dir, input, fakeProtector);
    const file = path.join(dir, 'backup', 'schedule-key.bin');
    expect(scheduleKeyExists(dir)).toBe(true);
    const onDisk = readFileSync(file);
    expect(onDisk.toString('utf8')).not.toContain('"v":1');
    expect(onDisk.includes(Buffer.from(input.key.toString()))).toBe(false);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    const loaded = loadScheduleKey(dir, fakeProtector);
    expect(loaded).toEqual(input);
    expect(loaded?.key).toBeInstanceOf(Uint8Array);
  });

  it('replaces an existing key and clear removes it', () => {
    const dir = tempRoot('sched');
    roots.push(dir);
    saveScheduleKey(dir, derived(), fakeProtector);
    const next = { ...derived(), salt: new Uint8Array(16).fill(7) };
    saveScheduleKey(dir, next, fakeProtector);
    expect(loadScheduleKey(dir, fakeProtector)?.salt).toEqual(next.salt);
    clearScheduleKey(dir);
    expect(loadScheduleKey(dir, fakeProtector)).toBeNull();
    clearScheduleKey(dir);
  });

  it('throws a clear error for a corrupt or foreign file', () => {
    const dir = tempRoot('sched');
    roots.push(dir);
    mkdirSync(path.join(dir, 'backup'), { recursive: true });
    const file = path.join(dir, 'backup', 'schedule-key.bin');
    writeFileSync(file, 'garbage');
    expect(() => loadScheduleKey(dir, fakeProtector)).toThrow(/unreadable or corrupt/);
    writeFileSync(file, fakeProtector.protect(Buffer.from('{"v":2,"key":"x"}')));
    expect(() => loadScheduleKey(dir, fakeProtector)).toThrow(/unreadable or corrupt/);
    writeFileSync(file, fakeProtector.protect(Buffer.from(JSON.stringify({ v: 1, key: 'AAAA', salt: 'AAAA', params: { m: 8192, t: 1, p: 1, len: 32 } }))));
    expect(() => loadScheduleKey(dir, fakeProtector)).toThrow(/unreadable or corrupt/);
  });

  it('uses its own DPAPI entropy and file name', () => {
    const scripts: string[] = [];
    const dpapi = defaultScheduleKeyProtector('win32', (_file, args, input) => {
      scripts.push(args.join(' '));
      return input;
    });
    expect(dpapi.kind).toBe('dpapi');
    expect(dpapi.keyFile).toBe('schedule-key.bin');
    expect(dpapi.protect(Buffer.from('x')).toString()).toBe('x');
    expect(scripts[0]).toContain(`GetBytes('${BACKUP_SCHEDULE_DPAPI_ENTROPY}')`);
    expect(scripts[0]).toContain('Protect(');
    expect(scripts[0]).toContain('LocalMachine');
    expect(BACKUP_SCHEDULE_DPAPI_ENTROPY).not.toBe('DUDE Hub CA v1');
    expect(BACKUP_SCHEDULE_DPAPI_ENTROPY).not.toBe('DUDE Hub ACME v1');
    const file = defaultScheduleKeyProtector('linux');
    expect(file.kind).toBe('file');
    expect(file.protect(Buffer.from('x')).toString()).toBe('x');
  });
});
