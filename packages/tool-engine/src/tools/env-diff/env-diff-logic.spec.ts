import { diffEnvFiles } from "./env-diff-logic.js";

describe('diffEnvFiles', () => {
  it('reports no differences for identical .env files', () => {
    const result = diffEnvFiles('FOO=bar\nBAZ=qux', 'FOO=bar\nBAZ=qux');
    expect(result.summary).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('detects an added variable', () => {
    const result = diffEnvFiles('FOO=bar', 'FOO=bar\nBAZ=qux');
    expect(result.summary.added).toBe(1);
    expect(result.entries.some((entry) => entry.path === '/BAZ')).toBe(true);
  });

  it('detects a removed variable', () => {
    const result = diffEnvFiles('FOO=bar\nBAZ=qux', 'FOO=bar');
    expect(result.summary.removed).toBe(1);
  });

  it('detects a changed value', () => {
    const result = diffEnvFiles('FOO=bar', 'FOO=baz');
    expect(result.summary.changed).toBe(1);
  });
});
