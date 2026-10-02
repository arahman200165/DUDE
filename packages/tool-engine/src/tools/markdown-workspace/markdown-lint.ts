export interface LintFinding {
  readonly line: number;
  readonly severity: 'warning' | 'error';
  readonly message: string;
}

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function lintUnclosedCodeFences(lines: readonly string[]): LintFinding[] {
  const findings: LintFinding[] = [];
  let openFenceLine: number | null = null;

  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      if (openFenceLine === null) openFenceLine = i + 1;
      else openFenceLine = null;
    }
  });

  if (openFenceLine !== null) {
    findings.push({ line: openFenceLine, severity: 'error', message: `Code fence opened here is never closed.` });
  }
  return findings;
}

/** Heuristic, line-by-line: an odd count of unescaped `*`/`_`/`**`/`__` markers on a line usually means one is unclosed. Real CommonMark emphasis matching has more nuance (intraword rules, escapes) than this checks. */
function lintUnclosedEmphasis(lines: readonly string[]): LintFinding[] {
  const findings: LintFinding[] = [];
  let insideFence = false;

  lines.forEach((rawLine, i) => {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      insideFence = !insideFence;
      return;
    }
    if (insideFence) return;

    const line = rawLine.replace(/\\[*_]/g, '');

    const doubleStar = (line.match(/\*\*/g) ?? []).length;
    const singleStar = (line.match(/(?<!\*)\*(?!\*)/g) ?? []).length;
    const doubleUnderscore = (line.match(/__/g) ?? []).length;

    if (doubleStar % 2 !== 0) findings.push({ line: i + 1, severity: 'warning', message: 'Odd number of ** markers — bold may be unclosed.' });
    if (singleStar % 2 !== 0) findings.push({ line: i + 1, severity: 'warning', message: 'Odd number of * markers — italics may be unclosed.' });
    if (doubleUnderscore % 2 !== 0) findings.push({ line: i + 1, severity: 'warning', message: 'Odd number of __ markers — bold may be unclosed.' });
  });

  return findings;
}

function lintDuplicateHeadingIds(lines: readonly string[]): LintFinding[] {
  const findings: LintFinding[] = [];
  const seen = new Map<string, number>();

  lines.forEach((line, i) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    const slug = slugify(match[2]);
    if (slug === '') return;

    const firstLine = seen.get(slug);
    if (firstLine !== undefined) {
      findings.push({ line: i + 1, severity: 'warning', message: `Heading "${match[2]}" generates the same id ("${slug}") as the heading on line ${firstLine} — duplicate anchor.` });
    } else {
      seen.set(slug, i + 1);
    }
  });

  return findings;
}

const LIST_MARKER = /^(\s*)([-*+])\s+/;

function lintInconsistentListMarkers(lines: readonly string[]): LintFinding[] {
  const findings: LintFinding[] = [];
  let blockMarker: string | null = null;
  let blockIndent: string | null = null;
  let blockStartLine = 0;

  lines.forEach((line, i) => {
    const match = LIST_MARKER.exec(line);
    if (!match) {
      if (line.trim() === '') return; // blank lines don't break a list block
      blockMarker = null;
      blockIndent = null;
      return;
    }

    const [, indent, marker] = match;
    if (blockMarker === null || indent !== blockIndent) {
      blockMarker = marker;
      blockIndent = indent;
      blockStartLine = i + 1;
      return;
    }

    if (marker !== blockMarker) {
      findings.push({
        line: i + 1,
        severity: 'warning',
        message: `List marker "${marker}" is inconsistent with "${blockMarker}" used starting at line ${blockStartLine}.`,
      });
    }
  });

  return findings;
}

function lintBrokenReferenceLinks(lines: readonly string[]): LintFinding[] {
  const findings: LintFinding[] = [];
  const definitions = new Set<string>();
  const usages: { readonly line: number; readonly ref: string; readonly label: string }[] = [];

  const defPattern = /^\s{0,3}\[([^\]]+)\]:\s*\S/;

  lines.forEach((line, i) => {
    const defMatch = defPattern.exec(line);
    if (defMatch) definitions.add(defMatch[1].toLowerCase());

    // Declared fresh per line -- a shared `g`-flagged regex's `lastIndex` would carry over
    // between lines and silently skip matches once a later line is shorter than that offset.
    const usagePattern = /\[([^\]]+)\]\[([^\]]*)\]/g;
    let usageMatch: RegExpExecArray | null;
    while ((usageMatch = usagePattern.exec(line)) !== null) {
      const label = usageMatch[1];
      const ref = usageMatch[2] === '' ? label : usageMatch[2];
      usages.push({ line: i + 1, ref: ref.toLowerCase(), label });
    }
  });

  for (const usage of usages) {
    if (!definitions.has(usage.ref)) {
      findings.push({ line: usage.line, severity: 'warning', message: `Reference link "[${usage.label}][${usage.ref}]" has no matching "[${usage.ref}]: ..." definition.` });
    }
  }

  return findings;
}

export function lintMarkdown(source: string): readonly LintFinding[] {
  const lines = source.split('\n');

  return [
    ...lintUnclosedCodeFences(lines),
    ...lintUnclosedEmphasis(lines),
    ...lintDuplicateHeadingIds(lines),
    ...lintInconsistentListMarkers(lines),
    ...lintBrokenReferenceLinks(lines),
  ].sort((a, b) => a.line - b.line);
}
