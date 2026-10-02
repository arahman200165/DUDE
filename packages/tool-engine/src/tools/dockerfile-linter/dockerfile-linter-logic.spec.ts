import { formatDockerfile, lintDockerfile, parseDockerfile } from "./dockerfile-linter-logic.js";

describe('parseDockerfile', () => {
  it('parses instructions, skipping comments and blank lines', () => {
    const result = parseDockerfile('# comment\nFROM node:20\n\nRUN echo hi');
    expect(result).toEqual([
      { keyword: 'FROM', args: 'node:20', line: 2 },
      { keyword: 'RUN', args: 'echo hi', line: 4 },
    ]);
  });

  it('joins a backslash-continued instruction into one', () => {
    const result = parseDockerfile('RUN apt-get update && \\\n    apt-get install -y curl');
    expect(result).toEqual([{ keyword: 'RUN', args: 'apt-get update && apt-get install -y curl', line: 1 }]);
  });
});

describe('lintDockerfile', () => {
  it('warns when FROM is not first', () => {
    const issues = lintDockerfile('RUN echo hi\nFROM node:20');
    expect(issues.some((issue) => issue.message.includes('should be FROM'))).toBe(true);
  });

  it('warns on an unpinned base image', () => {
    const issues = lintDockerfile('FROM node\nUSER app');
    expect(issues.some((issue) => issue.message.includes('no tag or digest'))).toBe(true);
  });

  it('warns on a ":latest" base image', () => {
    const issues = lintDockerfile('FROM node:latest\nUSER app');
    expect(issues.some((issue) => issue.message.includes(':latest'))).toBe(true);
  });

  it('accepts a properly pinned base image without a tag warning', () => {
    const issues = lintDockerfile('FROM node:20.11.0\nUSER app');
    expect(issues.some((issue) => issue.message.includes('tag'))).toBe(false);
  });

  it('warns on apt-get install missing --no-install-recommends and cleanup', () => {
    const issues = lintDockerfile('FROM node:20\nRUN apt-get install -y curl\nUSER app');
    expect(issues.some((issue) => issue.message.includes('--no-install-recommends'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('/var/lib/apt/lists'))).toBe(true);
  });

  it('does not warn when apt-get install is properly cleaned up', () => {
    const issues = lintDockerfile(
      'FROM node:20\nRUN apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*\nUSER app',
    );
    expect(issues.some((issue) => issue.message.includes('apt-get'))).toBe(false);
  });

  it('warns on ADD used for a plain file', () => {
    const issues = lintDockerfile('FROM node:20\nADD app.js /app/\nUSER app');
    expect(issues.some((issue) => issue.message.includes('prefer COPY'))).toBe(true);
  });

  it('does not warn on ADD used for a URL', () => {
    const issues = lintDockerfile('FROM node:20\nADD https://example.com/file.tar.gz /app/\nUSER app');
    expect(issues.some((issue) => issue.message.includes('prefer COPY'))).toBe(false);
  });

  it('warns on a non-numeric EXPOSE port', () => {
    const issues = lintDockerfile('FROM node:20\nEXPOSE abc\nUSER app');
    expect(issues.some((issue) => issue.message.includes('EXPOSE'))).toBe(true);
  });

  it('warns when no USER instruction is present', () => {
    const issues = lintDockerfile('FROM node:20');
    expect(issues.some((issue) => issue.message.includes('runs as root'))).toBe(true);
  });

  it('returns no issues for empty input', () => {
    expect(lintDockerfile('')).toEqual([]);
  });
});

describe('formatDockerfile', () => {
  it('uppercases instruction keywords and normalizes spacing', () => {
    expect(formatDockerfile('from   node:20\nrun echo hi')).toBe('FROM node:20\nRUN echo hi');
  });

  it('preserves comments and blank lines', () => {
    expect(formatDockerfile('# hello\nfrom node:20\n\nrun echo hi')).toBe('# hello\nFROM node:20\n\nRUN echo hi');
  });

  it('does not re-case a continuation line', () => {
    const result = formatDockerfile('run apt-get update && \\\n    apt-get install curl');
    expect(result).toBe('RUN apt-get update && \\\napt-get install curl');
  });
});
