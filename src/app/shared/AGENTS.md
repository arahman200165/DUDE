# AGENTS.md — src/app/shared/

Cross-tool primitives: `components/` (tool-shell, error-panel, split-pane, tree-view, data-table, diff-view, copy-button, key-value-editor, busy-indicator, offline-badge, update-badge, file-drop, open-text-file (+ `appTextFileDrop`), save-text-file, category-icon, persistence-opt-in, sandboxed-markdown-preview, dashboard-panel, value-disclosure, disclosure, workbench-charts, preview-background, status-glyph, css-preview-sandbox), `models/` (`ToolDefinition`, `ToolCategory`), `utils/`, `styles/`, and `code-sandbox/`.

## Before building a new UI piece inside a tool folder

Check here first. Several tools already needed the same primitive (e.g. `app-key-value-editor` and `app-copy-button` were extracted specifically so Phase 3's web/API tools didn't each reinvent them) — a genuinely reusable piece belongs here, not duplicated per-tool.

## Appearance: every primitive must work in every theme (Phase 30K)

Dark is the default, but Light, high contrast, six accents, three category palette sets, the color-blind-safe status set and three densities are all live options (`DUDE_PRD.md` §8.1, §8.5, §19). `scripts/check-design-tokens.mjs` runs every rule over this directory (spacing scale, radius, arbitrary sizes, raw hex, raw Tailwind palette colors, `text-bg`, opacity on text colors, resting category wash), and `npm run lint` enforces it.

- **Colors from tokens only.** Text on a filled surface uses `text-on-accent` (the `on-*` token for that fill), never `text-bg`. Don't add a private palette; if a new role is genuinely needed, it goes into `src/styles/theme/theme-tokens.json` (regenerate with `node scripts/generate-theme-css.mjs`) so `check-theme-contrast.mjs` proves it in every combination.
- **Color is never the only cue.** Status surfaces pair their color with `app-status-glyph` (distinct silhouette, `aria-hidden`, beside a text label, never instead of one); `diff-view` carries +/− markers.
- **User documents keep their own colors.** A preview of user HTML/SVG/images uses `app-preview-background` + `[appPreviewBackground]` (Theme / White / Dark / Checker); an iframe hosting such a document uses the `dude-doc-frame` utility so it does not inherit the app's `color-scheme`. `sandboxed-markdown-preview` copies the active theme's resolved tokens into its iframe and rebuilds on `AppearanceService.revision()`.
- **Canvas/chart colors are re-read on `AppearanceService.revision()`** (see `workbench-charts/`); a color read once at init goes stale on the next theme change.
- **User-authored motion:** `css-preview-sandbox`'s `motion` input marks the host `data-motion-exempt`, so the global reduced-motion rule leaves it alone, and under Reduce the preview starts paused with a Play control. Everything else loses animation/transition under Reduce, so never make state depend on an animation finishing.

## `models/`

`tool-category.model.ts` holds the closed 8-value `ToolCategory` set and `tool-definition.model.ts` holds the `ToolDefinition` shape every registry entry must match. Changing either is a framework-layer decision — see the root `/AGENTS.md`'s category rule before adding a value.

## `code-sandbox/`

Has its own `AGENTS.md` — sandboxed untrusted-code execution has sharp, non-obvious edges (CSP, opaque-origin CORS, iframe lifecycle) that only surfaced through live browser testing. Read it before touching anything in that subdirectory or building a new sandboxed-execution tool.
