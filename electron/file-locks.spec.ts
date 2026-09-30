import { describe, expect, it } from 'vitest';
import { lockPathMatches } from './file-locks';

describe('lockPathMatches', () => {
  it('matches exact paths case-insensitively and normalizes separators', () => {
    expect(lockPathMatches('C:/Work/File.txt', 'c:\\work\\file.TXT', false)).toBe(true);
  });
  it('matches descendants at folder boundaries, not similarly prefixed siblings', () => {
    expect(lockPathMatches('C:\\Work', 'c:\\work\\src\\file.ts', true)).toBe(true);
    expect(lockPathMatches('C:\\Work', 'C:\\Work-old\\file.ts', true)).toBe(false);
  });
});
