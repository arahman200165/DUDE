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

## `FileDropHandoffService` prefill is opt-in, same as Smart Paste's `consume()` calls

`file-drop-handoff.service.ts` mirrors `core/paste-detect/paste-handoff.service.ts` exactly, except
it hands off a real `File` (which can't round-trip through `PersistenceService`'s JSON storage) —
never persisted, one-shot, in-memory only. A candidate tool must explicitly call
`fileDropHandoff.consume(toolId)` in its own constructor to actually receive the dropped file; a
tool with no such call is still a perfectly valid candidate to navigate to, it just won't be
prefilled — exactly the same honest, incremental-adoption model `core/paste-detect/AGENTS.md`
documents for Smart Paste's 11 curated tools. Today only `file-hash` and `file-base64` opt in, as a
proof of concept — most of the other candidates in `FILE_DROP_DETECTORS` (the format-specific
binary viewers especially) do not yet, and that is a normal, expected gap to close incrementally,
not a bug to "fix" all at once.

## A prefilled tool's own `app-file-drop` widget stays visually empty — known, not a bug

`FileHash`/`FileBase64`'s `consume()` call correctly sets their own `selectedFile` signal (verified
end-to-end in-browser: "Compute" becomes enabled and produces the right hash for the handed-off
file), but the shared `app-file-drop` primitive they render (`shared/components/file-drop/`) keeps
its own independent internal `selectedFile` signal, populated only by a real drag-drop or file-input
event — it has no input for "a file was already selected some other way." A tool receiving a hand-
off is therefore functionally correct but still shows `app-file-drop`'s empty-state placeholder
text. Giving `FileDrop` an external "preselected file" input would touch a primitive with 28+ call
sites — out of scope for this proof of concept; revisit only if/when more tools opt into this
hand-off and the cosmetic gap becomes worth the shared-component change.

## Why this needs a curated array, not per-tool convention files

Same reasoning as `core/paste-detect/AGENTS.md`: a drop has to be checked against every detector at
once to rank candidates, and only a small subset of tools has a magic-byte signature worth curating
(most of the 277 tools are pure text-transform tools with no meaningful "is this my file type"
check). Don't add a `<id>.file-drop-detect.ts` convention file to "scale" this — it would reintroduce
the exact per-drop dynamic-import latency problem the paste-detection precedent already avoided.
