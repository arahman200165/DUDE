# AGENTS.md — apps/web/src/app/core/home-layout/

Framework layer for the user-designed Home (`DUDE_PRD.md` §21 Phase 30I). The shell-side contract (Home vs Browse Tools, panel manifests, editor, dashboard conventions) is in `apps/web/src/app/shell/deck/AGENTS.md`. Like the rest of `core/`, **no file here names a specific panel kind or tool id** — kinds come from the generated panel registry (`core/registry/panel-definitions.ts`), and a spec (`home-layout-framework.spec.ts`) fails if a registered kind id appears in this directory's sources.

## Pieces

- `grid-engine.ts` — pure 12-column snapping engine (clamp, collisions, `tryPlace` with a readable result, `firstFit`, `normalizeLayout`, `deriveNarrow`, `moveInReadingOrder`). It is the source of truth for validity; a pointer UI (gridstack) only *proposes* placements and must route them through `tryPlace`.
- `panel-validation.ts` / `panel-config.ts` / `panel-availability.ts` — declaration checks, typed per-instance config, and platform gating (`omit` vs `explain`, no blank cells).
- `default-layout.ts` — the shipped default, assembled from manifests' `defaultPlacement` alone.
- `home-layout-store.model.ts` + `home-layout.service.ts` — the versioned store (`'__home-layout__'` namespace, so Clear All covers it) and its sanitize/migrate/merge rules.
- `user-content.model.ts` — text / link / shortcut panel content.

## Rules

- **Presentation state only.** The store holds instances (id + kind id + small typed config), per-width placements, visibility, and user-authored content. It never copies tool metadata, usage, favorites, recents, projects, workspaces, pipelines or command lists — panels resolve those live from their authoritative services. Shortcut targets are *ids*.
- **Nothing executes on load.** Restoring, importing or mounting a layout/shortcut panel never runs a pipeline, native operation or command. Only an explicit click does, through that target's existing confirmation path.
- **User content is plain text.** Never rendered as markup. Links are http(s) only with no credentials (`normalizeExternalUrl`), and external links open only from a click (`ExternalLinkService`).
- **Untouched installs store no layout.** No instances or placements are persisted (`customized: false`; only in-panel content edits may exist), so they render the manifest default, so newly shipped kinds appear for them; once a layout is saved, later kinds show up only in the picker.
- **Recovery, not blanking.** Unknown kinds are kept as dormant instances (renamed kinds map through `replaces`); bad placements are repaired; corrupt data degrades to the default. Schema is `HOME_LAYOUT_SCHEMA_VERSION = 1` (`MAX_INSTANCES = 60`); `migrateHomeLayoutStore` resets an older/garbage `schemaVersion` to the empty (default) store, so a bump must add a real migration. A *newer* version (written by a newer build) is read best-effort with the v1 sanitizer and **never written back on load** (`isNewerHomeLayoutSchema`; the service keeps the stored record untouched and renders a sanitized in-memory view). Only an explicit user save/reset/import replaces it (as v1).
- **Reset to Default is layout-only.** It never touches favorites/usage/projects/workspaces/pipelines; it drops content of user panels that aren't part of the default.
- **Backup:** exported as the optional `homeLayout` bundle section (schema version unchanged — additive) and re-sanitized against the registry on parse and apply.
