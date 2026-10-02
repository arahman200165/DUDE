import { explainGitCommand } from "./git-command-explainer-logic.js";

describe('explainGitCommand', () => {
  it('explains a simple command with the leading "git" token', () => {
    const result = explainGitCommand('git status');
    expect(result).toEqual([
      { text: 'git', kind: 'command', description: 'The git CLI.' },
      { text: 'status', kind: 'subcommand', description: 'Shows the working tree status.' },
    ]);
  });

  it('works without a leading "git" token', () => {
    const result = explainGitCommand('log --oneline --graph');
    expect(result[0]).toEqual({ text: 'log', kind: 'subcommand', description: 'Shows commit logs.' });
    expect(result[1].kind).toBe('flag');
  });

  it('attaches a value-taking flag\'s next token as its value', () => {
    const result = explainGitCommand('git commit -m "fix the thing"');
    expect(result).toEqual([
      { text: 'git', kind: 'command', description: 'The git CLI.' },
      { text: 'commit', kind: 'subcommand', description: 'Records staged changes as a new commit.' },
      { text: '-m', kind: 'flag', description: 'Sets the commit message inline.' },
      { text: 'fix the thing', kind: 'positional', description: 'Value for -m.' },
    ]);
  });

  it('parses the worked rebase --onto example from the PRD', () => {
    const result = explainGitCommand('git rebase --onto develop feature-old feature-new');
    expect(result.map((token) => token.kind)).toEqual(['command', 'subcommand', 'flag', 'positional', 'positional', 'positional']);
    expect(result[3]).toEqual({ text: 'develop', kind: 'positional', description: 'Value for --onto.' });
  });

  it('flags an unrecognized subcommand and flag', () => {
    const result = explainGitCommand('git frobnicate --wat');
    expect(result[1].description).toBe('Unrecognized subcommand.');
    expect(result[2].description).toBe('Unrecognized flag.');
  });

  it('returns an empty list for empty input', () => {
    expect(explainGitCommand('')).toEqual([]);
  });
});
