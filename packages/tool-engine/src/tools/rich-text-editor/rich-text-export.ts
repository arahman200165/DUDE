import { hostSanitizeHtml } from "@dude/crypto/host";

/**
 * Every HTML string that leaves the TipTap editor — pasted clipboard HTML,
 * live content synced out for persistence, or an explicit HTML export —
 * goes through this before touching `[innerHTML]`, storage, or a download.
 * Defense-in-depth per PRD Section 31, even though the curated extension
 * schema already constrains most of what the editor itself can produce.
 */
export function sanitizeEditorHtml(html: string): string {
  return hostSanitizeHtml(html);
}
