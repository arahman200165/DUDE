import { describe, expect, it } from 'vitest';
import { detectLockfileFormat, parseLockfile, parseLockfileAs } from "./lockfile-inspector-parse.js";

describe('detectLockfileFormat', () => {
  it('detects by filename first', () => {
    expect(detectLockfileFormat('package-lock.json', '{}')).toBe('npm');
    expect(detectLockfileFormat('pnpm-lock.yaml', 'lockfileVersion: 5.4')).toBe('pnpm');
    expect(detectLockfileFormat('yarn.lock', '# yarn lockfile v1\n\nlodash@^4.0.0:\n  version "4.0.0"')).toBe('yarn-classic');
  });

  it('falls back to content sniffing for an unnamed upload', () => {
    expect(detectLockfileFormat('upload.txt', '{"lockfileVersion": 3}')).toBe('npm');
    expect(detectLockfileFormat('upload.txt', '__metadata:\n  version: 6')).toBe('yarn-berry');
    expect(detectLockfileFormat('upload.txt', 'lockfileVersion: 5.4\npackages:')).toBe('pnpm');
  });

  it('returns unknown for unrecognizable content', () => {
    expect(detectLockfileFormat('upload.txt', 'just some random text')).toBe('unknown');
  });
});

describe('parseLockfile', () => {
  it('parses a detected npm lockfile end to end', () => {
    const content = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/lodash': { version: '4.17.21' } } });
    const result = parseLockfile('package-lock.json', content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.format).toBe('npm');
      expect(result.packages).toHaveLength(1);
    }
  });

  it('reports an error for unrecognizable content', () => {
    const result = parseLockfile('mystery.txt', 'not a lockfile');
    expect(result.ok).toBe(false);
  });

  it('reports a parse error rather than throwing on malformed JSON claiming to be npm', () => {
    const result = parseLockfile('package-lock.json', '{not valid json');
    expect(result.ok).toBe(false);
  });
});

describe('parseLockfileAs', () => {
  it('parses pasted content with an explicitly chosen format, ignoring filename sniffing entirely', () => {
    const content = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/lodash': { version: '4.17.21' } } });
    const result = parseLockfileAs('npm', content);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.packages).toHaveLength(1);
  });
});
