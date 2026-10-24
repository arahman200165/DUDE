# Portable core and workspace ownership

Phase 31A introduced npm workspaces with one root lockfile, and Phase 31B filled the persistence and outbox packages. The root retains the Node/npm pins, desktop release version and developer commands. Packages are private internal APIs; publishing and old-source compatibility layers are absent.

| Workspace | Responsibility |
|---|---|
| `apps/web` | Angular renderer, UI bindings, browser storage, DOM, Canvas, workers and sandbox/WASM adapters |
| `apps/desktop` | Electron main/preload composition, native implementation and IPC trust boundaries; uses the web renderer |
| `apps/collab-relay` | Existing standalone collaboration relay |
| `apps/hub` | Self-hosted DUDE Hub service (Fastify, `node:sqlite`, Node SEA); Node-only, never imports Electron, Angular or the desktop/agent workspaces, and nothing in `apps/web` imports it |
| `apps/device-agent` | Resident per-user Device Agent: a Node process (SEA `dude-agent.exe`) owning the `node:sqlite` Device State Store, the Hub client and the DPAPI device key (not portable core, and not the privileged Device Agent execution boundary); imports no `electron` or `@angular/*`, and nothing in `apps/web` imports it |
| `shared-types` | Foundational types and closed vocabularies |
| `domain` | Workbench entities, tool metadata and data scope |
| `contracts` | Execution and worker protocols, host ports and native request/result shapes |
| `validation` | Portable validation and sanitization logic |
| `crypto` | Portable cryptographic helpers and explicit engine-host installation |
| `tool-engine` | Tool transforms, composition, deterministic fixtures and pure tests |
| `tool-registry` | Authoritative per-tool manifests and generated metadata index |
| `persistence` | Device/environment records, UUIDv7, setting definitions and scope rules, entity codec interface, repository ports, secret references, in-memory adapters and host-neutral contract suites (`@dude/persistence/testing`) |
| `sync` | Outbox op model and coalescing; sync categories, `SYNC_POLICIES`, three-way merge, `SYNC_LIMITS`, `SyncStatus`, JSON diff and display helpers (Phase 31D); transport lives in `@dude/api-client` and the engine in `apps/device-agent` |
| `api-client` | Portable typed Hub client over an injected transport port; consumed by the Agent and the hub-web build, kept out of the Pages and desktop renderer bundles (a Hub parity spec checks it against the Hub's routes) |
| `hub-backup` | Portable encrypted Hub backup file format (`.dudebackup`, Phase 31G): chunked XChaCha20-Poly1305 with the passphrase KDF, random source and clock injected by the Hub; no Node built-ins |
| `collab-doc` | Portable Yjs mapping for collaborative documents (Phase 31J): document keys, per-kind schemas (scratchpad snippets, user-script body, Markdown rooms and documents), binary frames, awareness validation. Consumed only by `apps/hub` and `apps/web`; forbidden for `apps/mobile` and `apps/device-agent` |
| `sqlite-store` | Node-only `node:sqlite` plumbing (open, WAL, checksummed migration runner, helpers) shared by the Hub and the Device Agent; excluded from the portable-core gate |
| `agent-pipe` | Node-only authenticated named-pipe protocol between the desktop and the Device Agent; excluded from the portable-core gate |
| `collab-protocol` | Existing Node-only Yjs room implementation; excluded from the portable-core gate |

`apps/mobile` now owns the Expo/React Native Android shell and its native identity, transport, SQLite and foreground sync adapters. Its Phase 31H physical, signing and accessibility passes are carried into the Phase 31I final gate ([evidence](../delivery/PHASE31H_ACCEPTANCE.md), [PD-084](../delivery/PHASE31I_PLAN.md)); infrastructure reservations grant no runtime capability. Device identity, the desktop SQLite store and local outbox are delivered by Phase 31B; Phase 31C adds Hub registration and the API client; Phase 31D adds desktop replay and conflict orchestration. Shared categories, policies and limits remain in `sync`, and typed transport contracts remain in `api-client`. Android has its own driver and does not import desktop orchestration.

## Package and host boundaries

Packages emit JavaScript and declarations into untracked `dist/` directories. Applications consume explicit package/subpath exports. Electron still bundles CommonJS with esbuild. Existing browser, Electron and relay production artifact paths remain root-controlled.

`npm run build:packages` builds in dependency order; `watch:packages` builds before watching. Root `start`, `test`, `build`, Electron and relay commands prepare packages automatically. `test:packages` owns moved transform tests; `ng test` owns Angular adapter tests. `check:boundaries` rejects forbidden and undeclared imports. `check:portable` installs and builds the twelve portable packages independently without Angular/Electron, compiles a consumer and imports compiled exports.

`EngineHostPorts` explicitly provides WebCrypto, requests, compression, HTML sanitization/entity parsing, image decoding and xxhash WASM initialization. Browser, worker, Electron and test adapters install supported facilities. Workers do not offer a DOM sanitizer; Electron does not offer browser image decoding or DOM sanitization/entity parsing. Unsupported facilities fail explicitly. Browser worker creation, cancellation, progress and failure isolation remain in the application. Files crossing engines use structural read-only contracts.

Framework neutrality does not establish universal host support. An engine can require WebCrypto, streams, a sanitizer, a decoder, a network connection or a browser-managed WASM/sandbox runtime. Android compatibility is established per engine, not assumed: the 40 Phase 31I tools run on Hermes through the mobile host ports described [below](#as-built-in-phase-31i-mobile-engine-host), and an engine needing an unsupported facility is not offered there.

The renderer accesses native capabilities through injected `PlatformBridgePort`. Its browser adapter returns unavailable when preload is absent. Electron implementations and global Window declarations stay in applications. Extraction does not change IPC names, allowlists, sender checks, grants, confirmation tokens, mutation previews, journals, undo or elevation handling.

## Tool ownership and discovery

Each tool has one metadata manifest in `packages/tool-registry/src/tools/<id>/`, an Angular `<id>.bindings.ts` beside its component, and engine modules under their package owner. Metadata has no functions, engines, UI loaders or native implementations. Bindings retain literal lazy imports for components/settings.

Mobile metadata discovery consumes the compiled registry and lightweight search subpath. `generate:registry` also discovers `apps/mobile/src/tools/<id>/<id>.mobile-bindings.ts`, validates the stable `bindingId` and emits literal lazy loaders in `mobile-bindings.generated.ts`. At the end of 31H the executable map was empty; Phase 31I populated it with the 40 locked tools ([as built](#as-built-in-phase-31i-mobile-engine-host)). Availability requires a real host binding and capability checks, rather than a hand-maintained platform list. Mobile production boundaries reject Angular, Electron, Node-only packages, browser adapters, application-source imports and eagerly loaded engines.

The canonical appearance JSON continues to generate web CSS and shared appearance axes. It now also generates portable token data in `domain`; `@dude/domain/core/appearance/native-theme` resolves semantic native colors, spacing, contrast and fonts. Native fallbacks do not rewrite synchronized font selections.

`generate:registry` discovers manifests and bindings, composes Angular definitions and generates literal pipeline/workspace/fixture loader maps and worker factories. Routes, sidebar, search, command palette, file associations, shortcuts and documentation derive from the same metadata. Adding a tool requires no manual core/shell registration. IDs, routes and metadata are compared with the captured Phase 31 baseline.

## Data scope

`DataScope` is `environment | workspace | device | local-only`. Project membership belongs to workspace scope. Scope is independent of retention, sensitivity and synchronization consent; classification never grants permission to synchronize.

Shared definitions do not implicitly contain payloads, credentials, absolute paths, history or journals. Mixed entities require field-level classification. The checked storage inventory classifies every storage site by scope without granting synchronization permission. Phase 31B closed the identity/versioning gaps: persisted entities have stable IDs, schema versions and codecs in `@dude/persistence`, tool keys resolve scope through the policy rule or a manifest `settingScopes` override, and the Device State Store records scope per write.

## As built in Phase 31I: mobile engine host

Phase 31I runs real tool engines on Android. Engines stay in their package owners; `apps/mobile` consumes them only through compiled subpath exports and never gains a second copy of a transform.

**Engine-host ports.** `installMobileEngineHost()` (`apps/mobile/src/engine-host`) installs `EngineHostPorts` at app entry. Supported: WebCrypto random values and UUIDs from `expo-crypto`; a `subtle.digest` and HMAC subset (SHA-1, SHA-256, SHA-384, SHA-512) from `@noble/hashes`; `URL` and `URLSearchParams` from `react-native-url-polyfill`; `TextEncoder`/`TextDecoder` from `fast-text-encoding`. Unsupported and explicit: `request`, `compression`, `sanitizeHtml`, `htmlEntities`, `decodeImage` and `xxhash` throw `HostFacilityUnavailableError`, and none is stubbed. Hermes has no WebAssembly, so the mobile Hash tool reports XXH32 and XXH64 as unavailable. Request-bearing tools stay out of scope until a `request` port is decided. Adding a polyfill later is a recorded decision, not an incidental dependency.

**Worker host.** The off-thread worker runtime is a bare Hermes runtime without `URL`, expo native modules or React Native `NativeModules`. `installWorkerHost()` therefore installs only `fast-text-encoding`, a random source that throws and `installMobileEngineHost()` for the digest/HMAC subset. A task needing `URL` or random values is not an off-thread candidate. Task payloads and results are plain JSON text; functions, `Map`s and class instances do not cross. The worker runs one job at a time and cannot interrupt a running job, so cancellation drops the result and a stale queued job is never dispatched. Imports inside a task body must be covered by `importForwarding` (`@dude/tool-engine`, `@dude/crypto`, `@dude/shared-types`, `@dude/domain`, plus the app's `src/tools`, `src/kit` and `src/engine-host` paths); anything else is captured from the JS thread as an uncallable closure value.

**Mobile import regions.** `scripts/check-mobile-boundaries.mjs` classifies each `apps/mobile` file into one of three regions, and `check:mobile` fails on a violation.

| Region | Path | May import from `@dude/tool-engine` | May import from `@dude/crypto` |
|---|---|---|---|
| shell | everything outside the two below, including `src/kit` | only `core/registry/tool-search`, `core/paste-detect/paste-detect` and the lazily `import()`ed `core/paste-detect/paste-detectors` | nothing |
| tools | `src/tools/**` | `tools/**` and `shared/**` subpaths plus the three shell subpaths | specific subpaths, never the barrel |
| host | `src/engine-host/**` | nothing | only `@dude/crypto/host` |

In every region Angular, Electron, `ws`, Node built-ins, host workspaces, host globals (`window`, `document`, `Worker`, `Buffer` and so on), non-literal `import()`, `require`, relative imports that leave `apps/mobile` and `src/` or `dist/` package paths are rejected.

**Portable additions.** QR and barcode scan classification (URL, Wi-Fi, contact/vCard, one-time-password, email, phone, SMS, geo and plain text, and GS1 check-digit validation) and the Device Info report model and formatter are portable `tool-engine` code shared by web, desktop and Android; web now shows the payload kind, barcode format and check-digit result from the same classifier. bwip-js (`bwip-js/generic`, `toSVG`, no canvas) replaces `jsbarcode` as the one barcode renderer on every surface, with the barcode pipeline step moved into the engine. `generate:registry` also emits `MOBILE_TOOL_IDS` into `packages/tool-registry` so web and desktop can show the "Also on Android" badge without importing application code. The portable-core gate is unchanged: the packages stay free of Angular, Electron and React Native.

The earlier statement that the executable map was empty describes the end of Phase 31H; it now holds the 40 locked 31I tools.

## Acceptance status

Phase 31C is complete (Milestones 628–648): the Hub, its canonical skeleton, owner identity, device registry and resident Device Agent work without synchronization; see [Phase 31C acceptance evidence](../delivery/PHASE31C_ACCEPTANCE.md).

Phase 31B is complete (Milestones 616–627): stable device IDs, scoped settings, repository adapters, secret references, recoverable migration and a durable local outbox work without a Hub; see [Phase 31B acceptance evidence](../delivery/PHASE31B_ACCEPTANCE.md), which also lists one owed installed-build manual pass.

Phase 31A is complete: the implementation is recorded as Milestone 615, and the inherited dependency-audit blocker was resolved afterwards (Angular and DOMPurify upgraded; one unpatched node-forge advisory accepted under `npm run audit:prod`). No release gate is disabled. See [Phase 31A acceptance evidence](../delivery/PHASE31A_ACCEPTANCE.md) for results and the dependency decisions. The roadmap remains authoritative for completion.
