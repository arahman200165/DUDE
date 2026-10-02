import { buildConventionalCommit } from "./conventional-commit-builder-logic.js";

const BASE = { type: 'feat' as const, scope: '', breaking: false, subject: 'add login page', body: '', breakingDescription: '', footers: '' };

describe('buildConventionalCommit', () => {
  it('builds a bare header with no scope, body, or footer', () => {
    expect(buildConventionalCommit(BASE)).toBe('feat: add login page');
  });

  it('includes a scope in parentheses', () => {
    expect(buildConventionalCommit({ ...BASE, scope: 'auth' })).toBe('feat(auth): add login page');
  });

  it('marks a breaking change with "!" after the type/scope', () => {
    expect(buildConventionalCommit({ ...BASE, scope: 'auth', breaking: true })).toBe('feat(auth)!: add login page');
  });

  it('adds a BREAKING CHANGE footer when breaking with a description', () => {
    const result = buildConventionalCommit({ ...BASE, breaking: true, breakingDescription: 'Removes the old /login endpoint' });
    expect(result).toBe('feat!: add login page\n\nBREAKING CHANGE: Removes the old /login endpoint');
  });

  it('includes a body as its own paragraph', () => {
    expect(buildConventionalCommit({ ...BASE, body: 'Adds a new page.' })).toBe('feat: add login page\n\nAdds a new page.');
  });

  it('includes extra footer lines, skipping blanks', () => {
    const result = buildConventionalCommit({ ...BASE, footers: 'Refs: #123\n\nReviewed-by: Alice' });
    expect(result).toBe('feat: add login page\n\nRefs: #123\nReviewed-by: Alice');
  });

  it('combines body, breaking footer, and extra footers in order', () => {
    const result = buildConventionalCommit({
      ...BASE,
      body: 'Adds a new page.',
      breaking: true,
      breakingDescription: 'Old endpoint removed',
      footers: 'Refs: #123',
    });
    expect(result).toBe('feat!: add login page\n\nAdds a new page.\n\nBREAKING CHANGE: Old endpoint removed\nRefs: #123');
  });
});
