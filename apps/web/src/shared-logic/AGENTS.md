# AGENTS.md — apps/web/src/shared-logic/

Pure, framework-free logic shared by the Angular renderer, Electron main process, and Phase 29 filesystem utility process. This directory is the runtime-import exception to `apps/desktop/AGENTS.md`'s rule against importing from `apps/web/src/app/`. The `fs/` subfolder holds shared path filters, Git ignore rules, mutation/watch types and pure formatting or comparison logic. Streaming hash logic lives in `hash-compute.ts` at this directory's root.

## When something belongs here

Move a transform here when a second consumer across a tool or process boundary actually uses it. Keep Electron APIs, Node filesystem calls, Angular and DOM-only behavior outside this directory. Pure helpers can be added here directly when the main process and utility process both need the same rule; a tool's local UI glue stays with that tool.

## Rules

- No Angular imports (`@angular/*`), no DOM-only globals (`document`, `window`, `localStorage`) — only globals available in both a browser tab and Node (e.g. `TextEncoder`, `crypto.subtle`, `btoa`/`atob`).
- Keep the file exactly as pure as it was inside its tool folder — moving it here is a relocation, not a rewrite.
- The owning tool imports from here instead of copying the rule. Keep tool-specific UI glue in that tool's folder.

## Phase 22 boundary audit (Milestone 304)

DUDE_PRD.md Phase 22 Item 5 asked for an audit of whether any other platform-neutral
transform logic across the 277 tools is duplicated across the `apps/web/src/app/` ↔ `apps/desktop/`
process boundary. Checked every `apps/desktop/*-bridge.ts`/`*-server.ts` file against the tools
whose domain it touches (hashing, encoding, archives, collab/CRDT, secrets, file/window
chrome) — the only cross-process consumer at the time was `hotkey-bridge.ts`'s clipboard
quick actions, already covered by `base64-codec.ts` and `hash-compute.ts` (which itself
depends on `crc.ts` internally — that's a same-folder import, not a second unmoved
duplicate; `crc.ts` isn't dead code despite having no direct importer outside this folder).
No other bridge file reimplemented logic a tool already owned. Phase 29 later added the `fs/` shared consumers. The boundary was correctly drawn as of the Milestone 304 audit — no additional moves needed. Re-audit if a future Electron-only feature (or a CLI/VS Code/browser-extension surface, once one exists) starts
duplicating a tool's transform logic rather than importing it from here.
