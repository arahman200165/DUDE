# AGENTS.md — src/app/core/text-file-input/

Framework layer for **Universal File Input** — loading a text/code tool's input straight from a
file, however the file arrives. Like the rest of `core/`, nothing here names a specific tool.

## One manifest declaration, three consumers

A tool opts in with `fileInput: { key, extensions, policy? }` in its own `<id>.manifest.ts`
(`ToolFileInput`, `shared/models/tool-definition.model.ts`). `key` is the tool's own
`PersistenceService.signal(...)` key for its primary text input. That single declaration drives:

1. **Smart File Drop** (`core/file-drop-detect/`) — the dashboard drop zone and the desktop
   window-level drop router rank the tool for those extensions, and `FileDropDeliveryService`
   writes the file's *text* into `key` before navigating (instead of handing off a `File`).
2. **Smart Paste** text-format detectors — the pasted value is written into `key` the same way.
3. **`app-open-text-file`** (`shared/components/open-text-file/`) — defaults its picker filter to
   `extensions`.

Tools that already declare `desktopOpen.inputKey` get (1)–(3) for free: `textFileInputOf(tool)`
falls back to `desktopOpen`'s key and extensions, so never declare the same key twice. Keep
`fileInput` and `desktopOpen` separate otherwise — `desktopOpen.extensions` also registers Windows
file associations (exactly one owner per extension, see `desktop-open-definitions.spec.ts`), while
any number of tools may share a `fileInput` extension. In Smart File Drop ranking, the
`desktopOpen` owner scores `0.85` and `fileInput` tools `0.65`, so the desktop drop router still
auto-opens the canonical tool and the rest appear as alternatives.

## Why pre-navigation storage writes, not a `consume()` call per tool

`TextInputHandoffService.offer` is the exact mechanism `core/platform/desktop-open.service.ts`
already uses for Explorer "Open with DUDE": write the tool's own storage key (via
`workspace-storage-bridge.ts`) so its `persistence.signal(...)` reads it on its normal synchronous
construction-time read. No per-tool code, so a correctly declared `fileInput` can't "forget" to
consume. The value lands exactly where the tool's own policy would have put it had the user typed
it — so `policy` must match the component's declaration (`'session'` default, or
`'user-choice'`); `'none'`-policy inputs can't use this path (use `PasteHandoffService` instead).
`tool-conformance.spec.ts` fails if `key`/`policy` isn't a real `persistence.signal` key in
`<id>.ts`, or if the template never renders `<app-open-text-file>`.

A tool whose text input is **mode-gated** (only rendered in one mode) must `has(toolId)`-check
`TextInputHandoffService` in its constructor and switch into that mode — see `svg-data-uri`.

## Imported-file safety flags

`recordImportedFileFlags(fileName)` (`imported-file-flags.ts`) is called on every path a file's text
enters a tool — Explorer open, Smart File Drop, and tools' own Open file… handlers where it matters
(`html-preview` holds file-sourced HTML behind a manual "Preview file" approval, never auto-running
it). Keyed by extension, not tool id. Add a new flag here, not in one entry path.

## Reading rules (`text-file-read.ts`)

One validator for every path: 10 MB cap, NUL-byte binary sniff (git/grep's heuristic), UTF-16 BOM
rejected with a precise message, UTF-8 BOM stripped. Extensions in a picker's `accept` are a
filter, not a gate — "All files" stays selectable, and a file dropped onto an input is accepted
regardless of extension as long as it's text.
