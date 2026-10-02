# AGENTS.md — apps/web/src/app/tools/

Every subfolder here is one isolated tool. Full recipe: `/ADDING_A_TOOL.md` (repo root) — read it before adding or restructuring a tool. This file is the short version.

## Ownership and registration

Angular components/templates and literal lazy `<id>.bindings.ts` loaders live here. Portable transforms, fixtures and pure tests live in their package owner, normally `packages/tool-engine/src/tools/<id>/`. Browser workers and DOM/Canvas/WASM/sandbox adapters remain application code.

Each tool has one `manifest: ToolMetadata` in `packages/tool-registry/src/tools/<id>/<id>.manifest.ts`. Metadata contains no functions or implementation imports. `npm run generate:registry` discovers metadata and bindings, generates Angular definitions and literal step/worker maps, and updates discovery/documentation. Never manually register a tool in core/shell. Follow the root recipe for dependencies and package checks.

## Component shell

Wrap content in `<app-tool-shell>` (`apps/web/src/app/shared/components/tool-shell/`) — no inputs needed. Its title, status badge, and (by default) network-required badge resolve directly from the registered `ToolDefinition`; only pass `[networkRequired]="expr()"` if the tool's network need is a genuinely dynamic runtime condition (see `jwt-verify`, `markdown-workspace`, `package-metadata-inspector`, or `text-inspector`).

## Colors and appearance

Tools render in every theme (Dark default, Light), contrast mode, accent and palette set, so use theme tokens only (`bg-panel`, `text-text-muted`, `text-error`, `text-cat-*`, …). `scripts/check-design-tokens.mjs` (in `npm run lint`) fails a tool on raw Tailwind palette colors, `text-bg` (use `text-on-accent` on accent fills), an opacity modifier on a text color, or hex in its `.html`/`.css`; hex in `.ts` stays allowed as tool data. Previews of the user's own HTML/SVG/images use the shared preview-background primitive; user-authored animation previews pass `[motion]="true"` to `app-css-preview-sandbox`; charts re-read colors on `AppearanceService.revision()`. Details: `ADDING_A_TOOL.md` step 3 and `apps/web/src/app/shared/AGENTS.md`.

## Persistence / worker / network policy

- Raw user input → `session`; UI preferences (mode, indent, algorithm) → `local`; anything sensitive → `none` (see `jwt`'s entry for the pattern).
- Worker dispatch: `required` for anything always-slow (hash, regex, diff); `optional` above a size threshold (see `json.ts`'s `WORKER_THRESHOLD` pattern) otherwise.
- Network access defaults to false; per PRD §35 there's no backend or API-key infrastructure wired in yet, so think hard before requiring it.

Full detail and code snippets for all of the above: `ADDING_A_TOOL.md` steps 2, 4–6.

## Sandboxed/executable tools

If the tool needs to run untrusted code (JS/HTML/templates/Python-style execution), read `apps/web/src/app/shared/code-sandbox/AGENTS.md` first — there are three non-obvious CSP/CORS/iframe gotchas that only show up in real browser testing, not unit tests.

## Platform and parity metadata

Declare desktop features and optional web runtimes in the manifest's `capabilities` field, using the closed vocabulary in `@dude/shared-types/tool-capability.model`. A high-use web tool may opt into a generated PWA shortcut with `pwaShortcut: { order: N }` (maximum 10). A tool with a `<id>.pipeline-step.ts` is covered by the registry-wide parity suite; add `<id>.parity-fixtures.ts` for meaningful deterministic vectors. Every `web: 'fallback'` capability needs a colocated `<id>.parity.spec.ts` comparing the web and native adapter results. See `ADDING_A_TOOL.md` for the fixture shape.
