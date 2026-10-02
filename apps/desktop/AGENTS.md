# AGENTS.md — apps/desktop/

The Electron main process and preload script for DUDE's desktop build (Phase 8 of `DUDE_PRD.md` §21). Compiled to CommonJS by `esbuild` (`npm run electron:compile`), entirely outside `tsconfig.app.json` — this code never ships in the web/GitHub Pages bundle and the Angular renderer never imports from here.

## The rule

The renderer (`apps/web/src/app/`) keeps `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` (set in `main.ts`'s `BrowserWindow` `webPreferences`) — no exceptions. Every capability the renderer needs from the OS (file dialogs, secure storage, IPC to a local backend, etc., as later Phase 8 stages add them) is exposed through `preload.ts`'s `contextBridge.exposeInMainWorld(...)` call, never by relaxing those three flags. Any bundled local backend process this folder starts (the collab server; the renderer itself is served over the `dude-app://` scheme, not a socket) binds `127.0.0.1` only — never an external interface.

## Verification

`npm run test:electron` runs a small, separate Vitest project (`vitest.electron.config.mts`) scoped to `apps/desktop/**/*.spec.ts` — kept out of the main `npm test` run since this directory is deliberately outside `tsconfig.app.json`'s scope. Run it after touching anything here, especially `app-protocol.ts`'s `resolveWithinRoot` (the path-traversal guard for the app protocol handler) or `main.ts`'s `webPreferences` (DUDE_PRD.md §21 Phase 23 Item 9).

## Two build targets, one repo

`main.ts`/`preload.ts`/`app-protocol.ts` are plain TypeScript type-checked by `apps/desktop/tsconfig.json` (ES modules with bundler resolution and Node types; esbuild emits CommonJS) — a sibling to `tsconfig.worker.json`'s precedent for a second narrow build target that must never leak into `tsconfig.app.json`'s `include`. Type-only imports from `apps/web/src/app/` (e.g. `DudeElectronBridge` in `electron-bridge.d.ts`) are fine and erased at build time; runtime imports from `apps/web/src/app/` are not — the two processes only ever talk over `contextBridge`/IPC.

## Renderer origin: `dude-app://app/` (Phase 31B)

The packaged renderer loads from the privileged custom scheme `dude-app` (`app-protocol.ts`): `registerAppSchemePrivileges()` runs at `main.ts` top level (standard, secure, fetch/CORS/stream/codeCache; never `bypassCSP` or `allowServiceWorkers`) and `installAppProtocol(root)` serves `dist/dude/browser` via `protocol.handle` with the same traversal guard and extensionless-to-`index.html` fallback the old loopback server had. The fixed origin keeps localStorage/IndexedDB across launches. `URL.origin`/`location.origin` is `'null'` for this scheme, so build origins as `${location.protocol}//${location.host}` and compare by protocol+host (see `navigation-guard.ts`). The dev server path (`DUDE_ELECTRON_DEV_SERVER_URL`) is unchanged.

## External links: one narrow route out

The renderer can't open windows (`setWindowOpenHandler` denies everything) and `will-navigate` is pinned to the app's own origin. The single exception is `external-link-bridge.ts` (`dude:external:open`, exposed as `window.dude.external.open`), added for Phase 30H.6's user-saved Home links. Main — not the renderer — is the trust boundary: it accepts the request only from this window's own `webContents`, re-validates the URL (absolute `http:`/`https:`, real host, no embedded credentials, ≤ 2048 chars; never `file:`, `javascript:`, `data:`, custom protocol handlers or UNC paths), and only then calls `shell.openExternal` with the normalized href. `main-security.spec.ts` and `external-link-bridge.spec.ts` pin this; widen the allowed schemes only with the same review a new IPC surface gets.

## LLM chat: `dude:llm:chat`

`llm-bridge.ts` performs the user's OpenAI-compatible chat request in main (the old loopback HTTP proxy was removed in Phase 31B: a `dude-app://` renderer can't call it cross-origin). It accepts requests only from this window's `webContents`, strictly validates `{ messages: [{ role, content }] }` (<= 200 messages, <= 1 MB of content, nothing else), reads base URL/model/API key from the secure store in main, times out after 120 s, and returns `{ ok, content | error }` with the key scrubbed from any error. Non-streaming only. `llm-bridge.spec.ts` and `main-security.spec.ts` pin it.

## Native theme sync: `dude:appearance:set`

`appearance-bridge.ts` (`dude:appearance:set`, exposed as `window.dude.appearance.setNative`, Phase 30K) keeps Electron's native chrome in step with the renderer's resolved appearance. Main accepts the request only from this window's own `webContents` and strictly validates the payload (a plain object with exactly `mode: 'dark' | 'light'` and a `#rrggbb` `background`), then sets `nativeTheme.themeSource` and the window background. The last good pair is persisted to `native-appearance.json` under `userData` and applied before the next window is created, so a launch never flashes the wrong background. The renderer side is `AppearanceService` (`apps/web/src/app/core/appearance/`), which calls it only when the resolved pair changes. `appearance-bridge.spec.ts` and `main-security.spec.ts` pin the validation and sender check.

