/** Pure, framework-free assembly of a Conventional Commits (conventionalcommits.org) formatted message. */

export type CommitType = 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'perf' | 'test' | 'build' | 'ci' | 'chore' | 'revert';

export const COMMIT_TYPES: readonly CommitType[] = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];

export interface ConventionalCommitOptions {
  readonly type: CommitType;
  readonly scope: string;
  readonly breaking: boolean;
  readonly subject: string;
  readonly body: string;
  readonly breakingDescription: string;
  readonly footers: string;
}

export function buildConventionalCommit(opts: ConventionalCommitOptions): string {
  const scope = opts.scope.trim();
  const header = `${opts.type}${scope !== '' ? `(${scope})` : ''}${opts.breaking ? '!' : ''}: ${opts.subject.trim()}`;

  const sections = [header];
  if (opts.body.trim() !== '') sections.push(opts.body.trim());

  const footerLines: string[] = [];
  if (opts.breaking && opts.breakingDescription.trim() !== '') {
    footerLines.push(`BREAKING CHANGE: ${opts.breakingDescription.trim()}`);
  }
  footerLines.push(
    ...opts.footers
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
  );
  if (footerLines.length > 0) sections.push(footerLines.join('\n'));

  return sections.join('\n\n');
}
