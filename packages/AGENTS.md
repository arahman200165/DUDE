# AGENTS.md — packages/

Packages expose compiled ESM and declarations through their `package.json` exports. Declare each dependency in its owning workspace; root dependencies do not grant permission to import it. Build outputs are untracked.

Portable packages must not import application sources, Angular, Electron, Node built-ins, or browser host globals. Host facilities are explicit contracts, installed by application adapters. `collab-protocol` is deliberately Node-only and excluded from the portable-core gate.

`persistence` and `sync` define the portable device-store model (UUIDv7 ids, setting scopes, entity codecs, repository ports and contract suites, secret references, outbox coalescing); `sync` also owns the Phase 31D categories, `SYNC_POLICIES`, three-way merge, `SYNC_LIMITS` and the pure diff/display helpers. They hold no storage engine: SQLite lives in `apps/device-agent` and browser adapters in `apps/web`, and both must pass the shared contract suites in `@dude/persistence/testing`. Change a codec or setting definition here, never an `apps/web` migration, and keep randomness and clocks injected.

Tool metadata belongs in `tool-registry/src/tools/<id>/<id>.manifest.ts`; transforms, fixtures and pure tests belong in `tool-engine` or their foundational owner. Keep metadata free of functions and implementation imports. UI and worker factories belong in `apps/web`. Run the root package, boundary and consumption checks after changing a package boundary.
