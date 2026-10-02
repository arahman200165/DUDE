import { parseGitRemotes } from "./git-remote-inspector-logic.js";

describe('parseGitRemotes', () => {
  it('parses fetch and push lines for a remote', () => {
    const result = parseGitRemotes('origin\tgit@github.com:user/repo.git (fetch)\norigin\tgit@github.com:user/repo.git (push)');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'origin', direction: 'fetch' });
    expect(result[1]).toMatchObject({ name: 'origin', direction: 'push' });
  });

  it('includes the parsed URL breakdown when the URL is recognized', () => {
    const result = parseGitRemotes('origin\thttps://github.com/user/repo.git (fetch)');
    expect(result[0].parsed).toEqual({ protocol: 'https', host: 'github.com', owner: 'user', repo: 'repo' });
  });

  it('handles multiple distinct remotes', () => {
    const result = parseGitRemotes(
      'origin\tgit@github.com:user/repo.git (fetch)\nupstream\thttps://github.com/other/repo.git (fetch)',
    );
    expect(result.map((entry) => entry.name)).toEqual(['origin', 'upstream']);
  });

  it('skips blank lines and lines that do not match the expected shape', () => {
    const result = parseGitRemotes('\norigin\tgit@github.com:user/repo.git (fetch)\nnot a remote line\n');
    expect(result).toHaveLength(1);
  });

  it('returns an empty list for empty input', () => {
    expect(parseGitRemotes('')).toEqual([]);
  });
});
