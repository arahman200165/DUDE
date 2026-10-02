import { buildGitCommand } from "./git-command-builder-logic.js";

describe('buildGitCommand', () => {
  it('builds a clone command with a flag and a positional', () => {
    expect(buildGitCommand('clone', { repository: 'https://github.com/user/repo.git', branch: 'main' })).toBe(
      'git clone --branch main https://github.com/user/repo.git',
    );
  });

  it('builds a commit command with a quoted message and boolean flags', () => {
    expect(buildGitCommand('commit', { message: 'Fix the thing', amend: true })).toBe('git commit -m "Fix the thing" --amend');
  });

  it('escapes double quotes inside a quoted value', () => {
    expect(buildGitCommand('commit', { message: 'Say "hi"' })).toBe('git commit -m "Say \\"hi\\""');
  });

  it('omits fields with empty or false values', () => {
    expect(buildGitCommand('push', { remote: '', branch: '', force: false })).toBe('git push');
  });

  it('builds a push command with positionals and flags', () => {
    expect(buildGitCommand('push', { remote: 'origin', branch: 'main', setUpstream: true })).toBe('git push -u origin main');
  });

  it('builds a bare subcommand with no values', () => {
    expect(buildGitCommand('log', {})).toBe('git log');
  });
});
