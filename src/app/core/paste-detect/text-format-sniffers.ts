/**
 * Cheap, structural "what kind of document is this?" sniffers for Smart Paste's text-format
 * detectors (see `AGENTS.md` — "Text-format detectors").
 *
 * These deliberately do NOT delegate to the owning tools' real parsers, unlike the ID/token
 * detectors in `paste-detectors.ts`: `PASTE_DETECTORS` is imported by the ambient paste chip that
 * `ShellLayout` mounts on every page, so anything imported here lands in the prefetched shell
 * bundle (`scripts/check-cache-budget.mjs`). The real YAML/XML/SQL/SVGO parsers are exactly the
 * heavy, lazy-loaded dependencies that must stay out of it. A sniffer only needs to be right about
 * the *shape*; the tool it routes to does the real parsing and reports real errors.
 *
 * Every sniffer is conservative (false negatives are fine — Smart Paste just shows fewer
 * suggestions) and bounded — they run on every keystroke of the Smart Paste box, so none looks at
 * more than the first `SNIFF_LINES` lines / `SNIFF_CHARS` characters (plus a short tail for
 * "is the root element closed at the end" checks), however large the paste.
 */

const SNIFF_LINES = 40;
const SNIFF_CHARS = 4000;
const TAIL_CHARS = 200;

const head = (text: string) => text.slice(0, SNIFF_CHARS);
const tail = (text: string) => text.trimEnd().slice(-TAIL_CHARS);

function leadingLines(text: string): string[] {
  return head(text).split(/\r?\n/, SNIFF_LINES + 1).slice(0, SNIFF_LINES);
}

function contentLines(text: string): string[] {
  return leadingLines(text)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
}

/** Only ever called on input that already starts with `[`/`{`, so the full parse is rare. */
function isJsonObjectOrArray(text: string): boolean {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed) || !/[\]}]$/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Leading XML declaration, comments, and DOCTYPE — stripped before looking at the root element. */
const XML_PROLOG = /^(?:\s*<\?xml[^>]*\?>|\s*<!--[\s\S]*?-->|\s*<!DOCTYPE[^>]*>)*\s*/i;

export function looksLikeSvg(text: string): boolean {
  const body = head(text).replace(XML_PROLOG, '');
  if (!/^<svg[\s>/]/i.test(body)) return false;
  // Closed at the end, or the root `<svg .../>` itself self-closes and is the whole document.
  return /<\/svg>$/i.test(tail(text)) || /^<svg\b[^>]*\/>$/i.test(body.trimEnd());
}

export function looksLikeHtmlDocument(text: string): boolean {
  return /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype html\b|<html[\s>])/i.test(head(text));
}

/** A well-bracketed XML document: an XML declaration, or a root element closed at the very end. */
export function looksLikeXml(text: string): boolean {
  const start = head(text).trimStart();
  const body = start.replace(XML_PROLOG, '');
  if (/^<\?xml\s/i.test(start)) return /^<[A-Za-z_][\w.:-]*[\s>/]/.test(body);
  const root = /^<([A-Za-z_][\w.-]*(?::[\w.-]+)?)[\s>]/.exec(body);
  if (!root || /^(?:html|svg|head|body|div|span|p)$/i.test(root[1])) return false;
  return tail(text).endsWith(`</${root[1]}>`);
}

/**
 * Counts distinct Markdown constructs (heading, list, fenced code, link, emphasis/inline code,
 * table, quote) — one construct alone is too easily incidental in plain prose, so the detector
 * requires at least two.
 */
