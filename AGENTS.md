# AGENTS.md — DUDE

DUDE is a dark-first, themeable, dense developer workbench built with Angular 22 (standalone components, signals, Tailwind v4) bundling client-side developer micro-tools, shared between a canonical Windows Electron desktop app and a zero-install, offline-capable GitHub Pages/PWA web companion. Read `README.md` for architecture/tech stack and `DUDE_PRD.md` for the full spec and tool roadmap before making non-trivial changes.

Nested `AGENTS.md` files exist under `src/app/` (`core/`, `shell/`, `shared/`, `tools/`) with directory-specific rules — read the one for whatever directory you're editing.

## The one rule that matters most

Adding or changing a tool must never require editing `src/app/shell/`, `src/app/core/routing/app.routes.ts`, or any other core/shell file. Every tool owns its metadata in a colocated `<id>.manifest.ts` (`src/app/tools/<id>/`); `npm run generate:registry` assembles them into `TOOL_DEFINITIONS` (`src/app/core/registry/tool-definitions.ts`, generated — never hand-edited), from which the sidebar, deck, search, command palette, and routes are all generated. If following `ADDING_A_TOOL.md` ever forces a shell/core edit, that's an architecture bug — fix the architecture, don't route around it.

**Read `ADDING_A_TOOL.md` before adding any tool.** It's the step-by-step recipe (file layout, registry entry, persistence/worker/network policy, verification), worked against the real `base64` tool.

## Conventions an agent must follow here

- **Categories are closed.** `ToolCategory` (`src/app/shared/models/tool-category.model.ts`) has exactly 8 values (`data, text, encoding, security, date-time, web, developer, documents`). Adding a new one is a bigger decision than adding a tool — check `DUDE_PRD.md` §21's domain map first; a tool's literal name can be misleading (e.g. Color Converter → `encoding`, not a hypothetical "design" category).
- **Dependency-minimal by default.** Prefer native Web APIs (`URLSearchParams`, `crypto.randomUUID`, `BigInt`, `Intl.*`, a detached `<textarea>` for HTML parsing) over libraries. Reach for a small library only for genuinely fiddly, easy-to-get-subtly-wrong logic (color-space math, unicode transliteration, cron math) — see `DUDE_PRD.md` §17 and the library list in `README.md`.
- **Git history convention:** each tool ships as its own commit directly to `master`, no feature branches/PRs, message format `Milestone N: <Tool Name>`. Check `git log --oneline | grep -i milestone` for the current highest number before picking the next one. Framework-layer/doc-only changes get their own milestone numbers too.
- **Testing posture:** "protect the framework, not chase coverage" (`DUDE_PRD.md` §18). Unit-test every tool's pure transform logic; don't add component/e2e tests just for coverage.
- **Verify before calling a tool done:** run `ng serve` and confirm sidebar/search/command-palette (`Ctrl+K`) discovery; run `npm test` and `npm run lint`; after `ng build`, hard-navigate the production build's direct route (`/DUDE/tools/<id>`) to catch anything relying on client-side router state a fresh load wouldn't have.
- **Appearance/tokens.** Dark is the default, but every color must work in every theme, contrast mode and palette set (`DUDE_PRD.md` §8.1, §8.5, §19). Colors come only from theme tokens: no private palettes, no raw Tailwind palette colors (`text-red-400`, `bg-white`), no hex in templates/stylesheets, no opacity modifier on a text color. Text on a filled surface uses `text-on-*` (`text-on-accent`), never `text-bg`. Tools that preview a user's document (HTML, SVG, images) frame it with the shared preview-background primitive (`app-preview-background` + `[appPreviewBackground]`) rather than forcing the app theme onto it. Canvas/chart code that reads token colors must re-read them when `AppearanceService.revision()` changes. Appearance values live in `src/styles/theme/theme-tokens.json`; run `node scripts/generate-theme-css.mjs` (also part of `npm run generate:registry`) and never hand-edit `theme.generated.css` or `appearance-axes.generated.ts`. `npm run lint` runs the design-token lint and the `check-theme-contrast.mjs` WCAG matrix, and both must pass.
- **Destructive actions require the full contract, not just a confirm dialog.** Any tool that mutates the filesystem, a process, the registry, or a database must follow `DUDE_PRD.md` §5.2.1's Destructive-Action Contract (two-step preview/confirm, no incidental triggering, `ConsequenceClass` tagging, a confirmation-boundary test) before it ships.

## Key docs

- `README.md` — architecture, tech stack, PWA/offline model, deployment.
- `DUDE_PRD.md` — full product spec; §21 (Roadmap) maps every shipped and proposed tool to a phase and category.
- `ADDING_A_TOOL.md` — the canonical add-a-tool recipe. Read it first for any tool work.
- `SECURITY.md` — generated high-consequence tool matrix and network/native capability disclosure (`scripts/generate-security-doc.mjs`); never hand-edit its tables.
