/**
 * Palette injected into the iframe document. The iframe cannot see the parent's CSS custom
 * properties, so the host resolves the active theme's tokens and passes them in as literal values.
 */
export interface SandboxedMarkdownPalette {
  readonly colorScheme: 'dark' | 'light';
  readonly text: string;
  readonly textMuted: string;
  readonly panelElevated: string;
  readonly border: string;
  readonly accent: string;
}

/** Dark fallbacks, used for any palette value that is empty or not a plain color/keyword. */
export const DARK_MARKDOWN_PALETTE: SandboxedMarkdownPalette = {
  colorScheme: 'dark',
  text: '#e5e5e5',
  textMuted: '#a3a3a3',
  panelElevated: '#262626',
  border: '#404040',
  accent: '#58a6ff',
};

/** Colors only: reject anything that could break out of the declaration or the `<style>` element. */
function safeValue(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || /[<>{};\\]|\/\*|url\(|@import/i.test(trimmed)) return fallback;
  return trimmed;
}

/** Fills a partial/untrusted palette with dark fallbacks. */
export function resolveMarkdownPalette(partial?: Partial<SandboxedMarkdownPalette>): SandboxedMarkdownPalette {
  const base = DARK_MARKDOWN_PALETTE;
  return {
    colorScheme: partial?.colorScheme === 'light' ? 'light' : 'dark',
    text: safeValue(partial?.text, base.text),
    textMuted: safeValue(partial?.textMuted, base.textMuted),
    panelElevated: safeValue(partial?.panelElevated, base.panelElevated),
    border: safeValue(partial?.border, base.border),
    accent: safeValue(partial?.accent, base.accent),
  };
}

/**
 * Builds the `srcdoc` document for `SandboxedMarkdownPreview`. Pure so the
 * document-assembly logic is testable without an iframe/DOM.
 *
 * The iframe boundary — not a CSS parser — is the real isolation
 * mechanism: rather than hand-rolling a CSS property/value allowlist
 * parser (CSS has enough edge cases — nested at-rules, comments hiding
 * `@import`, encoded `url()` — that a partial parser would give a false
 * sense of security), custom CSS is rendered inside a bare
 * `<iframe sandbox="">` with no `allow-scripts`/`allow-same-origin`, plus
 * an internal CSP meta tag as defense-in-depth.
 *
 * Theme colors arrive as a resolved `palette` (the iframe cannot read the parent's custom
 * properties) and are defined as the same `--color-*` names the shared `.markdown-body` ruleset uses.
 */
export function buildSandboxedMarkdownDocument(html: string, css: string, palette?: Partial<SandboxedMarkdownPalette>): string {
  const p = resolveMarkdownPalette(palette);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: https:;">
<style>
  :root { color-scheme: ${p.colorScheme}; --color-text: ${p.text}; --color-text-muted: ${p.textMuted}; --color-panel-elevated: ${p.panelElevated}; --color-border: ${p.border}; --color-accent: ${p.accent}; }
  body { margin: 0; padding: 0.75rem; background: transparent; color: var(--color-text); font-family: sans-serif; }
</style>
<style>${css}</style>
</head>
<body class="markdown-body">${html}</body>
</html>`;
}
