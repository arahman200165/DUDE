/** Pure, framework-free validation of a commit message against the Conventional Commits spec, plus common style heuristics. */

export interface CommitValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

const HEADER_RE = /^(?<type>[a-z]+)(\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<subject>.+)$/;

const KNOWN_TYPES = new Set(['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']);

const NON_IMPERATIVE_ENDING = /(ed|ing|s)$/i;

export function validateCommitMessage(message: string): readonly CommitValidationIssue[] {
  const issues: CommitValidationIssue[] = [];
  const lines = message.split('\n');
  const header = lines[0] ?? '';

  if (header.trim() === '') {
    return [{ severity: 'error', message: 'Commit message is empty.' }];
  }

  const match = HEADER_RE.exec(header);
  if (!match?.groups) {
    return [{ severity: 'error', message: 'Header does not match the required "type(scope)!: subject" format.' }];
  }

  const { type, subject } = match.groups;
  const breaking = match.groups['breaking'] === '!';

  if (!KNOWN_TYPES.has(type)) {
    issues.push({ severity: 'warning', message: `"${type}" is not a standard Conventional Commits type.` });
  }

  if (header.length > 72) {
    issues.push({ severity: 'warning', message: `Header is ${header.length} characters — keep it to 72 or fewer.` });
  }

  if (subject.endsWith('.')) {
    issues.push({ severity: 'warning', message: 'Subject should not end with a period.' });
  }

  if (/^[A-Z]/.test(subject)) {
    issues.push({ severity: 'warning', message: 'Subject should start lowercase.' });
  }

  const firstWord = subject.trim().split(/\s+/)[0] ?? '';
  if (NON_IMPERATIVE_ENDING.test(firstWord)) {
    issues.push({
      severity: 'warning',
      message: `"${firstWord}" looks non-imperative — prefer imperative mood (e.g. "add", not "added"/"adds"/"adding").`,
    });
  }

  if (lines.length > 1 && lines[1].trim() !== '') {
    issues.push({ severity: 'warning', message: 'The second line should be blank, separating the header from the body.' });
  }

  const hasBreakingFooter = /^BREAKING CHANGE:/m.test(message);
  if (breaking && !hasBreakingFooter) {
    issues.push({ severity: 'warning', message: 'Header is marked "!" for a breaking change, but no "BREAKING CHANGE:" footer was found.' });
  }
  if (!breaking && hasBreakingFooter) {
    issues.push({ severity: 'warning', message: 'Has a "BREAKING CHANGE:" footer, but the header is not marked with "!".' });
  }

  return issues;
}
