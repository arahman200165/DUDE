import { lintMarkdown } from "./markdown-lint.js";

describe('lintMarkdown — code fences', () => {
  it('flags an unclosed code fence at its opening line', () => {
    const findings = lintMarkdown('# Title\n\n```js\nconst x = 1;\n');
    expect(findings).toContainEqual({ line: 3, severity: 'error', message: 'Code fence opened here is never closed.' });
  });

  it('does not flag a properly closed fence', () => {
    const findings = lintMarkdown('```js\nconst x = 1;\n```\n');
    expect(findings.some((f) => f.message.includes('never closed'))).toBe(false);
  });
});

describe('lintMarkdown — emphasis', () => {
  it('flags an odd number of * markers', () => {
    const findings = lintMarkdown('This is *italic text with no close.');
    expect(findings.some((f) => f.line === 1 && f.message.includes('italics'))).toBe(true);
  });

  it('does not flag balanced emphasis', () => {
    const findings = lintMarkdown('This is *italic* and **bold** text.');
    expect(findings).toHaveLength(0);
  });

  it('does not flag markers inside a code fence', () => {
    const findings = lintMarkdown('```\nlet x = a * b;\n```\n');
    expect(findings.some((f) => f.message.includes('italics'))).toBe(false);
  });
});

describe('lintMarkdown — duplicate heading ids', () => {
  it('flags a second heading that slugifies to the same id', () => {
    const findings = lintMarkdown('# Getting Started\n\nSome text.\n\n# Getting Started\n');
    expect(findings.some((f) => f.line === 5 && f.message.includes('duplicate anchor'))).toBe(true);
  });

  it('does not flag distinct headings', () => {
    const findings = lintMarkdown('# Intro\n\n# Usage\n');
    expect(findings.some((f) => f.message.includes('duplicate anchor'))).toBe(false);
  });
});

describe('lintMarkdown — inconsistent list markers', () => {
  it('flags a marker change within the same list block', () => {
    const findings = lintMarkdown('- one\n- two\n* three\n');
    expect(findings.some((f) => f.line === 3 && f.message.includes('inconsistent'))).toBe(true);
  });

  it('does not flag a new list after a blank-line-free marker change is actually a separate block via different indent', () => {
    const findings = lintMarkdown('- one\n- two\n');
    expect(findings.some((f) => f.message.includes('inconsistent'))).toBe(false);
  });
});

describe('lintMarkdown — broken reference links', () => {
  it('flags a reference link with no matching definition', () => {
    const findings = lintMarkdown('See [the docs][docs] for more.\n');
    expect(findings.some((f) => f.line === 1 && f.message.includes('no matching'))).toBe(true);
  });

  it('does not flag a reference link with a matching definition', () => {
    const findings = lintMarkdown('See [the docs][docs] for more.\n\n[docs]: https://example.com\n');
    expect(findings.some((f) => f.message.includes('no matching'))).toBe(false);
  });

  it('matches reference definitions case-insensitively', () => {
    const findings = lintMarkdown('See [the docs][Docs] for more.\n\n[docs]: https://example.com\n');
    expect(findings.some((f) => f.message.includes('no matching'))).toBe(false);
  });

  it('supports the shorthand [text][] form', () => {
    const findings = lintMarkdown('See [docs][] for more.\n');
    expect(findings.some((f) => f.message.includes('no matching'))).toBe(true);
  });
});

describe('lintMarkdown — combined', () => {
  it('sorts findings by line number', () => {
    const findings = lintMarkdown('# Title\n\nSee [x][y] here.\n\n# Title\n');
    const lineNumbers = findings.map((f) => f.line);
    expect(lineNumbers).toEqual([...lineNumbers].sort((a, b) => a - b));
  });
});
