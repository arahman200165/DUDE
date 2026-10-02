# AGENTS.md — apps/device-agent/

The **Device State Store "state service"**: a utilityProcess (bundled by `npm run device-agent:compile` to `dist/electron/device-agent.js`) that owns the SQLite database `userData/device-store/dude-device.db` through `node:sqlite`. It is NOT the privileged "Device Agent" execution boundary named in SYSTEM/SECURITY_ARCHITECTURE; do not conflate them.

- Only Electron main talks to it (private MessagePort, closed method table). The renderer never holds a port.
- No `electron` or `@angular/*` imports, and nothing here is imported by `apps/web` (`npm run check:boundaries` enforces both). Allowed workspace deps: persistence, sync, contracts, domain, shared-types.
- Schema changes happen only through new numbered migrations in `src/store/migrations/`. Never edit a shipped migration (checksums are verified); bump `minReaderVersion` only for changes older builds cannot read.
- Every journaled entity change commits its row and its coalesced outbox op in one transaction (`src/store/entity-commit.ts`).
- Specs run in `npm run test:electron`; `src/testing/crash-writer.ts` is bundled by the crash spec and hard-killed to prove durability.
