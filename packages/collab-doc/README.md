# @dude/collab-doc

Private internal package. The portable, browser-safe Yjs mapping for DUDE's collaborative documents (Phase 31J, PD-099/PD-101/PD-105/PD-106): scratchpad snippets (title and body), the user-script `body`, and Markdown Workspace rooms and `markdown-doc` records.

- `doc-key`: the closed `COLLAB_DOC_KINDS` and `kind:id` keys.
- `text-apply`: `applyTextTo` turns a plain-text change into a minimal multi-hunk `Y.Text` edit, so concurrent edits elsewhere survive.
- `schemas/`: per kind `seed` (Hub only, first load), `materialize` (the plain record payload; non-collaborative fields stay from the current record), `restoreAsForwardEdit`, and `contentBytes` for the record size cap.
- `frames`: the `[channel][kind][payload]` binary frame.
- `awareness`: the awareness state shape, its strict validator, and the Hub's `rewriteAwarenessUpdate`.
- `transport`: the `CollabTransport` contract (PD-114) between the web collaboration service and its Hub web, desktop relay or unavailable adapter: link events, subscription controls, down reasons.

Only `apps/hub` and `apps/web` consume it. Android never collaborates and the Device Agent relays opaque bytes, so neither may depend on it.
