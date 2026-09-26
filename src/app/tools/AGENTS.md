# AGENTS.md — src/app/tools/

Every subfolder here is one isolated tool. Full recipe: `/ADDING_A_TOOL.md` (repo root) — read it before adding or restructuring a tool. This file is the short version.

## File layout

Mirror an existing tool of similar shape (`base64/` for a simple codec, `json/` for a worker-backed tool with a size threshold, `uuid/` for something with more surface area):

```
src/app/tools/<id>/
  <id>.ts              — Angular standalone component
  <id>.html
  <id>.manifest.ts      — the tool's ToolDefinition (its only registration point)
  <id>-<logic>.ts       — pure, framework-free transform (no Angular imports)
  <id>-<logic>.spec.ts  — plain Vitest describe/it, zero TestBed
  <id>.worker.ts        — only if the transform needs to run off-thread
```

Keeping the transform pure and framework-free is what lets it run unmodified on the main thread *and* inside a Worker.

## Registration is a colocated manifest file, nothing else

Create exactly one `<id>.manifest.ts` exporting `manifest: ToolDefinition`, colocated with the tool's own component (DUDE_PRD.md §21 Phase 22 Item 1 — distributed manifests, not a shared multi-thousand-line array). `npm run generate:registry` (already wired into `pretest`/`prestart`/`prebuild`) assembles every tool's manifest into `src/app/core/registry/tool-definitions.ts`, which is generated and should never be hand-edited. Never touch `src/app/shell/` or `src/app/core/routing/app.routes.ts` to wire up a new tool — the route, sidebar entry, and search/command-palette indexing all follow automatically from that one file.

## Component shell

Wrap content in `<app-tool-shell>` (`src/app/shared/components/tool-shell/`) — no inputs needed. Its title, status badge, and (by default) network-required badge resolve directly from the registered `ToolDefinition`; only pass `[networkRequired]="expr()"` if the tool's network need is a genuinely dynamic runtime condition (see `jwt-verify`, `markdown-workspace`, `package-metadata-inspector`, or `text-inspector`).

## Persistence / worker / network policy

- Raw user input → `session`; UI preferences (mode, indent, algorithm) → `local`; anything sensitive → `none` (see `jwt`'s entry for the pattern).
- Worker dispatch: `required` for anything always-slow (hash, regex, diff); `optional` above a size threshold (see `json.ts`'s `WORKER_THRESHOLD` pattern) otherwise.
- Network access defaults to false; per PRD §35 there's no backend or API-key infrastructure wired in yet, so think hard before requiring it.

Full detail and code snippets for all of the above: `ADDING_A_TOOL.md` steps 2, 4–6.

## Sandboxed/executable tools

If the tool needs to run untrusted code (JS/HTML/templates/Python-style execution), read `src/app/shared/code-sandbox/AGENTS.md` first — there are three non-obvious CSP/CORS/iframe gotchas that only show up in real browser testing, not unit tests.
