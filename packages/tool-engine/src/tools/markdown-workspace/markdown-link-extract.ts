export interface MarkdownLink {
  readonly line: number;
  readonly text: string;
  readonly url: string;
}

/** Extracts every link a document contains: inline `[text](url)`, reference-style `[text][ref]` resolved against its `[ref]: url` definition, and bare `<https://...>` autolinks. Reference links with no matching definition are silently skipped here -- `markdown-lint.ts`'s broken-reference-link check already flags those. */
export function extractMarkdownLinks(source: string): readonly MarkdownLink[] {
  const lines = source.split('\n');
  const links: MarkdownLink[] = [];

  const definitions = new Map<string, string>();
  const defPattern = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)/;
  lines.forEach((line) => {
    const match = defPattern.exec(line);
    if (match) definitions.set(match[1].toLowerCase(), match[2]);
  });

  // Each pattern is declared fresh per line -- a shared `g`-flagged regex's `lastIndex` would
  // carry over between lines and silently skip matches (same gotcha as markdown-lint.ts's
  // reference-link check).
  lines.forEach((line, i) => {
    let match: RegExpExecArray | null;

    const inline = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    while ((match = inline.exec(line)) !== null) {
      links.push({ line: i + 1, text: match[1], url: match[2] });
    }

    const reference = /\[([^\]]*)\]\[([^\]]*)\]/g;
    while ((match = reference.exec(line)) !== null) {
      const ref = (match[2] === '' ? match[1] : match[2]).toLowerCase();
      const url = definitions.get(ref);
      if (url) links.push({ line: i + 1, text: match[1], url });
    }

    const autolink = /<(https?:\/\/[^\s>]+)>/g;
    while ((match = autolink.exec(line)) !== null) {
      links.push({ line: i + 1, text: match[1], url: match[1] });
    }
  });

  return links;
}

export function isCheckableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
