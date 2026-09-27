# AGENTS.md — src/app/core/file-drop-detect/

Framework layer for Smart File Drop (`DUDE_PRD.md` §21 Phase 24 Item 4). Like the rest of `core/`,
no file here ever names a specific tool by id in a comment or branch of logic —
`FILE_DROP_DETECTORS` is data, not control flow.

## Three signals, ranked, not a single deterministic match

Unlike `core/platform/desktop-open.service.ts` (the OS-file-association "Open with DUDE" flow —
first extension match wins, auto-navigates, and stays completely unmodified by this feature), Smart
File Drop shows a **ranked list of candidates** from three independent signals:

1. A curated, hand-maintained magic-byte/format detector array (`FILE_DROP_DETECTORS`,
   `file-drop-detectors.ts`) — mirrors `core/paste-detect/paste-detectors.ts`'s shape and rationale
   exactly: only a deliberately curated subset of tools has a signature unambiguous enough to detect
   from bytes alone, reusing the shared, already-generic `sniffFileType`/`identifyZipContainer`
   (`shared/utils/file-signatures.ts` — not tool-owned, no extraction needed).
2. A registry-driven extension match against every tool's own `desktopOpen.extensions` — the exact
   same field `desktopOpen.service.ts` reads, just consumed generically here (no hand-curation
   needed, since it's already declared per-tool metadata).
3. `declaredMime` (the browser-supplied `File.type`) is captured in `FileDropContext` for
   transparency/future use but isn't an independent scoring signal today — for the text-based
   formats it would help with (JSON/YAML/XML/CSV/INI/TOML), the extension-based `desktopOpen` check
   above already covers the same tools; sniffed magic bytes are authoritative wherever they exist.

A dropped file with no extension and no recognized signature still gets two universal fallbacks
(`file-hash`, `file-base64`, both `0.3`, the lowest score in the table) — every file, recognized or
not, can be hashed or Base64-encoded.

## `FileDropHandoffService` prefill is generic, consumed by `app-file-drop` itself

`file-drop-handoff.service.ts` mirrors `core/paste-detect/paste-handoff.service.ts`, except it
hands off a real `File` (which can't round-trip through `PersistenceService`'s JSON storage) —
never persisted, one-shot, in-memory only. **No tool calls `consume()` itself.** The shared
`app-file-drop` primitive (`shared/components/file-drop/`) resolves the tool it's mounted in
(`core/registry/current-tool.ts` — Workspace host context, else the route) and, after first render,
consumes any pending file for that tool and runs it through exactly the same validation/emit path
as a real drop. Every tool with a file input (including `app-binary-format-viewer`, which wraps it)
therefore receives a dashboard/global drop with zero per-tool wiring, the widget shows the
handed-off file's name, and the tool processes it exactly as if the user had dropped it there.

Two rules keep that generic path honest:

- **A tool whose file input is conditionally rendered** (a mode toggle) must `has(toolId)`-check in
  its constructor and switch into the mode that renders it — see `file-base64` (encode) and
  `archive-tool` (extract). Without that, the widget never mounts and the file silently vanishes.
- **The first `app-file-drop` to render wins.** A tool with a secondary file input that should never
  claim the hand-off sets `[acceptHandoff]="false"` on it.

A candidate with a declared *text* input (`fileInput`, or a `desktopOpen.inputKey` — see
`core/text-file-input/AGENTS.md`) is not handed a `File` at all: `FileDropDeliveryService` reads the
file as text and writes it into that input instead. Both drop surfaces (`smart-file-drop-zone`,
`global-drop-router`) go through that one service — never call either hand-off service directly.

## Why this needs a curated array, not per-tool convention files

Same reasoning as `core/paste-detect/AGENTS.md`: a drop has to be checked against every detector at
once to rank candidates, and only a small subset of tools has a magic-byte signature worth curating
(most of the 277 tools are pure text-transform tools with no meaningful "is this my file type"
check). Don't add a `<id>.file-drop-detect.ts` convention file to "scale" this — it would reintroduce
the exact per-drop dynamic-import latency problem the paste-detection precedent already avoided.
