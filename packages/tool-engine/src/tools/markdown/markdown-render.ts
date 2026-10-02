import MarkdownIt from 'markdown-it';
import { hostSanitizeHtml } from "@dude/crypto/host";

/**
 * Pure Markdown-to-safe-HTML rendering used by the Markdown Preview tool
 * (PRD Section 20.5: "safe HTML handling policy" / Section 31: "no
 * untrusted HTML execution without sanitization").
 *
 * Defense in depth: `html: false` makes markdown-it escape any raw HTML in
 * the source instead of passing it through, and the resulting HTML is
 * additionally run through DOMPurify before it is ever bound via
 * `[innerHTML]`.
 */
const markdownIt = new MarkdownIt({ html: false, linkify: true, breaks: false });

export function renderMarkdown(source: string): string {
  const html = markdownIt.render(source);
  return hostSanitizeHtml(html);
}
