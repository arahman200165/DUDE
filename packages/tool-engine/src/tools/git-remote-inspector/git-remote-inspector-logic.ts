/** Pure, framework-free parsing of `git remote -v` output, reusing Git URL Parser's per-URL parser. */
import { parseGitUrl, type GitUrlParts } from "../git-url-parser/git-url-parser-logic.js";

export interface GitRemoteEntry {
  readonly name: string;
  readonly url: string;
  readonly direction: 'fetch' | 'push';
  readonly parsed?: GitUrlParts;
}

const LINE_RE = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/;

export function parseGitRemotes(text: string): readonly GitRemoteEntry[] {
  const entries: GitRemoteEntry[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    const match = LINE_RE.exec(line);
    if (!match) continue;

    const [, name, url, direction] = match;
    const parsed = parseGitUrl(url);
    entries.push({ name, url, direction: direction as 'fetch' | 'push', parsed: parsed.ok ? parsed.value : undefined });
  }

  return entries;
}
