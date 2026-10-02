# Portable core and workspace ownership

Phase 31A introduced npm workspaces with one root lockfile, and Phase 31B filled the persistence and outbox packages. The root retains the Node/npm pins, desktop release version and developer commands. Packages are private internal APIs; publishing and old-source compatibility layers are absent.

| Workspace | Responsibility |
|---|---|
| `apps/web` | Angular renderer, UI bindings, browser storage, DOM, Canvas, workers and sandbox/WASM adapters |
| `apps/desktop` | Electron main/preload composition, native implementation and IPC trust boundaries; uses the web renderer |
| `apps/collab-relay` | Existing standalone collaboration relay |
| `apps/device-agent` | Desktop Device State Store "state service": an Electron utility process owning the `node:sqlite` database (not portable core, and not the privileged Device Agent execution boundary); imports no `electron` or `@angular/*`, and nothing in `apps/web` imports it |
| `shared-types` | Foundational types and closed vocabularies |
| `domain` | Workbench entities, tool metadata and data scope |
| `contracts` | Execution and worker protocols, host ports and native request/result shapes |
| `validation` | Portable validation and sanitization logic |
| `crypto` | Portable cryptographic helpers and explicit engine-host installation |
| `tool-engine` | Tool transforms, composition, deterministic fixtures and pure tests |
| `tool-registry` | Authoritative per-tool manifests and generated metadata index |
| `persistence` | Device/environment records, UUIDv7, setting definitions and scope rules, entity codec interface, repository ports, secret references, in-memory adapters and host-neutral contract suites (`@dude/persistence/testing`) |
| `sync` | Outbox op model and per-entity coalescing; replay, cursors and conflicts reserved for 31D |
| `api-client` | Empty buildable entry point reserving later authenticated API responsibilities |
| `collab-protocol` | Existing Node-only Yjs room implementation; excluded from the portable-core gate |

Hub, mobile and infrastructure directories are documented placeholders. They provide no Hub API, synchronization or mobile implementation. Device identity, the desktop SQLite store with its migration runner and the local outbox are delivered by Phase 31B in `persistence`, `sync` and `apps/device-agent`; registration with a Hub, replay and conflicts are not.

## Package and host boundaries

Packages emit JavaScript and declarations into untracked `dist/` directories. Applications consume explicit package/subpath exports. Electron still bundles CommonJS with esbuild. Existing browser, Electron and relay production artifact paths remain root-controlled.

`npm run build:packages` builds in dependency order; `watch:packages` builds before watching. Root `start`, `test`, `build`, Electron and relay commands prepare packages automatically. `test:packages` owns moved transform tests; `ng test` owns Angular adapter tests. `check:boundaries` rejects forbidden and undeclared imports. `check:portable` installs and builds the ten portable packages independently without Angular/Electron, compiles a consumer and imports compiled exports.

`EngineHostPorts` explicitly provides WebCrypto, requests, compression, HTML sanitization/entity parsing, image decoding and xxhash WASM initialization. Browser, worker, Electron and test adapters install supported facilities. Workers do not offer a DOM sanitizer; Electron does not offer browser image decoding or DOM sanitization/entity parsing. Unsupported facilities fail explicitly. Browser worker creation, cancellation, progress and failure isolation remain in the application. Files crossing engines use structural read-only contracts.

Framework neutrality does not establish universal host support. An engine can require WebCrypto, streams, a sanitizer, a decoder, a network connection or a browser-managed WASM/sandbox runtime. Mobile compatibility remains unverified.

The renderer accesses native capabilities through injected `PlatformBridgePort`. Its browser adapter returns unavailable when preload is absent. Electron implementations and global Window declarations stay in applications. Extraction does not change IPC names, allowlists, sender checks, grants, confirmation tokens, mutation previews, journals, undo or elevation handling.

## Tool ownership and discovery

Each tool has one metadata manifest in `packages/tool-registry/src/tools/<id>/`, an Angular `<id>.bindings.ts` beside its component, and engine modules under their package owner. Metadata has no functions, engines, UI loaders or native implementations. Bindings retain literal lazy imports for components/settings.

`generate:registry` discovers manifests and bindings, composes Angular definitions and generates literal pipeline/workspace/fixture loader maps and worker factories. Routes, sidebar, search, command palette, file associations, shortcuts and documentation derive from the same metadata. Adding a tool requires no manual core/shell registration. IDs, routes and metadata are compared with the captured Phase 31 baseline.

## Data scope

`DataScope` is `environment | workspace | device | local-only`. Project membership belongs to workspace scope. Scope is independent of retention, sensitivity and synchronization consent; classification never grants permission to synchronize.

Shared definitions do not implicitly contain payloads, credentials, absolute paths, history or journals. Mixed entities require field-level classification. The checked storage inventory classifies every storage site by scope without granting synchronization permission. Phase 31B closed the identity/versioning gaps: persisted entities have stable IDs, schema versions and codecs in `@dude/persistence`, tool keys resolve scope through the policy rule or a manifest `settingScopes` override, and the Device State Store records scope per write.

## Acceptance status

Phase 31B is complete (Milestones 616–627): stable device IDs, scoped settings, repository adapters, secret references, recoverable migration and a durable local outbox work without a Hub; see [Phase 31B acceptance evidence](../delivery/PHASE31B_ACCEPTANCE.md), which also lists one owed installed-build manual pass.

Phase 31A is complete: the implementation is recorded as Milestone 615, and the inherited dependency-audit blocker was resolved afterwards (Angular and DOMPurify upgraded; one unpatched node-forge advisory accepted under `npm run audit:prod`). No release gate is disabled. See [Phase 31A acceptance evidence](../delivery/PHASE31A_ACCEPTANCE.md) for results and the dependency decisions. The roadmap remains authoritative for completion.
