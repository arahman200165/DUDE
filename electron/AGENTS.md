# AGENTS.md — electron/

The Electron main process and preload script for DUDE's desktop build (Phase 8 of `DUDE_PRD.md` §21). Compiled to CommonJS by `esbuild` (`npm run electron:compile`), entirely outside `tsconfig.app.json` — this code never ships in the web/GitHub Pages bundle and the Angular renderer never imports from here.

## The rule

The renderer (`src/app/`) keeps `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` (set in `main.ts`'s `BrowserWindow` `webPreferences`) — no exceptions. Every capability the renderer needs from the OS (file dialogs, secure storage, IPC to a local backend, etc., as later Phase 8 stages add them) is exposed through `preload.ts`'s `contextBridge.exposeInMainWorld(...)` call, never by relaxing those three flags. Any bundled local backend process this folder starts (the static server today; the LLM proxy and collab server in later stages) binds `127.0.0.1` only — never an external interface.

## Verification

`npm run test:electron` runs a small, separate Vitest project (`vitest.electron.config.mts`) scoped to `electron/**/*.spec.ts` — kept out of the main `npm test` run since this directory is deliberately outside `tsconfig.app.json`'s scope. Run it after touching anything here, especially `static-server.ts`'s `resolveWithinRoot` (the path-traversal guard shared by the static server and `fs-bridge.ts`) or `main.ts`'s `webPreferences` (DUDE_PRD.md §21 Phase 23 Item 9).

## Two build targets, one repo

`main.ts`/`preload.ts`/`static-server.ts` are plain TypeScript type-checked by `electron/tsconfig.json` (CommonJS, Node types) — a sibling to `tsconfig.worker.json`'s precedent for a second narrow build target that must never leak into `tsconfig.app.json`'s `include`. Type-only imports from `src/app/` (e.g. `DudeElectronBridge` in `electron-bridge.d.ts`) are fine and erased at build time; runtime imports from `src/app/` are not — the two processes only ever talk over `contextBridge`/IPC.

## External links: one narrow route out

The renderer can't open windows (`setWindowOpenHandler` denies everything) and `will-navigate` is pinned to the app's own origin. The single exception is `external-link-bridge.ts` (`dude:external:open`, exposed as `window.dude.external.open`), added for Phase 30H.6's user-saved Home links. Main — not the renderer — is the trust boundary: it accepts the request only from this window's own `webContents`, re-validates the URL (absolute `http:`/`https:`, real host, no embedded credentials, ≤ 2048 chars; never `file:`, `javascript:`, `data:`, custom protocol handlers or UNC paths), and only then calls `shell.openExternal` with the normalized href. `main-security.spec.ts` and `external-link-bridge.spec.ts` pin this; widen the allowed schemes only with the same review a new IPC surface gets.

## Native theme sync: `dude:appearance:set`

`appearance-bridge.ts` (`dude:appearance:set`, exposed as `window.dude.appearance.setNative`, Phase 30K) keeps Electron's native chrome in step with the renderer's resolved appearance. Main accepts the request only from this window's own `webContents` and strictly validates the payload (a plain object with exactly `mode: 'dark' | 'light'` and a `#rrggbb` `background`), then sets `nativeTheme.themeSource` and the window background. The last good pair is persisted to `native-appearance.json` under `userData` and applied before the next window is created, so a launch never flashes the wrong background. The renderer side is `AppearanceService` (`src/app/core/appearance/`), which calls it only when the resolved pair changes. `appearance-bridge.spec.ts` and `main-security.spec.ts` pin the validation and sender check.