## Windows system helper: `windows-sys.exe` (Phase 31)

One long-lived native helper serves all Windows process/handle/port/registry/service/event-log/SID/ACL/Restart Manager/API-set/minidump work. Source is `native/windows-sys/*.cpp` (one file per family plus `rpc.cpp`); `scripts/build-network-helper.ps1` (`npm run electron:helper`, run automatically before `electron:dev`/`start`/`package`) compiles the whole folder by wildcard, so a new `.cpp` needs no build edit. It ships through `electron-builder.yml` `extraResources`. `sys-helper.ts` owns the lifecycle: spawn with `shell: false, windowsHide: true`, request ids, per-call timeout, output cap, lazy restart after a crash, shutdown on quit.

**The renderer read path is a closed allowlist.** `SYS_READ_METHODS` (`packages/contracts/src/system/system-types.ts`) plus the per-method validators in `sys-validation.ts` gate every `dude:sys:*` read handled by `sys-bridge.ts`. Mutating helper methods (terminate, `reg.setValue`, `svc.control`, `acl.set`, `proc.dump`, ...) are absent from that list, so they are never renderer-callable; only `sys-mutation.ts` ops (and `sys-bundle.ts` for its private staging dump) call them.

Adding a read method end to end: implement it in the matching `native/windows-sys/*.cpp`; add the name to `SYS_READ_METHODS` and its result type to `system-types.ts`; add a bounded-input validator in `sys-validation.ts` (and to `sys-validation.spec.ts`); expose it through `sys-bridge.ts`/`preload.ts`/`electron-bridge.d.ts` and `SystemInfoService` (plus `testing/fake-electron-bridge.ts`). Never widen the allowlist to make a write reachable.

## System mutation engine: `sys-mutation` (Phase 31)

The second local implementation of `DUDE_PRD.md` §5.2.1. `mutation-core.ts` (plan/token `ConfirmationStore`, digest, atomic `JsonJournal`, pruning) is shared with `fs-mutation.ts`; `fs-mutation.spec.ts` must keep passing unmodified. `sys-mutation.ts` is the generic pipeline (preview, 60 s single-use token bound to window and digest, apply, journal, previewed undo) and knows nothing about specific operations. Ops are registered per family in `sys-ops/*.ts` and wired in `sys-ops/index.ts` through `registerBuiltinSysOps` (called after the registry exists, which avoids a circular-import TDZ). Each `SysOpDefinition` supplies `validate`, `requiresElevation`, optional `typedConfirm` (checked in main at `issueToken`, not only in the UI), `preview`, `precondition`, `apply`, and `inverse` or `noUndo`. **Tools never add engine branches**: a new operation is a new file (or entry) in `sys-ops/` plus a registration line. The journal lives at `userData/sys-journal/`, backups at `userData/sys-backups/`, snapshots (`sys-snapshots.ts`) at `userData/system-snapshots/<kind>/`. Every mutating route needs a colocated `<id>.confirmation-boundary.spec.ts` using `recordingSysBridge()`, and its ops need engine-level specs (token replay, conflict, typed-confirm bypass, elevation rejection, undo round trip).

## PowerShell 7 fixed scripts: `sys-pwsh.ts` (Phase 31)

Scheduled tasks, Windows features, Appx packages and Local Network neighbors/routes/interfaces run as fixed scripts on **pwsh 7 only** (Windows PowerShell 5.1 is not used). Detection order: `PATH`, then `%ProgramFiles%\PowerShell\7\pwsh.exe`, then the `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` App Execution Alias (winget installs pwsh as MSIX). `existsSync` is false for that alias, so detection uses `lstat`. Arguments reach a script **only** as a base64-JSON parameter decoded with `ConvertFrom-Json`; never interpolate a value into script text. Importing the DISM module needs elevation, so feature listing uses `Get-CimInstance Win32_OptionalFeature`, and DISM cmdlets run only for elevated changes. A missing pwsh shows the "PowerShell 7 required" notice on the affected views only.

## Other Phase 31 main-side modules

- `powershell-workbench.ts`: PowerShell Builder execution. Uses `ConfirmationStore` with a token bound to the script's SHA-256; the script goes to pwsh via a stdin bootstrap (no shell, no temp file); history is metadata only and restoring never reruns.
- `sys-bundle.ts`: Process Diagnostic Bundle. Main re-collects each section, stages the minidump privately and streams the ZIP with fflate to a path holding a single-use save grant. Phase 35's system-wide bundle should reuse it.
- `sys-snapshots.ts`: the snapshot library (env, path, registry, process-env), stored as-is with no redaction.
- `elevation-bridge.ts`: `dude:elevation:status`/`relaunch` (Relaunch as Administrator), shared by Local Network and every system route.
- `fs-grants.ts`: besides folder grants, `grantSavePath`/`consumeSavePath` give a single-use, exact-file write grant from the native save dialog (`dude:fs:pickSavePath`); any main-side write to a user-chosen file must consume one.
- `dependency-walker.ts`: reads PE headers only (bounded) of DLLs resolved through the search order.
