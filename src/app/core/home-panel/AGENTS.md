# AGENTS.md — src/app/core/home-panel/

Framework layer for the Home "Notes & links" panel (`DUDE_PRD.md` §21 Phase 30H.6). Like the rest of
`core/`, no file here names a specific tool by id.

## User-authored content, not usage metrics

This is the one Home store that holds text the user typed. It is deliberately separate from
`core/usage/` (which may only ever hold tool ids, counts and dates) and follows different rules:

- **Persisted locally on purpose**, under the synthetic `'__home__'` pseudo-tool-id via
  `PersistenceService.signal(..., 'local', ..., { crossTab: 'live' })`. `clearAll()` removes it, so
  Settings › Data & Privacy › "Clear all local data" covers it with no extra code.
- **Included in the backup bundle** (`core/backup/`, optional `homePanel` section) — unlike usage
  stats, which are never exported. Import re-sanitizes it (`sanitizeHomePanel`) and honors the
  skip / replace / keep-both conflict modes (`mergeHomePanel`).
- **Never sent to a service.** Opening a saved link is an explicit user click that contacts that
  link's own destination; nothing here fetches or previews a URL. On desktop the click is routed through
  `ExternalLinkService` → `window.dude.external.open` (see `electron/AGENTS.md`), where main validates again.
- **Bounded, plain text.** Note ≤ `MAX_NOTE_CHARS`, ≤ `MAX_LINKS` links, label/URL length caps. The
  note is rendered as text (no HTML/markdown). Links must be absolute `http:`/`https:` with no
  embedded credentials (`normalizeExternalUrl`) — stored, imported, and hand-edited values are all
  re-validated, so a `javascript:`/`data:` URL can't be persisted and later navigated to.
- The editor states this plainly ("stored on this device, never sent, included in backups").

Never feed this content to usage/analytics code, and never derive a dashboard metric from it.
