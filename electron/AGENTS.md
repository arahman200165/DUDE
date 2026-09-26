# AGENTS.md — electron/

The Electron main process and preload script for DUDE's desktop build (Phase 8 of `DUDE_PRD.md` §21). Compiled to CommonJS by `esbuild` (`npm run electron:compile`), entirely outside `tsconfig.app.json` — this code never ships in the web/GitHub Pages bundle and the Angular renderer never imports from here.

## The rule

The renderer (`src/app/`) keeps `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` (set in `main.ts`'s `BrowserWindow` `webPreferences`) — no exceptions. Every capability the renderer needs from the OS (file dialogs, secure storage, IPC to a local backend, etc., as later Phase 8 stages add them) is exposed through `preload.ts`'s `contextBridge.exposeInMainWorld(...)` call, never by relaxing those three flags. Any bundled local backend process this folder starts (the static server today; the LLM proxy and collab server in later stages) binds `127.0.0.1` only — never an external interface.

## Verification

`npm run test:electron` runs a small, separate Vitest project (`vitest.electron.config.mts`) scoped to `electron/**/*.spec.ts` — kept out of the main `npm test` run since this directory is deliberately outside `tsconfig.app.json`'s scope. Run it after touching anything here, especially `static-server.ts`'s `resolveWithinRoot` (the path-traversal guard shared by the static server and `fs-bridge.ts`) or `main.ts`'s `webPreferences` (DUDE_PRD.md §21 Phase 23 Item 9).

## Two build targets, one repo

`main.ts`/`preload.ts`/`static-server.ts` are plain TypeScript type-checked by `electron/tsconfig.json` (CommonJS, Node types) — a sibling to `tsconfig.worker.json`'s precedent for a second narrow build target that must never leak into `tsconfig.app.json`'s `include`. Type-only imports from `src/app/` (e.g. `DudeElectronBridge` in `electron-bridge.d.ts`) are fine and erased at build time; runtime imports from `src/app/` are not — the two processes only ever talk over `contextBridge`/IPC.
