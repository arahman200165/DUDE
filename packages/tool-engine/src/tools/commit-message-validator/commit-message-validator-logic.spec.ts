import { validateCommitMessage } from "./commit-message-validator-logic.js";

describe('validateCommitMessage', () => {
  it('accepts a clean, valid message with no issues', () => {
    expect(validateCommitMessage('feat(auth): add login page')).toEqual([]);
  });

  it('rejects an empty message', () => {
    expect(validateCommitMessage('')).toEqual([{ severity: 'error', message: 'Commit message is empty.' }]);
  });

  it('rejects a header not matching the required format', () => {
    const result = validateCommitMessage('added the login page');
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('error');
  });

  it('warns on a non-standard type', () => {
    const result = validateCommitMessage('feature: add login page');
    expect(result).toContainEqual({ severity: 'warning', message: '"feature" is not a standard Conventional Commits type.' });
  });

  it('warns when the header exceeds 72 characters', () => {
    const result = validateCommitMessage(`feat: ${'a'.repeat(70)}`);
    expect(result.some((issue) => issue.message.includes('72'))).toBe(true);
  });

  it('warns when the subject ends with a period', () => {
    const result = validateCommitMessage('feat: add login page.');
    expect(result).toContainEqual({ severity: 'warning', message: 'Subject should not end with a period.' });
  });

  it('warns when the subject starts uppercase', () => {
    const result = validateCommitMessage('feat: Add login page');
    expect(result).toContainEqual({ severity: 'warning', message: 'Subject should start lowercase.' });
  });

  it('warns on a likely non-imperative first word', () => {
    const result = validateCommitMessage('feat: added login page');
    expect(result.some((issue) => issue.message.includes('non-imperative'))).toBe(true);
  });

  it('warns when the second line is not blank', () => {
    const result = validateCommitMessage('feat: add login page\nsome body text right away');
    expect(result).toContainEqual({ severity: 'warning', message: 'The second line should be blank, separating the header from the body.' });
  });

  it('warns when "!" is used without a BREAKING CHANGE footer', () => {
    const result = validateCommitMessage('feat!: add login page');
    expect(result.some((issue) => issue.message.includes('BREAKING CHANGE'))).toBe(true);
  });

  it('accepts a breaking change with a matching footer', () => {
    const result = validateCommitMessage('feat!: add login page\n\nBREAKING CHANGE: removes the old endpoint');
    expect(result).toEqual([]);
  });

  it('warns when a BREAKING CHANGE footer exists without "!"', () => {
    const result = validateCommitMessage('feat: add login page\n\nBREAKING CHANGE: removes the old endpoint');
    expect(result.some((issue) => issue.message.includes('not marked with "!"'))).toBe(true);
  });
});
