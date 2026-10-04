# AGENTS.md — packages/

Packages expose compiled ESM and declarations through their `package.json` exports. Declare each dependency in its owning workspace; root dependencies do not grant permission to import it. Build outputs are untracked.

Portable packages must not import application sources, Angular, Electron, Node built-ins, or browser host globals. Host facilities are explicit contracts, installed by application adapters. `collab-protocol` is deliberately Node-only and excluded from the portable-core gate.

`persistence` and `sync` define the portable device-store model (UUIDv7 ids, setting scopes, entity codecs, repository ports and contract suites, secret references, outbox coalescing); `sync` also owns the Phase 31D categories, `SYNC_POLICIES`, three-way merge, `SYNC_LIMITS` and the pure diff/display helpers. They hold no storage engine: SQLite lives in `apps/device-agent` and browser adapters in `apps/web`, and both must pass the shared contract suites in `@dude/persistence/testing`. Change a codec or setting definition here, never an `apps/web` migration, and keep randomness and clocks injected.

`hub-backup` (Phase 31G) is the portable encrypted Hub backup file format (`.dudebackup`): XChaCha20-Poly1305 over 64 KiB chunks through `@noble/ciphers`, with the passphrase KDF, random source and clock injected by the Hub (never Node built-ins, never a wall-clock or `Math.random` call), a plaintext reader header and the manifest inside the encryption. Change the format only by bumping `formatVersion` and `minReaderVersion` so older readers refuse a newer file; the Hub in `apps/hub/src/backup/` is its only consumer.

Tool metadata belongs in `tool-registry/src/tools/<id>/<id>.manifest.ts`; transforms, fixtures and pure tests belong in `tool-engine` or their foundational owner. Keep metadata free of functions and implementation imports. UI and worker factories belong in `apps/web`. Run the root package, boundary and consumption checks after changing a package boundary.
