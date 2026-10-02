/**
 * Shared `.markdown-body` ruleset for Markdown Preview and Markdown
 * Workspace, deduplicated out of their previously-identical `styles`
 * blocks. Parameterized on CSS custom properties (`--md-*`) so a style
 * preset (see `markdown-theme.model.ts`) can retint the rendered output —
 * every property has a fallback matching the tools' original hardcoded
 * values, so nothing changes when no preset is applied.
 *
 * Both consuming components use `ViewEncapsulation.None` because Angular's
 * emulated-encapsulation scoping attribute never reaches `[innerHTML]`-
 * injected content — see either component's own doc comment for the full
 * explanation.
 */
export const MARKDOWN_BODY_STYLES = `
  .markdown-body {
    font-family: var(--md-font, inherit);
  }
  .markdown-body :first-child {
    margin-top: 0;
  }
  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3 {
    font-weight: var(--md-heading-weight, 600);
    margin: calc(var(--md-spacing, 0.5em) * 1.5) 0 calc(var(--md-spacing, 0.5em) * 0.8);
  }
  .markdown-body p,
  .markdown-body ul,
  .markdown-body ol,
  .markdown-body pre,
  .markdown-body blockquote,
  .markdown-body table {
    margin: var(--md-spacing, 0.5em) 0;
  }
  .markdown-body ul,
  .markdown-body ol {
    padding-left: 1.4em;
  }
  .markdown-body code {
    font-family: var(--font-mono);
    background: var(--color-panel-elevated);
    border-radius: 2px;
    padding: 0.1em 0.3em;
    font-size: 0.9em;
  }
  .markdown-body pre {
    background: var(--color-panel-elevated);
    border-radius: 4px;
    padding: 0.6em 0.8em;
    overflow: auto;
  }
  .markdown-body pre code {
    background: none;
    padding: 0;
  }
  .markdown-body blockquote {
    border-left: 2px solid var(--color-border);
    padding-left: 0.8em;
    color: var(--color-text-muted);
  }
  .markdown-body a {
    color: var(--md-accent, var(--color-accent));
  }
  .markdown-body table {
    border-collapse: collapse;
  }
  .markdown-body th,
  .markdown-body td {
    border: 1px solid var(--color-border);
    padding: 0.3em 0.6em;
  }
`;
