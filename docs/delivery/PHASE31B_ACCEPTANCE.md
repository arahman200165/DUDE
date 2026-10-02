# Phase 31B implementation and acceptance evidence

Status: automated acceptance complete; one manual installed-build verification pass is still owed (see [Owed manual verification](#owed-manual-verification)). Implementation is recorded as Milestones 616–626 plus a gate-fix commit, with Milestone 627 closing the phase (data-scope inventory classification, documentation, decision records and this evidence). No Hub, registration handshake, synchronization, replay or conflict handling exists yet: those are Phases 31C/31D. No deployment or publication is claimed.

## Implemented scope

**Renderer origin and desktop surfaces (M616–M617).** The packaged renderer loads from the privileged custom scheme `dude-app://app/` instead of a loopback HTTP server on an OS-assigned port. A fresh port per launch had meant a new origin per launch, so production desktop renderer state (localStorage, IndexedDB) was lost on every restart; the scheme gives one fixed origin. The scheme is `standard, secure, supportFetchAPI, corsEnabled, stream, codeCache`, never `bypassCSP` or `allowServiceWorkers`, and the navigation guard compares protocol and host explicitly. A spike found that `ws://` (loopback and LAN), secure-context APIs, WebCrypto, storage and the sandbox iframe CSP host-source all work from this origin, so the collaboration transport is unchanged and the planned pinned self-signed `wss://` fallback was not needed. LLM chat moved from a loopback HTTP proxy to the sender-checked IPC call `dude:llm:chat`; the proxy server was deleted.

**Portable persistence foundation (M618).** `@dude/persistence` holds UUIDv7 generation (random source injected), device and environment records, `SettingDefinition`s with the policy-to-scope rule, entity codecs, repository ports, in-memory adapters, host-neutral repository contract suites, and `SecretRef`. `@dude/sync` holds the outbox op model, status vocabulary and per-entity coalescing. `@dude/contracts` gained the renderer-to-main store shapes, a closed agent RPC method map and `DeviceRegistrationRequest/Response` stubs (consumed from 31C). Tool manifests may declare `settingScopes` overrides.

**Device State Store (M619–M621).** `apps/device-agent` is an Electron utility process (the "state service") that owns `userData/device-store/dude-device.db` through `node:sqlite` (WAL, `synchronous=FULL`, foreign keys). It has a checksummed, transactional, resumable migration runner with `VACUUM INTO` backups (last three kept) and refusal of a newer-schema store, UUIDv7 device identity with MachineGuid-hash clone detection, atomic entity-plus-coalesced-outbox commits, repositories, a closed RPC table and reset. Electron main is the only broker: it forks the process, posts a private `MessagePort` to the child only, restarts with 0.5/2/8 s backoff and declares the store unavailable after more than three crashes in two minutes, validates every `dude:store:*`/`dude:device:*` call, and coordinates quit (renderer flush, clean-exit mark, checkpoint). Desktop JSON state (preferences, window bounds, hotkeys, grants, watch lists, native appearance), mutation journals, snapshot headers and PowerShell history moved into the store, with a JSON fallback and drain while degraded and a one-shot, resumable import of legacy `userData` files into `legacy-import/<ts>/`, which doubles as the untouched recovery copy.

**Secrets (M622).** Secrets are `SecretRef` rows plus `safeStorage` ciphertext in the store. The renderer can only ask for `status` (set/unset and a hint masked in main), `set` and `remove`, from the allowlisted purpose `ai.llmApiKey`; there is no `get`, and main alone decrypts. `secure-store.json` is retired after a byte-for-byte ciphertext import. The AI base URL and model are a device-scoped document.

**Renderer persistence (M623–M625).** `main.ts` awaits a boot snapshot before `bootstrapApplication`. A device key/value backend keeps synchronous signals over an in-memory cache with 1 s debounced commits (journaled settings commit immediately, a flush handshake runs on quit), records the resolved scope on every write, and imports renderer `dude:v1:*` localStorage once. Entity collections (favorites as per-pin records, pipelines, user scripts, projects, workspace templates) commit immediately with optimistic update and rollback; home layout, usage, appearance and reopen-on-restart are journaled documents/settings. Local History and network runs live in SQLite on desktop (retention enforced in the same transaction as each write) and in IndexedDB on web, behind the same repository ports, with a one-shot IndexedDB import. The web build keeps blob storage, a stable per-browser installation identity and no outbox. The legacy-compat code was removed: manifest `storageMigrations`, `moveLocalValue`, every `migrateX`, the legacy Home panel and the bundle's `homePanel`. Repository codecs now serve both hydration and bundle import.

**Settings › This Device and recovery (M626).** The new core settings section shows device ID, editable display name (default "Windows PC", never the hostname), platform, environment ID, enrollment state, store size, schema/migration/backup status, outbox count and recovery actions. A shell banner appears when the store is degraded and offers retry, open recovery folder and reset. **Clear data** (keeps identity and secrets) and **Reset this device** (also mints a new identity and wipes secrets) are separate two-step preview/confirm actions under the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract): a single-use 60 s token bound to the window and a digest of what the preview showed. The high-consequence gate runs the two new confirmation-boundary specs.

**Close-out (M627).** The data-scope inventory classifies by the policy rule, then manifest overrides, then `SETTING_DEFINITIONS` and codecs, and scans `apps/device-agent`. Documentation, decision records (PD-013 to PD-022) and this evidence were written.

### Locked decisions recorded in this phase

- Usage/insights and home layout are **environment**-scoped (the user explicitly asked for the earlier "usage stays local" statement to be rewritten); they are sync-eligible only after explicit enrollment consent in 31D.
- A tool `local` preference defaults to environment scope; `session`, `user-choice` and `none` inputs are `local-only`; `secure-local` is `device`. A manifest `settingScopes` entry overrides.
- Only an explicit list journals into the outbox: favorites, pipelines, user scripts, projects, workspace templates, appearance, reopen-on-restart, home layout (with notes) and usage/insights.
- There are no existing production users, so migration is best-effort and one-shot and the legacy-compat code was removed rather than carried.
- The state service is deliberately *not* the privileged "Device Agent" execution boundary named in the system and security architecture.

## Verification results

Results were captured locally on Windows with Node 24.21.0, npm 11.19.0, Electron 44.4.3 and SQLite 3.53.4 (`node:sqlite`). The Angular, e2e, lint, portable, generator and desktop rows come from the last full gate batch (after Milestone 626); the Electron and package suites were re-run for this close-out. Documentation and generator-text changes in Milestone 627 do not alter those suites' inputs beyond the items noted under [Close-out re-runs](#close-out-re-runs).

| Check | Result |
|---|---|
| Portable engine/contract/persistence suite (`npm run test:packages`) | 666 files, 4,352 tests pass, including the in-memory repository contract suites, codec fixtures and coalescing table |
| Angular adapters/framework (`npm test`) | 738 files, 7,887 tests pass, including the browser and device adapters against the shared repository contracts, scope resolution, the `settingScopes` conformance check and registry-wide web/desktop parity |
| Electron boundary/state-service suite (`npm run test:electron`) | 86 files, 705 tests pass, including the SQLite adapter contracts, migration runner, identity/clone, atomicity, hard-kill crash and reset specs |
| Lint/design (`npm run lint`) | ESLint, package boundaries (the agent has no `electron`/`@angular`, nothing in `apps/web` reaches `node:sqlite` or the agent), design tokens, generated theme and 49,008 contrast checks across 144 combinations pass |
| Portable consumption (`npm run check:portable`) | Ten packages build and install independently without Angular/Electron; 1,262 compiled ESM export modules import |
| Host type checks (`npm run check:hosts`) | Desktop and relay declarations pass |
| Inventory (`npm run check:inventory`) | Extraction, registry and data-scope inventories resolve; every storage declaration/site is classified and no synchronization consent is implied |
| Generator freshness (`npm run check:generated`) | All generator outputs fresh and repeatable |
| High-consequence gate (`npm run test:high-consequence`) | Full portable suite, 50 application files/187 tests, plus the new confirmation-boundary specs (13 Angular tests for Settings › This Device, 17 Electron tests for store reset) pass |
| Production routes/PWA/offline (`npm run test:e2e`) | 137 Playwright tests pass |
| Production desktop acceptance (`npm run check:desktop`, after `ng build --configuration production,electron` and `electron:compile`) | Cold/warm launches at the real `dude-app://app/` origin, preload isolation, deep links, file handoff and warm-launch persistence of seeded store rows pass |
| Desktop startup (`npm run measure:desktop-startup`) | One run on this machine: app-ready to load-url-done 437.6 ms; the Device State Store start (fork, open, migrate-check) added about 120 ms (`device-store-started` at 166.1 ms) and the first window load took 190.7 ms. **No Phase 31A baseline was recorded in the repository, so no before/after comparison or regression claim is made**; the figure is a single unaveraged measurement |

### Close-out re-runs

The final close-out re-ran `npm run check:generated`, `node scripts/generate-security-doc.mjs` and the inventory checks after the documentation edits and the capability-label change described under [Documentation-only changes](#documentation-only-changes); see the Milestone 627 commit for their outputs.

## Exit-gate evidence

The roadmap exit gate is "Stable device IDs, scoped settings, repository adapters, secure secret references, recoverable migration and durable local outbox work without a Hub." Each item maps to evidence:

| Exit-gate item | Evidence |
|---|---|
| Stable device IDs | `apps/device-agent/src/store/identity.spec.ts`: the UUIDv7 device and environment IDs persist across reopen; a changed MachineGuid hash is detected as a clone, mints a new device ID, records `clonedFrom`, rewrites unsent outbox ops and marks secrets `needsReentry`. A reset or reinstall produces a new device. Web installations use a persisted per-browser installation ID (`device-identity.service.spec.ts`), which Clear all data deliberately skips. UUIDv7 version/variant/ordering are tested in `@dude/persistence` |
| Scoped settings | `resolveToolKeyScope`/`resolveKvScope` and `SETTING_DEFINITIONS` in `@dude/persistence` with specs for the policy rule and manifest overrides; `tool-conformance.spec.ts` validates every manifest `settingScopes` map against what the tool actually persists; the store records the scope on every write; the data-scope inventory fails on an unclassified site |
| Repository adapters | The same contract suites (`@dude/persistence/testing`) run against the in-memory adapters, the browser adapters (IndexedDB/localStorage) and the SQLite adapters, including history/network-run retention (200 per tool, 5,000 total, 90 days, 256 KiB per entry; network runs 100/30 days/50 MB) enforced inside the write transaction |
| Secure secret references | `SecretRef` rows plus `safeStorage` ciphertext; secrets IPC specs cover wrong sender, unknown purpose, unavailable encryption and the absence of any path that returns plaintext; `main-security.spec.ts` asserts there is no `secrets:get`; the legacy ciphertext import preserves bytes; the renderer shows only set/unset and a masked hint |
| Recoverable migration | `migration-runner.spec.ts`: fresh store, upgrade with a `VACUUM INTO` backup, an interrupted step that a rerun completes, idempotence, checksum mismatch and refusal of a newer schema. `legacy-import.spec.ts`: validation through each module's own parser, a single-transaction commit, a crash between commit and file move, resumption, and the untouched `legacy-import/<ts>/` recovery copy. The reset specs cover quarantine of an incompatible store |
| Durable local outbox without a Hub | `crash.spec.ts` spawns a bundled `crash-writer`, hard-kills it, reopens the database and asserts that every journaled record without a Hub revision has exactly one outbox op. Atomicity specs prove a failure inside the transaction leaves neither row nor op; coalescing (upsert/upsert, unsent upsert then delete, delete then upsert) and backpressure at `OUTBOX_MAX_ROWS` are table-tested. Ops carry status `unsent-standalone` and nothing in this phase contacts a Hub |

## Limitations and known gaps

- **Earlier production renderer data is unrecoverable.** Renderer state written by previous production launches lived in per-launch random-port origins that can no longer be opened, so only the current origin's `dude:v1:*` keys and IndexedDB databases can be imported. This is accepted because the product had no existing production users to protect.
- **No Hub, sync, replay or conflicts.** Outbox ops are recorded with the single status `unsent-standalone`; nothing consumes them. Registration, Hub revisions, cursors, the first-sync preview/import/merge flow and the enrollment UX belong to 31C/31D, and the web build has no outbox.
- **Startup cost is unbudgeted.** The store start sits on the critical path before the window is created (a failed start falls back to degraded mode rather than blocking). A multi-run comparison against a 31A build is owed if startup becomes a concern.
- **Production renderer data from an installed build has not been manually exercised** beyond the automated desktop harness, which runs an isolated profile with fixture dialogs.
- **Mobile is unverified.** Mobile persistence adapters are Phase 31H.
- **Native-only scopes.** Native recents, history, journals, crash recovery and scratch inputs remain local; the policy rule and inventory prevent them from becoming sync-eligible by default.
- **Elevated and installed-build checks** (installer behavior, asar fork of the utility process, packaged code paths) have not been run in this evidence.

## Owed manual verification

A single pass on an installed NSIS build (`npm run electron:package -- --publish never`) is still owed. It should confirm:

1. The state service forks from inside the asar and the store opens.
2. First launch imports legacy `userData` files into `legacy-import/<ts>/`.
3. State survives a quit and relaunch: a favorite, a pipeline, a tool preference and a history entry.
4. A simulated clone (editing the stored machine hash) produces a new device ID, records the old one and marks secrets `needsReentry`.
5. Killing the state service shows the backoff and then the degraded banner with retry, open recovery folder and reset.
6. Quit flushes a write made within the last second, and `autoUpdater.quitAndInstall` still works with the coordinated quit.
7. Pyodide and the sandbox iframes work from `dude-app://app/`.
8. LAN collaboration works over plain `ws://` between two machines (or two profiles).
9. AI provider: set, masked display, replace/remove, and a chat round trip over IPC.
10. Both reset flows (Clear data keeps identity and secrets; Reset this device mints a new identity).
11. Web/PWA: a stable installation ID, repositories unchanged, Clear all data preserving the installation ID.

## Documentation-only changes

Milestone 627 updates the documentation and two generator-input texts, with no runtime behavior change. The capability catalog entry `llm-proxy` keeps its identifier (renaming it would rewrite 31A's immutable registry baseline) but its label is now "Local LLM chat" and its description names the IPC call; `scripts/generate-security-doc.mjs`, a desktop-only-control spec expectation and the Regex Tester manifest note changed to match, and `SECURITY.md` and the README table were regenerated by their generators rather than edited by hand.

## Reproduction and ownership

Root commands: `npm test`, `npm run lint`, `npm run test:electron`, `npm run test:packages`, `npm run check:portable`, `npm run check:boundaries`, `npm run check:hosts`, `npm run check:inventory`, `npm run check:generated`, `npm run test:high-consequence`, `npm run test:e2e`. `npm run check:desktop` requires `ng build --configuration production,electron` (base href `/`) and `npm run electron:compile` first. `npm run measure:desktop-startup` builds and measures the same configuration.

Durable evidence lives in `docs/architecture/data-scope-inventory.json` and `data-scope-entities.json`. [Data and synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md#device-state-store), [security architecture](../architecture/SECURITY_ARCHITECTURE.md), [portable core ownership](../architecture/PORTABLE_CORE.md) and `apps/device-agent/AGENTS.md` describe the maintained architecture; decision records are PD-013 to PD-022 in the [decision log](../history/DECISION_LOG.md#phase-31b-implementation-decisions).
