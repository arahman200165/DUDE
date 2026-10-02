import { beforeEach, describe, expect, it } from 'vitest';
import { readStorageValue, writeStorageValue } from './workspace-storage-bridge';

describe('workspace-storage-bridge', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('round-trips a session-policy value through sessionStorage', () => {
    writeStorageValue('fake-tool', 'input', 'session', 'hello');
    expect(readStorageValue<string>('fake-tool', 'input', 'session')).toBe('hello');
    expect(sessionStorage.getItem('dude:v1:fake-tool:input')).toBe('"hello"');
    expect(localStorage.getItem('dude:v1:fake-tool:input')).toBeNull();
  });

  it('round-trips a local-policy value through localStorage', () => {
    writeStorageValue('fake-tool', 'mode', 'local', 'encode');
    expect(readStorageValue<string>('fake-tool', 'mode', 'local')).toBe('encode');
    expect(localStorage.getItem('dude:v1:fake-tool:mode')).toBe('"encode"');
  });

  it('treats an unconsented user-choice value as session-scoped', () => {
    writeStorageValue('fake-tool', 'code', 'user-choice', 'print(1)');
    expect(sessionStorage.getItem('dude:v1:fake-tool:code')).toBe('"print(1)"');
    expect(localStorage.getItem('dude:v1:fake-tool:code')).toBeNull();
  });

  it('treats a consented user-choice value as local-scoped', () => {
    localStorage.setItem('dude:v1:__consent__:fake-tool:code', 'true');
    writeStorageValue('fake-tool', 'code', 'user-choice', 'print(1)');
    expect(localStorage.getItem('dude:v1:fake-tool:code')).toBe('"print(1)"');
    expect(readStorageValue<string>('fake-tool', 'code', 'user-choice')).toBe('print(1)');
  });

  it('returns undefined for a missing key', () => {
    expect(readStorageValue('fake-tool', 'missing', 'session')).toBeUndefined();
  });

  it('returns undefined for corrupt stored JSON rather than throwing', () => {
    sessionStorage.setItem('dude:v1:fake-tool:input', 'not json{');
    expect(readStorageValue('fake-tool', 'input', 'session')).toBeUndefined();
  });
});