export function markdownSignalCount(text: string): number {
  const lines = leadingLines(text);
  const start = head(text);
  const signals = [
    lines.some((line) => /^#{1,6}\s+\S/.test(line)),
    lines.some((line) => /^\s*(?:[-*+]|\d+\.)\s+\S/.test(line)),
    lines.some((line) => /^\s*(?:```|~~~)/.test(line)),
    /\[[^\]\n]+\]\([^)\s]+\)/.test(start),
    /(\*\*|__)\S[^\n]*?\S\1/.test(start) || /`[^`\n]+`/.test(start),
    lines.some((line) => /^\s*\|?\s*:?-{3,}:?\s*\|/.test(line)),
    lines.some((line) => /^>\s?\S/.test(line)),
  ];
  return signals.filter(Boolean).length;
}

const YAML_LINE = /^\s*(?:-\s+)?(?:[\w.-]+|"[^"]*"|'[^']*'):(?:\s|$)|^\s*-(?:\s|$)/;

/** Multi-line `key: value` / `- item` mapping. JSON/XML-looking input is excluded up front. */
export function looksLikeYaml(text: string): boolean {
  if (/^\s*[<{[]/.test(text)) return false;
  const lines = contentLines(text).filter((line) => line.trim() !== '---' && line.trim() !== '...');
  if (lines.length < 2) return false;
  const yamlish = lines.filter((line) => YAML_LINE.test(line) || /^\s{2,}\S/.test(line)).length;
  // At least one top-level `key:` -- a bare `- item` list alone reads just as well as Markdown.
  return lines.some((line) => /^[\w"'.-]+:(?:\s|$)/.test(line)) && yamlish / lines.length >= 0.8;
}

export function looksLikeKubernetesManifest(text: string): boolean {
  const start = head(text);
  return looksLikeYaml(text) && /^apiVersion:\s*\S/m.test(start) && /^kind:\s*[A-Z]\w*/m.test(start);
}

const SQL_START =
  /^\s*(?:--[^\n]*\n\s*)*(?:SELECT\b[\s\S]*\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b|CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?(?:TABLE|VIEW|INDEX|UNIQUE\s+INDEX|FUNCTION|PROCEDURE|TRIGGER)\b|ALTER\s+TABLE\b|DROP\s+(?:TABLE|VIEW|INDEX)\b|WITH\s+(?:RECURSIVE\s+)?\w+\s+AS\s*\()/i;

export function looksLikeSql(text: string): boolean {
  return SQL_START.test(head(text));
}

/**
 * Every sniffed line has the same, non-zero count of one delimiter (tab, comma, semicolon) — at
 * least 3 columns for a 2–3 line paste (two lines of prose with one comma each is common), 2
 * columns once there are 4+ rows. Returns the delimiter, or `null`.
 */
export function sniffDelimitedTable(text: string): '\t' | ',' | ';' | null {
  const lines = leadingLines(text).filter((line) => line.trim() !== '');
  if (lines.length < 2 || /^\s*[[{<]/.test(text)) return null;
  const minDelimiters = lines.length >= 4 ? 1 : 2;
  for (const delimiter of ['\t', ',', ';'] as const) {
    const counts = lines.map((line) => line.split(delimiter).length - 1);
    if (counts[0] >= minDelimiters && counts.every((count) => count === counts[0])) return delimiter;
  }
  return null;
}

/** Leads with a `selector { property: value; }` rule (or an at-rule block), comments allowed. */
export function looksLikeCss(text: string): boolean {
  const start = head(text).trim();
  if (/^\w+\s*\(/.test(start) || isJsonObjectOrArray(start)) return false;
  return /^(?:\/\*[\s\S]*?\*\/\s*)*(?:@[\w-]+[^{;]*|[.#:*[\w][^{};]*)\{\s*(?:(?:--)?[\w-]+\s*:\s*[^;{}]+;?\s*|[^{}]*\{[^{}]*\}\s*)+\}/.test(start);
}

const DOCKERFILE_INSTRUCTION =
  /^(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\s/i;

/** Starts with `FROM` (after any `ARG`s); every unindented, non-continuation line is an instruction. */
export function looksLikeDockerfile(text: string): boolean {
  const lines = contentLines(text);
  const first = lines.find((line) => !/^ARG\s/i.test(line));
  const instructions = lines.filter((line, i) => !/^\s/.test(line) && !lines[i - 1]?.endsWith('\\'));
  return !!first && /^FROM\s+\S+/i.test(first) && instructions.length >= 2 && instructions.every((line) => DOCKERFILE_INSTRUCTION.test(line));
}

/** Every content line is `KEY=value` (optionally `export KEY=value`) with a shell-style key. */
export function looksLikeDotenv(text: string): boolean {
  const lines = contentLines(text);
  return lines.length >= 2 && lines.every((line) => /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=/.test(line));
}

/** A JS/Node, JVM, .NET or Python stack trace — at least two frames, or a Python traceback header. */
export function looksLikeStackTrace(text: string): boolean {
  if (/^Traceback \(most recent call last\):/m.test(head(text))) return true;
  const frames = leadingLines(text).filter((line) => /^\s+at\s+\S/.test(line) || /^\s+File "[^"]+", line \d+/.test(line));
  return frames.length >= 2;
}
