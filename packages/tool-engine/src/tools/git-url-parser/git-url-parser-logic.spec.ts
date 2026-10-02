import { parseGitUrl } from "./git-url-parser-logic.js";

describe('parseGitUrl', () => {
  it('parses an https URL with .git suffix', () => {
    expect(parseGitUrl('https://github.com/user/repo.git')).toEqual({
      ok: true,
      value: { protocol: 'https', user: undefined, host: 'github.com', port: undefined, owner: 'user', repo: 'repo' },
    });
  });

  it('parses an https URL without .git suffix', () => {
    const result = parseGitUrl('https://github.com/user/repo');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.repo).toBe('repo');
  });

  it('parses the scp-like git@host:owner/repo.git form', () => {
    expect(parseGitUrl('git@github.com:user/repo.git')).toEqual({
      ok: true,
      value: { protocol: 'scp', user: 'git', host: 'github.com', owner: 'user', repo: 'repo' },
    });
  });

  it('parses an ssh:// URL with an explicit port', () => {
    const result = parseGitUrl('ssh://git@github.com:2222/user/repo.git');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ protocol: 'ssh', user: 'git', host: 'github.com', port: 2222, owner: 'user', repo: 'repo' });
  });

  it('parses a git:// URL', () => {
    const result = parseGitUrl('git://github.com/user/repo.git');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ protocol: 'git', user: undefined, host: 'github.com', port: undefined, owner: 'user', repo: 'repo' });
  });

  it('parses a self-hosted GitLab URL with a nested-looking but flat owner', () => {
    const result = parseGitUrl('https://gitlab.example.com/team-name/repo-name.git');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.host).toBe('gitlab.example.com');
      expect(result.value.owner).toBe('team-name');
      expect(result.value.repo).toBe('repo-name');
    }
  });

  it('rejects empty input', () => {
    expect(parseGitUrl('').ok).toBe(false);
  });

  it('rejects an unrecognized format', () => {
    expect(parseGitUrl('not a url at all').ok).toBe(false);
  });
});
