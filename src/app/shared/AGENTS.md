# AGENTS.md — src/app/shared/

Cross-tool primitives: `components/` (tool-shell, error-panel, split-pane, tree-view, data-table, diff-view, copy-button, key-value-editor, busy-indicator, offline-badge, update-badge, file-drop, open-text-file (+ `appTextFileDrop`), save-text-file, category-icon, persistence-opt-in, sandboxed-markdown-preview, dashboard-panel), `models/` (`ToolDefinition`, `ToolCategory`), `utils/`, `styles/`, and `code-sandbox/`.

## Before building a new UI piece inside a tool folder

Check here first. Several tools already needed the same primitive (e.g. `app-key-value-editor` and `app-copy-button` were extracted specifically so Phase 3's web/API tools didn't each reinvent them) — a genuinely reusable piece belongs here, not duplicated per-tool.

## `models/`

`tool-category.model.ts` holds the closed 8-value `ToolCategory` set and `tool-definition.model.ts` holds the `ToolDefinition` shape every registry entry must match. Changing either is a framework-layer decision — see the root `/AGENTS.md`'s category rule before adding a value.

## `code-sandbox/`

Has its own `AGENTS.md` — sandboxed untrusted-code execution has sharp, non-obvious edges (CSP, opaque-origin CORS, iframe lifecycle) that only surfaced through live browser testing. Read it before touching anything in that subdirectory or building a new sandboxed-execution tool.
