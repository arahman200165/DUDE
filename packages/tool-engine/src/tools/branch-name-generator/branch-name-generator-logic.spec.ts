import { generateBranchName } from "./branch-name-generator-logic.js";

describe('generateBranchName', () => {
  it('builds a typed branch name with a ticket and description', () => {
    expect(generateBranchName({ type: 'feature', ticket: 'JIRA-123', description: 'Add login page', maxLength: 0 })).toBe(
      'feature/JIRA-123-add-login-page',
    );
  });

  it('omits the type segment when type is "none"', () => {
    expect(generateBranchName({ type: 'none', ticket: '', description: 'Quick fix', maxLength: 0 })).toBe('quick-fix');
  });

  it('omits the ticket segment when empty', () => {
    expect(generateBranchName({ type: 'bugfix', ticket: '', description: 'Null pointer', maxLength: 0 })).toBe('bugfix/null-pointer');
  });

  it('omits the description segment when empty', () => {
    expect(generateBranchName({ type: 'hotfix', ticket: 'OPS-1', description: '', maxLength: 0 })).toBe('hotfix/OPS-1');
  });

  it('truncates to maxLength and trims a trailing separator', () => {
    const result = generateBranchName({ type: 'feature', ticket: '', description: 'a very long description here', maxLength: 15 });
    expect(result.length).toBeLessThanOrEqual(15);
    expect(result.endsWith('-')).toBe(false);
    expect(result.endsWith('/')).toBe(false);
  });

  it('transliterates and slugifies non-ASCII description text', () => {
    expect(generateBranchName({ type: 'none', ticket: '', description: 'Café Ünïcode', maxLength: 0 })).toBe('cafe-uenicode');
  });
});
