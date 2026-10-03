# Phase 31D implementation and acceptance evidence

Phase 31D (Milestones 649–662, plus fix commits) delivers scoped synchronization between enrolled desktops through the Hub: revision-checked push, pull and snapshot routes, a durable offline outbox with replay, three-way merge and a permanent conflict inbox, a first-sync preview, retention with snapshot rebase, revoked-device semantics, live apply, Settings › Sync and per-device statistics for the Hub owner. Android, the shared-state Hub web, Internet exposure and backup are later phases. Decisions are PD-038 to PD-049 in the [decision log](../history/DECISION_LOG.md#phase-31d-implementation-decisions), with amendments recorded under PD-038, PD-041, PD-043, PD-044, PD-046, PD-047 and PD-049; the milestone map and gotchas are in [Delivery History](../history/DELIVERY_HISTORY.md#phase-31d). The contract is [As built in Phase 31D](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31d-synchronization).

## Implemented scope

- **`@dude/sync`**: the nine categories and their default consent, `SYNC_POLICIES` (`lww`, `merge3`, `per-device`), the three-way field merge, `SYNC_LIMITS`, `SyncStatus`, `stripNonSyncable`, and the pure JSON diff and display helpers.
- **Hub**: migration 0003, policy and revision enforcement in `commitCanonical`, `/api/v1/sync` push, changes, snapshot and state (device credential), summary and two-step environment clear (owner session), the device-only `changes-available` event, retention compaction (90 days default, at startup and every six hours), protocol version 2, audit events that carry counts and ids only, and typed `@dude/api-client` methods.
- **Device Store and Agent**: migration 0003, status by enrollment, journaling of syncable tool preferences, per-device usage, the sync engine (apply remote, push results, rebase, conflicts, quarantine, status), first-sync preview and apply with a recovery snapshot, and the revoked, unenroll, clear-data and reset lifecycle.
- **Desktop and renderer**: the sender-checked `dude:sync:*` bridge, live apply into entity collections and the key/value backend, Settings › Sync (status, first-sync wizard, categories, conflict inbox, quarantine, held and stranded operations, revoked standalone, load synced workspace layout), the shell sync indicator (shell exception #13), and Hub admin sync statistics in Devices and Environment & Hub.

## Verification results

Gates were run as batches during implementation (after Milestones 652, 654, 656 and 660, and with the Milestone 661 suites) and were green: `npm test`, `npm run test:packages`, `npm run test:electron` (which runs `test:sync`), `npm run test:hub`, `npm run lint`, `npm run check:inventory`, `npm run check:generated`, `npm run test:high-consequence`, and `npm run test:e2e:sync` locally. Fix commits recorded in [Delivery History](../history/DELIVERY_HISTORY.md#phase-31d): an inventory refresh and the move of pure helpers into `@dude/sync`. One known flake: the process-viewer confirmation-boundary spec timed out once under full `npm test` load and passes in `test:high-consequence`. The first CI runs of the new suites are pending.

## Exit-gate evidence

| Exit-gate clause | Evidence |
|---|---|
| Two desktop clients converge through the Hub | `apps/device-agent/src/sync/sync-integration.spec.ts` (`npm run test:sync`): two real Agent stores against one real Hub converge every category in both directions and propagate deletes; `apps/hub/src/server/routes/sync.spec.ts` (two devices converge through push and changes); `e2e/sync/10-two-desktops.spec.ts` (`npm run test:e2e:sync`, two Electron desktops: a favorite and a theme change appear live on the other desktop) |
| Offline edits survive restart | `sync-integration.spec.ts`: offline edits survive an Agent kill and Hub downtime and each applies exactly once; `sync-runtime.spec.ts`; the device outbox is durable across hard kill ([31B](PHASE31B_ACCEPTANCE.md)) |
| Duplicate replay | `sync-integration.spec.ts` (a replayed push applies once when the acknowledgement is dropped); `sync.spec.ts` (a duplicate `opId` returns `duplicate` and writes one change) |
| Revision conflicts | `sync.spec.ts` (a stale base on a `merge3` entity conflicts and returns the current record); `sync-integration.spec.ts` (a concurrent pipeline edit becomes an inbox conflict resolved with Keep mine and Keep both; concurrent project edits to different fields auto-merge and take the later `lastActivatedAt`); `sync-logic.spec.ts`; `e2e/sync` (conflict shown in the indicator and resolved with Keep mine) |
| Deletes, tombstones and stale cursors | `sync-integration.spec.ts` (an edit-delete conflict instead of resurrection; a device below the compaction floor rebases without losing or resurrecting anything); `sync.spec.ts` (410 `cursor-expired` after compaction, a fresh snapshot recovers; snapshot pages converge) |
| Revoked devices | `sync-integration.spec.ts` (a revoked device's pending operations are stranded, its Hub writes stop and it continues standalone with its data); `sync.spec.ts` (a revoked device gets 401 mid-sequence); `standalone.confirmation-boundary.spec.ts` |
| Scope and privacy | `sync-integration.spec.ts` (the Hub holds no device-only data, secrets or payload text in records or its audit log); `sync.spec.ts` (per-operation rejection of unknown or non-syncable settings and non-owner usage); the data-scope inventory (`npm run check:inventory`) |
| Quarantine, not loop or discard | `sync.spec.ts` (rejection per operation without rolling back the rest); `sync-logic.spec.ts` (too-large quarantined without sending; retry, discard and export) |
| Destructive actions | `apps/hub/src/server/sync.confirmation-boundary.spec.ts` (environment clear), `apps/device-agent/src/sync/standalone.confirmation-boundary.spec.ts` (Continue standalone), the store-reset and Settings confirmation-boundary specs; all run in `npm run test:high-consequence`; `sync-integration.spec.ts` covers the owner-signed-in environment clear |
| First-sync preview and collisions | `apps/device-agent/src/sync/first-sync.spec.ts`; `sync-integration.spec.ts` (first-sync collisions merge into the inbox and a renamed copy) |
| Limits and backpressure | `sync.spec.ts` (empty, oversized and too-many-ops bodies refused); the measurements below record the exact record boundary |

## Measurements

`npm run measure:sync` (Ryzen 9 5900X, Windows 10.0.26200, Node 24.21; milliseconds unless stated). The figures are a development-machine record, not hardware-independent guarantees.

| Case | Result |
|---|---|
| Push 100 favorites | 766 ms (1 batch) |
| Push 1,000 favorites | 3,879 ms (10 batches) |
| Push 5,000 favorites | 19,720 ms (50 batches, about 250 operations/s) |
| Push 100 pipelines of about 2 KB | 370 ms |
| Catch-up of 6,200 records: changes from 0 | 208 ms (13 pages) |
| Catch-up: changes from mid-feed / snapshot | 106 ms / 167 ms |
| 100 stale-base conflicts | 30 ms |
| Record size boundary | exact at 131,072 bytes (limit + 1 is rejected `too-large`); a 656 KB body returns HTTP 413 |
| Hub growth 0 to 6,402 records | database 5.4 MB plus WAL 4.2 MB |
| Compaction of 6,502 feed rows | about 31 ms (the file does not shrink) |
| Device `commitEntity` | about 3.5 ms per operation (5,000 operations in 17.9 s); `importMany` of 5,000 in 0.6 s |
| Device store at 5,000 pending operations | 3.45 MB; re-editing coalesces outbox rows |

## Distributed release verification matrix

| Row | Evidence |
|---|---|
| Scope/privacy | `sync-integration.spec.ts` (Hub free of device-only data, secrets and payload text; audit carries counts and ids), `sync.spec.ts` setting-key and ownership rejections, `npm run check:inventory` |
| Multi-device | `sync-integration.spec.ts` (two Agent stores, one Hub), `sync.spec.ts`, `e2e/sync/10-two-desktops.spec.ts`. One desktop may be co-located with the Hub: the e2e uses separate stores. The two-machine LAN pass is owed |
| Offline/retry | `sync-integration.spec.ts` (kill and Hub downtime, dropped acknowledgement), `sync.spec.ts` (duplicate `opId`) |
| Conflicts/deletes | `sync-integration.spec.ts` (conflict inbox, auto-merge, edit-delete, compaction rebase), `sync.spec.ts` (stale base, 410 `cursor-expired`) |
| Identity (revoked-device part) | `sync-integration.spec.ts` (stranded and continue standalone), `sync.spec.ts` (401 for a revoked device). Sync-time verification for Internet exposure remains 31F |

## Known limits and carried items

- **Desktops only.** Android sync is 31H; the shared-state Hub web is 31E; encrypted backup is 31G.
- **Unpackaged desktops cannot enroll against the self-signed Hub**: Electron-as-Node (BoringSSL) rejects the certificate as a trust anchor. The packaged SEA Agent (OpenSSL) is unaffected and the e2e uses `DUDE_E2E_AGENT_NODE` (unpackaged desktops only). The fix (certificate extensions or a pin-only verifier) is carried to the 31E/31F TLS work.
- **`test:e2e:sync` is a local Windows gate**, not in CI (it needs the Electron renderer build). One of five local runs failed in shared setup during concurrent rebuilds and did not reproduce. `test:sync` runs inside `test:electron`, whose first CI run is pending.
- **Test-only Hub knobs** ship in the binary and are inert unless set: `DUDE_HUB_TEST_RELAX_RATE_LIMITS`, `DUDE_HUB_TEST_SYNC_RETENTION_DAYS`, `DUDE_HUB_TEST_SYNC_COMPACTION_MS`. Phase 31F reviews or strips them.
- **Only tool-id-shaped `environment` preferences and `SETTING_DEFINITIONS` journal keys sync**; other app namespaces do not.
- Remote key/value deletes do not reset open signals until reload; the Hub admin summary lists active devices only; there is no *Sync now* command-palette entry (Settings › Sync appears automatically); no project editor exists, so no project change notice.
- Standalone conversion drops all outbox rows; the data stays in `records` and a later enrollment's first sync re-journals local-only data.

## Owed manual verification

1. Two physical desktops over the LAN: enrollment, first-sync preview and apply, a favorite and a theme change appearing live, an offline edit replaying after an app restart, a conflict resolved in Settings › Sync, and revocation leading to Continue standalone.
2. The owed Phase 31C installed-build passes ([31C acceptance](PHASE31C_ACCEPTANCE.md#owed-manual-verification)) and the 31B pass ([31B acceptance](PHASE31B_ACCEPTANCE.md#owed-manual-verification)), now with sync enabled.
3. First CI runs of `test:sync` (inside `test:electron`).

## Reproduction

`npm ci`, then `npm run test:sync` (builds the Hub bundle first, about 20 s), `npm run test:hub`, `npm run test:e2e:sync` (local Windows, builds the production Electron renderer, about 60 s), `npm run measure:sync` and `npm run test:high-consequence`.
