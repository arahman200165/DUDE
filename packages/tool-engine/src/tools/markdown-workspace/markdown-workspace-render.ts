/**
 * Pure, framework-free render pipeline for the Advanced Markdown Workspace.
 * Shared unmodified between the main thread and `markdown-workspace.worker.ts`.
 *
 * IMPORTANT: `renderedHtmlRaw` is deliberately UNSANITIZED. DOMPurify cannot
 * run inside a plain dedicated Web Worker (no `window`/`document` global
 * there), so the caller — always the main thread, whether the sync or
 * worker path was used — must call `DOMPurify.sanitize()` on the result
 * before ever binding it to `[innerHTML]`. Getting this backwards would
 * silently disable sanitization only on the large-document/worker code
 * path.
 */

import MarkdownIt, { Token } from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import slugify from '@sindresorhus/slugify';
import { YAMLException, load } from 'js-yaml';
import { MarkdownStats, computeStats } from "./markdown-stats.js";

export interface TocEntry {
  readonly level: number;
  readonly text: string;
  readonly slug: string;
}

export interface WorkspaceRenderResult {
  readonly renderedHtmlRaw: string;
  readonly frontMatter: Record<string, unknown> | null;
  readonly frontMatterError: string | null;
  readonly toc: readonly TocEntry[];
  readonly stats: MarkdownStats;
}

// Same security config as the baseline Markdown Preview tool's `markdown-render.ts`
// (`html: false, linkify: true, breaks: false`), extended with GFM task lists —
// tables and strikethrough are already part of markdown-it's core ruleset.
const markdownIt = new MarkdownIt({ html: false, linkify: true, breaks: false }).use(taskLists, {
  enabled: true,
  label: true,
});

// Anchored at literal index 0 (not just start-of-line) so a body-leading
// `---` horizontal rule is never misclassified as front matter — a true
// front-matter block must be the literal first bytes of the document.
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function splitFrontMatter(source: string): { frontMatterYaml: string | null; body: string } {
  const match = FRONT_MATTER_RE.exec(source);
  if (!match) return { frontMatterYaml: null, body: source };
  return { frontMatterYaml: match[1], body: source.slice(match[0].length) };
}

function parseFrontMatter(yamlText: string): { frontMatter: Record<string, unknown> | null; error: string | null } {
  try {
    const parsed: unknown = load(yamlText);
    if (parsed === null || parsed === undefined) return { frontMatter: {}, error: null };
    if (isRecord(parsed)) return { frontMatter: parsed, error: null };
    return { frontMatter: { value: parsed }, error: null };
  } catch (error) {
    const message = error instanceof YAMLException || error instanceof Error ? error.message : String(error);
    return { frontMatter: null, error: message };
  }
}

/**
 * Walks the token stream once, stamping a slug `id` onto each heading_open
 * token (mutating it ahead of rendering) and collecting the same slugs into
 * a TOC list — one source of truth, so the rendered `<h1 id="…">` anchors
 * and the TOC's links can never drift apart.
 */
function buildTocAndStampAnchors(tokens: readonly Token[]): readonly TocEntry[] {
  const toc: TocEntry[] = [];
  const usedSlugs = new Map<string, number>();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'heading_open') continue;

    const inline = tokens[i + 1];
    const text = inline?.type === 'inline' ? inline.content : '';
    const baseSlug = slugify(text, { separator: '-' }) || 'section';
    const count = usedSlugs.get(baseSlug) ?? 0;
    usedSlugs.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;

    token.attrSet('id', slug);
    toc.push({ level: Number(token.tag.slice(1)), text, slug });
  }

  return toc;
}

export function buildWorkspaceResult(source: string): WorkspaceRenderResult {
  const { frontMatterYaml, body } = splitFrontMatter(source);

  let frontMatter: Record<string, unknown> | null = null;
  let frontMatterError: string | null = null;
  if (frontMatterYaml !== null) {
    const parsed = parseFrontMatter(frontMatterYaml);
    frontMatter = parsed.frontMatter;
    frontMatterError = parsed.error;
  }

  const tokens = markdownIt.parse(body, {});
  const toc = buildTocAndStampAnchors(tokens);
  const renderedHtmlRaw = markdownIt.renderer.render(tokens, markdownIt.options, {});

  return { renderedHtmlRaw, frontMatter, frontMatterError, toc, stats: computeStats(source) };
}
