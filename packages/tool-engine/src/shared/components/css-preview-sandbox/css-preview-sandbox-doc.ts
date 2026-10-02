/**
 * Builds the document rendered inside the CSS playground/generator tools'
 * (Box Shadow, Border Radius, Cubic-Bezier, CSS Transform, CSS Animation,
 * Flexbox, CSS Grid) live-preview iframe. Unlike `live-html-preview-doc.ts`
 * (HTML Preview), nothing here ever needs to run a `<script>` — these tools
 * render user-authored CSS against app-provided or user-edited *markup*
 * structure, never arbitrary logic — so the CSP is locked down further
 * (`script-src 'none'`) and the iframe's `sandbox` attribute carries no
 * `allow-scripts` token at all, the most restrictive setting available.
 *
 * `paused` appends a style (after the user CSS, so `!important` wins) that
 * freezes animations and disables transitions — used when reduced motion is on.
 */
export const PAUSE_CSS = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}';

export function buildCssPreviewDoc(css: string, html: string, options: { paused?: boolean } = {}): string {
  const pause = options.paused ? `\n<style>${PAUSE_CSS}</style>` : '';
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none';">
<style>${css}</style>${pause}
${html}`;
}
