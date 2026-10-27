# Data, Persistence and Synchronization

This specification separates canonical Hub state from local Device Stores, retained inputs and synchronization consent. Delivered local persistence remains supported; the canonical Hub and Hub enrollment (Phase 31C), desktop and Hub web synchronization (31D, 31E), backup and transfer (31G) and Android persistence (31H, 31I) are delivered, and Phase 31J (complete) adds Hub-persisted collaborative documents for three selected surfaces ([As built in Phase 31J](#as-built-in-phase-31j-collaborative-documents-and-realtime-depth)).

Workspace implementation and host ownership are documented in [Portable Core](PORTABLE_CORE.md#data-scope). Desktop/Hub synchronization is delivered. Android owns a separate durable adapter and driver under Phase 31H; its [remaining acceptance passes are carried into the Phase 31I gate](../delivery/PHASE31H_ACCEPTANCE.md).

## As built in Phase 31H: Android persistence and synchronization

Android uses app-private `expo-sqlite`, WAL and exclusive transactions. Every statement and exclusive transaction passes through a FIFO serial gate (`apps/mobile/src/storage/serial-gate.ts`); `close()` drains the queue and then refuses new work, because expo-sqlite 57.0.3 uses freed memory when a statement chain is still in flight as the connection closes (Milestone 782). Numbered structural migrations refuse downgrades; entity shape evolution still belongs to shared codecs. The database is unencrypted application-private storage with no application unlock requirement. Signing secrets stay in Keystore-backed native storage. Backup/device-transfer rules exclude databases, credential material and recovery copies.

Standalone state, the one enrolled environment and retained read-only archives have separate context IDs. Enrollment identity, trust configuration, authority epoch, cursor and outbox are environment-bound; archive recovery preserves authority identity. Enrollment copies standalone records into a separate environment for preview while retaining standalone state. Disconnect does not merge those contexts. Credential-free restore imports preserve device identity, records and pending operation IDs in a read-only archive; explicit re-pair creates a fresh signing key and repeats consent. Its durable receipt binds the reviewed source context, so another matching archive or subsequent browsing cannot redirect recovery.

Each local record edit and its coalesced outbox operation commit in one exclusive transaction. The shared 10,000-row ceiling applies per isolated context; reaching it rejects the entire edit without evicting pending operations. Before upload, operations are durably claimed. Claimed operations cannot be overwritten or canceled by later edits: later changes receive another operation, the earliest operation for an entity replays with its stable ID, and acknowledgments remove only the exact operation while retaining newer edits and advancing their base. Disk-full/transaction failures roll back records, revisions and outbox together. Settings reuse shared scope/sensitivity rules, retain approved settings without mobile editors and preserve unsupported appearance fields.

Only favorites and settings are selected for mobile sync. `hello.syncCategoryFiltering` must be true. Validated optional `categories` snapshot/change queries are enforced by the Hub before serialization, including tombstones, using shared entity/category policies. Omitted filters retain existing desktop behavior. Global change cursors advance through sparse/empty filtered reads to the environment head without missing later matches. Newly enabled categories require a fresh filtered snapshot and preview.

First upload requires per-category Merge / Use Hub / Keep local review. Merge unions non-overlapping IDs with Hub values winning overlaps; Keep local publishes local values; Use Hub creates a recovery copy and crosses a confirmation boundary. Previews bind context, categories and local revision; intervening edits require refresh. Disabling a category retains its cache and queued edits while stopping reads/writes. Previews never upload. Explicit approval first resolves previously claimed uncertain operations using their original IDs; if this changes Hub state, a refreshed preview requires review before applying choices or uploading new operations.

The Android driver runs single-flight cycles on foreground edits, resume, connection recovery, realtime nudges and manual refresh. Realtime and retry scheduling stop in the background. Pulls use 16-record pages and a native 4 MiB response ceiling; pushes use shared limits and retries use bounded exponential backoff. Expired cursors use staged snapshots preserving pending operations. Pagination retains the first observed revision as the catch-up cursor so mid-pagination changes cannot disappear behind a later head. Changed authority or regressed acknowledged history blocks destructive reconciliation.

Revocation invalidates the session and makes cached environment data read-only. Disconnect previews unsent edits, attempts unenrollment, deletes the signing key and retains an archive; an unreachable Hub may retain a registry row requiring owner revocation. Export, cache clearing, pending-attempt discard and standalone conversion have local recovery paths. Destructive operations use context/revision-bound confirmations and preserve recovery copies. Storage errors, missing keys and rejected operations do not silently reset databases or drop pending edits. Native SQLite restart and physical transfer acceptance remain required and are carried into the Phase 31I gate ([the phase evidence](../delivery/PHASE31H_ACCEPTANCE.md)).

## As built in Phase 31I: tool state on Android

No new sync category, scope, table or journal entry type was added. Tool state reuses the Phase 31H stores and the Phase 31B scope rules.

**Tool preferences.** The kit's `useToolPreference`/`useToolPreferences` resolve a key's data scope with `resolveKvScope` and the manifest `settingScopes`, exactly as web does. A manifest `local` preference resolves to `environment` scope and is written under the same namespace and key as the web tool (for example `base64` `mode`), then journaled as a `setting` operation in the existing settings sync category. Preferences therefore converge between web, desktop and Android with no mapping layer. Preferences with another policy, and every `session`, `user-choice` or `none` input, stay in memory only; `secure-local` values are never persisted on Android. The Timezone Comparator's Android-only "Zones" view lives in memory so the synced `mode` key holds only values web understands. The persisted barcode-generator `format` key keeps its old values through the codec's decode mapping rather than a migration.

**In-memory inputs.** Tool inputs live in `ToolInputStore`, a process-memory map keyed by tool ID. It is never written to SQLite, journaled, queued, exported or synchronized. After the app has spent at least 5 minutes in the background the store is cleared (and the Share store with it), so a returning user sees empty inputs. Sensitive scan payloads stay in component state and are never written anywhere.

**Recents.** Recently opened tools use the `mobile.local` kv namespace with policy `session` and scope `local-only`. They are never journaled, queued or synchronized and never leave the device through sync. They are non-secret kv rows, so the credential-free recovery export includes them with the other cached state; the export already warns that it contains personal data. Favorites remain the synchronized record of tool interest.

**Share store.** An incoming `ACTION_SEND` payload is read by the `dude-share` module and held in a JS `ShareStore` in memory only. It is capped at 2 MiB (no manifest declares a larger `fileInput` size), holds one pending share at a time, is never persisted, journaled or synchronized, and is wiped by the same background timer as tool inputs. Text it prefills goes into `ToolInputStore`; an image is routed by cache URI to the two scanners and is not copied elsewhere. The data-scope inventory (`scripts/data-scope-inventory.mjs`) lists the Share store and the tool-input store as reviewed in-memory stores.

**The wipe.** The background wipe clears only in-memory state. It does not touch durable records, preferences, favorites, Recents, the outbox or recovery data; those follow the Phase 31H lifecycle actions.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; this document owns the detailed contracts in its domain.

Related: [DUDE System Architecture](SYSTEM_ARCHITECTURE.md) · [DUDE Security Architecture](SECURITY_ARCHITECTURE.md) · [DUDE Product Specification](../product/PRODUCT_SPEC.md) · [Quality and Release Specification](../delivery/QUALITY_AND_RELEASE.md).

## Contents

- [Authority Model](#authority-model)
- [Persistence Policy](#persistence-policy)
- [Default policy](#default-policy)
- [Canonical Data vs Device Data](#canonical-data-vs-device-data)
- [Data Scope Model](#data-scope-model)
- [Settings Must Be Scope-Aware](#settings-must-be-scope-aware)
- [Canonical Hub Database](#canonical-hub-database)
- [Device State Store](#device-state-store)
- [Synchronization Protocol](#synchronization-protocol)
- [Example Synchronization Flow](#example-synchronization-flow)
- [Conflict Resolution](#conflict-resolution)
- [Hub Backup and Transfer](#hub-backup-and-transfer)
- [Standby Hub — Later](#standby-hub--later)
- [Persistence policy, scope and consent are separate dimensions](#persistence-policy-scope-and-consent-are-separate-dimensions)
- [Sync Protocol Minimum Acceptance Contract](#sync-protocol-minimum-acceptance-contract)
- [As built in Phase 31D (synchronization)](#as-built-in-phase-31d-synchronization)
- [As built in Phase 31E (Hub web shared state)](#as-built-in-phase-31e-hub-web-shared-state)
- [As built in Phase 31G (backup, restore and transfer)](#as-built-in-phase-31g-backup-restore-and-transfer)
- [As built in Phase 31J: collaborative documents and realtime depth](#as-built-in-phase-31j-collaborative-documents-and-realtime-depth)
- [Planned for SaveSphere (Phases 32-SS1 to 32-SS6)](#planned-for-savesphere-phases-32-ss1-to-32-ss6)
- [Migration from the delivered local stores](#migration-from-the-delivered-local-stores)
- [Backup consistency, restore and authority transfer](#backup-consistency-restore-and-authority-transfer)

## Authority Model

A configured environment has one authoritative Hub. Clients own local execution, device/private state, cached replicas and durable outboxes; they never mount the canonical Hub database. Standalone operation needs no Hub. The master [Architectural Invariants](../DUDE_PRD.md#architectural-invariants) govern this model.

## Persistence Policy

Selected policy:

> Per-tool choice, with selective persistence as the default.

Each tool should declare one of the following:

- `none`: never persist;
- `session`: survive navigation and possibly refresh within session semantics;
- `local`: persist locally across sessions;
- `user-choice`: allow explicit opt-in.

## Default policy

Safe tool preferences may persist.

Potentially sensitive payloads should not persist automatically. This baseline per-tool retention policy remains distinct from the target data scopes and synchronization consent described below.

Examples of values that may persist:

- preferred indentation size;
- selected timestamp unit;
- regex flags;
- layout preference;
- selected hash algorithm.

Examples that should default to nonpersistent/session-only:

- JWT values;
- API keys;
- pasted headers;
- private JSON;
- large arbitrary text blobs;
- tokens.

The architecture should permit a tool to choose differently when justified.

## Canonical Data vs Device Data

The architecture must explicitly distinguish between:

**One canonical shared datastore plus N device-local state stores.**

For three computers:

The Canonical Hub Database supplies independent SQLite replicas/caches on Device A, Device B, and Device C.

Those SQLite databases are not competing sources of truth.

They serve as:

- replicas;
- caches;
- offline stores;
- local configuration stores;
- sync journals;
- device-private persistence.

## Data Scope Model

Every persisted DUDE entity or setting must declare a data scope.

The minimum scopes are:

| Scope | Authority | Examples |
|---|---|---|
| **Environment / Account** | Hub | favorites, global preferences, tool ordering |
| **Workspace / Project** | Hub when sync is enabled | pipelines, projects, saved workspaces |
| **Device** | specific device | local paths, terminal executable, Docker endpoint |
| **Local / Private** | current device only | temporary JWT input, clipboard content, private scratch data |

### Environment-scoped data

Examples:

```text
Theme
Favorites
Pinned tools
Tool ordering
Global formatting preferences
Account/profile metadata
```

A change on one device should synchronize to other devices.

### Workspace/project-scoped data

Examples:

```text
Project metadata
Saved pipelines
Saved workspaces
Notes
Saved request definitions
Environment metadata
```

These can be synchronized when enabled.

### Device-scoped data

Examples:

```text
Default terminal executable
Repository root
Docker socket
Local database endpoint
Native tool path
Machine capabilities
Window placement
Installed SDK discovery
Local AI model location
```

These intentionally differ between machines.

### Local/private data

Examples:

```text
Pasted JWT
Private key being inspected
Temporary JSON payload
Packet capture
Clipboard contents
Ephemeral tool input
Unsaved source code
```

These remain local unless the user explicitly saves/synchronizes them.

The product principle is:

> **DUDE synchronizes the workbench, not automatically the data passing through the workbench.**

SaveSphere (planned) keeps this principle. Its content is data the owner has explicitly decided to keep: saving a note, sharing to DUDE, forwarding an email or choosing a watched folder or import is the explicit save. Nothing passing through a tool becomes SaveSphere content without such an action. See [Planned for SaveSphere](#planned-for-savesphere-phases-32-ss1-to-32-ss6).

## Settings Must Be Scope-Aware

DUDE should not synchronize one monolithic settings JSON file.

Every setting should declare its scope.

Conceptually:

```ts
interface SettingDefinition<T> {
    key: string;
    scope:
        | 'environment'
        | 'workspace'
        | 'device'
        | 'local-only';

    defaultValue: T;
}
```

Examples:

```ts
{
    key: 'appearance.theme',
    scope: 'environment'
}
```

This should synchronize.

```ts
{
    key: 'terminal.executable',
    scope: 'device'
}
```

This should not synchronize across machines.

```ts
{
    key: 'security.rememberToolInputs',
    scope: 'local-only'
}
```

This remains device-local.

This scope model should also apply to:

- connection definitions;
- credentials;
- tool preferences;
- history;
- workspace state;
- plugin configuration;
- capability grants.

### As built in Phase 31B

`@dude/persistence` implements the declaration model; nothing synchronizes yet.

- **Core settings** are entries in `SETTING_DEFINITIONS` (key, namespace, scope, sensitivity, default, storage kind and whether the write journals). Current entries: appearance and reopen-on-restart (environment, journaled), the AI base URL and model (device, not journaled) and the AI API key (device, `secret` storage).
- **Tool keys** are classified by a policy rule: a `local` policy is a *preference* and resolves to `environment` scope; `session`, `user-choice` and `none` are *inputs* and resolve to `local-only`; `secure-local` resolves to `device`. A tool manifest may override one key with `settingScopes: { <key>: { scope, sensitivity? } }`; the conformance suite rejects an override for a key the tool does not actually persist.
- **The store records the resolved scope on every key/value write** (`kv.scope`), so a later phase can filter by scope without re-deriving it from code. Session-policy values stay in `sessionStorage` and never reach the store.
- **Entity scopes:** favorites, pipelines, user scripts, projects, workspace templates, home layout (with notes), usage/insights, appearance and reopen-on-restart are `environment`; workspace tab layout and the scratchpad are `workspace`; native recents are `device`; history, network runs, mutation journals, snapshot headers and PowerShell history are `local-only` or `device` and are never journaled to the outbox.
- A scope is a classification, not consent: the checked data-scope inventory (`npm run check:inventory`) fails on an unclassified storage site, and classifying a key `environment` does not make it sync-eligible.

## Canonical Hub Database

PostgreSQL was considered for a cloud-oriented backend; it is not the initial personal-Hub dependency.

For the self-hosted single-user/personal DUDE environment, **SQLite in write-ahead logging (WAL) mode is strongly recommended as the initial canonical Hub database**.

Example:

| Hub path | Contents |
|---|---|
| `service/` | Service implementation |
| `data/dude.db` | Canonical SQLite database |
| `storage/` | Managed files/artifacts |
| `backups/` | Backup packages |
| `config/` | Application configuration |

Advantages:

- no separate database server;
- simple installation;
- simple backup;
- no extra database port;
- no separate credentials/administrator;
- easy user ownership;
- excellent fit for one user and a small number of personal devices;
- easy portability when transferring the Hub.

The Hub application must be the only normal writer to the canonical database. Canonical authority applies to synchronized shared state; devices remain authoritative for their own device/private records.

Other DUDE devices do not mount or directly open the Hub SQLite file.

They communicate through:

```text
HTTPS API
WebSocket / realtime protocol
Synchronization protocol
```

### PostgreSQL remains a future option

Repository/data-access abstractions should allow the canonical storage implementation to move to PostgreSQL later if DUDE expands into:

- many users;
- teams;
- large deployments;
- heavy collaboration;
- significantly more concurrent devices;
- higher write concurrency.

PostgreSQL should be an implementation option, not a mandatory dependency for personal DUDE. SaveSphere keeps this: its content store, full-text and vector indexes and blob store are embedded in the Hub ([PD-118](../delivery/PHASE32SS_PLAN.md)), and PostgreSQL is not a requirement ([PD-140](../delivery/PHASE32SS_PLAN.md)).

### As built in Phase 31C (Hub)

The Hub's canonical database is `data/dude.db`, opened by the Hub process alone through `@dude/sqlite-store` (`node:sqlite`, WAL, `synchronous=FULL`, `quick_check`, checksummed numbered migrations). Under the service it lives in `%ProgramData%\DUDE\Hub`; before a migration step on an existing database the Hub writes a `VACUUM INTO` copy to `data/pre-migration/` (the `backups/` directory is the default folder for the Hub's own `.dudebackup` files and receives data moved aside by a restore, see [As built in Phase 31G](#as-built-in-phase-31g-backup-restore-and-transfer)). Opening a database whose `minReaderVersion` is newer than the running Hub is refused, so an older Hub cannot open a newer database. Ten migrations exist (`0001-initial` to `0010-collab`; 0003 is sync, 0006 and 0007 are the 31F flood and step-up tables, 0008 the 31G re-pair columns, 0009 the 31J notifications table and notification-reader grant column, and 0010 the 31J collaborative-document tables). 0010 is the first migration to raise `minReaderVersion` (to 10), so a pre-31J Hub refuses the database instead of writing records next to a Y.Doc it does not know.

| Table group | Tables | Holds |
|---|---|---|
| Plumbing | `meta`, `schema_migrations` | Hub instance ID, schema and reader version; applied steps with checksums |
| Identity | `environment`, `owner`, `owner_credentials`, `recovery_codes`, `setup_state` | The Hub-minted environment, the single owner, the Argon2id credential, hashed single-use recovery codes, the one-time setup or owner-reset token (hashed) |
| Sessions | `sessions` | Hashed cookie and device-bound bearer sessions with idle and absolute expiry |
| Devices | `devices`, `device_keys`, `device_tokens`, `challenges`, `pairing_codes` | The registry (including the recovery-trust flag), Ed25519 public keys, hashed access tokens, single-use challenges and pairing codes |
| TLS | `tls_pins`, `tls_pin_acks` | Active, next and retired certificate pins and per-device acknowledgements |
| Hardening | `throttle`, `ip_blocks`, `audit_events` | Persisted failure throttles and temporary address blocks; the append-only audit log (closed event list, credential-free details, retained 365 days or 100,000 events) |
| Canonical records | `records`, `change_feed`, `applied_ops` | Entity rows keyed by environment, type and ID with revision, tombstone and schema version; the global monotonic change feed; applied op IDs for duplicate suppression |
| Sync (0003) | `device_sync_state`; `meta` keys `sync_floor` and `sync_retention_days`; a `records(environment_id, revision)` index | Per-device reported cursor, counts, consent and last push/pull times; the compaction floor and retention |
| Notifications and jobs (31J; the table and column are migration 0009) | `notifications`; `devices.notifications_access`; `meta` keys `job_last:<id>` | Owner notifications deduplicated by source key, with read and dismiss times; the per-desktop notification-reader grant; each background job's last run. Notifications and `job_last:*` are scrubbed from backups |
| OIDC sign-in (0011, 32-SS1) | `linked_identities`, `oidc_flows` | The owner's linked Google accounts by provider subject (`sub`; the address is display text) and the transient in-flight authorization requests (hashed `state` and `nonce`, the PKCE verifier until the flow is consumed). Both are scrubbed from backups and on restore: a restored Hub is a new instance, so the owner signs in by password or recovery code and links Google again ([PD-145](../delivery/PHASE32SS1_PLAN.md)) |
| Collaboration (0010, 31J) | `collab_docs`, `collab_updates`, `collab_snapshots`, `collab_bases` | Compacted Y.Doc state per document key, the update tail since the last compaction, history snapshots, and the materialized payload per record revision used as a merge base ([As built in Phase 31J](#as-built-in-phase-31j-collaborative-documents-and-realtime-depth)) |

`commitCanonical` writes the record, its change-feed entry and the applied op ID in one transaction under one global revision. A duplicate op ID returns the recorded revision without writing, and a rejected commit rolls back completely. `commitCanonical` now enforces the per-entity [sync policy](#conflict-policy-by-entity) (revision checks, owner-device usage records, size and payload validation) and is reached only through the device-authenticated `/api/v1/sync` routes ([As built in Phase 31D](#as-built-in-phase-31d-synchronization)); the Hub is still the only writer and CLI commands never touch the file.

**Environment identity.** The Hub mints `environmentId` and `hubInstanceId` at owner bootstrap ([PD-036](../history/DECISION_LOG.md#phase-31c-implementation-decisions)). A device keeps its standalone `meta.environment_id` and its local records unchanged when it enrolls, and stores the Hub's environment ID separately in its `hub_enrollment` row. The first-sync flow of Phase 31D re-keys local records to the canonical environment after the user decides (the old ID is kept as `standalone_environment_id`), so a second device with its own standalone ID can enroll without a reconciliation problem.

## Device State Store

Each installed desktop/laptop should have a local device state store.

Recommended initial implementation:

```text
SQLite
```

The Device State Store contains:

```text
cached synchronized settings
cached projects/workspaces
cached pipelines
device-specific settings
local-only history
local metadata
sync cursor/version information
pending sync operations
offline mutation outbox
```

It may also contain local records for native features, provided sensitive information is handled appropriately.

Ephemeral tool content should not be persisted by default.

### As built in Phase 31B (desktop)

The desktop Device State Store is the SQLite file `userData/device-store/dude-device.db`, opened through Node's built-in `node:sqlite` (`DatabaseSync`) in WAL mode with `synchronous=FULL` and foreign keys on. It is owned by the resident per-user Device Agent process (`apps/device-agent`; in 31B an Electron utility process, the *state service*, replaced in 31C); Electron main is the only broker and the renderer never holds a handle or channel to it. Beside the database are `backups/` (pre-upgrade `VACUUM INTO` copies, last three kept) and `quarantine/` (refused or corrupt stores). The Agent is a different thing from the privileged Device Agent execution boundary described in the [system architecture](SYSTEM_ARCHITECTURE.md#device-state-store-service-vs-device-agent).

| Table | Holds |
|---|---|
| `meta`, `schema_migrations` | Store ID, schema and minimum-reader version, device and environment IDs, display name, machine salt/hash, `cloned_from`, startup and clean-exit marks, import flags; applied migration steps with checksums |
| `kv` | Per-tool and core key/value pairs with policy and resolved scope |
| `records` | Entities with type, ID, environment, scope, schema version, local revision, a nullable Hub revision and the payload |
| `outbox` | One coalesced op per entity (`UNIQUE (entity_type, entity_id)`), written in the same transaction as its record |
| `history_entries`, `network_runs` | Local History and network runs, retention enforced inside each write transaction |
| `mutation_journal`, `snapshot_headers`, `powershell_history`, `device_docs` | Filesystem/system mutation journals, snapshot metadata (bodies stay on disk), PowerShell history, and desktop documents such as preferences, window bounds and hotkeys |
| `secret_refs`, `secret_values` | Secret references and their `safeStorage` ciphertext, deleted together |

**Writes.** Entity mutations commit immediately and are awaited; key/value writes debounce for one second in the renderer and flush on window close and quit, except journaled settings, which commit at once. The store, not the renderer, decides whether a write journals: only the explicit list of favorites, pipelines, user scripts, projects, workspace templates, appearance, reopen-on-restart, home layout and usage/insights does. Each journaled change writes its record and one outbox op atomically; ops coalesce per entity (a later upsert replaces an unsent one, an unsent upsert followed by a delete leaves no op, a delete followed by an upsert becomes an upsert). The outbox is bounded (`OUTBOX_MAX_ROWS`) and surfaces backpressure instead of dropping edits. Ops carry the status `unsent-standalone` while the device is standalone; Phase 31D replays them once the device is enrolled.

**Reads.** `main.ts` awaits a boot snapshot of the store before bootstrapping Angular, and services keep synchronous signals over an in-memory cache.

**Migrations.** A versioned runner applies numbered steps, each in its own transaction, idempotent and resumable, after a `VACUUM INTO` backup. Shipped steps are checksummed and never edited. A store whose `minReaderVersion` is newer than the running build is refused and quarantined rather than reinterpreted, and the app enters degraded mode.

**Failure.** Main reconnects to (and, when none answers, respawns) the Device Agent with 0.5, 2 and 8 second backoff. More than three crashes in two minutes moves the app to a degraded in-memory mode with a persistent banner offering retry, open recovery folder and reset; JSON journal fallbacks are drained back into the store on the next healthy start.

**Identity.** The device ID is a UUIDv7 stored with a salted hash of the Windows MachineGuid. If the hash no longer matches at startup the store was copied: a new device ID is minted, the old one is kept as `cloned_from`, unsent outbox ops are rewritten to the new device and secrets are marked as needing re-entry. A reset or reinstall produces a new device. The display name defaults to "Windows PC" and is never taken from the hostname.

**Web.** The web build has no SQLite and no outbox. It keeps its browser storage adapters behind the same repository ports, plus a stable per-browser installation ID that Clear all data preserves.

### As built in Phase 31C (Hub enrollment)

Device-store migration 0002 adds the single-row `hub_enrollment` table (state `enrolled` or `revoked`, Hub instance and environment IDs, URL, protocol version, active and next SPKI pins with certificates, key ID and public key, the CurrentUser-DPAPI-wrapped Ed25519 private key, and enrollment, last-contact and revocation times). It is additive and keeps `minReaderVersion` at 1, so an older build opens the store and behaves as a standalone device. `EnrollmentState` is `standalone | enrolled | revoked` and `EnvironmentRecord.kind` gains `hub`. Clone detection and *Reset this device* clear the enrollment; *Clear data* keeps it; the renderer-facing `hub.enrollment` view carries no key material. Settings > This Device shows standalone, enrolled or revoked. Enrolling uploads only the pairing proof and device metadata (display name, platform, app version, capabilities, public key) after an explicit disclosure; no records are uploaded.

### As built in Phase 31D (device store sync)

Device-store migration 0003 adds `outbox.reason`, `outbox.attempts` and `outbox.last_attempt_at`; `records.hub_payload_json` (the last Hub version seen, the merge base); `kv_sync` (Hub revision and base per synchronized key); the single-row `sync_state`; and `sync_conflicts` (the permanent inbox). It is additive and keeps `minReaderVersion` at 1. Usage records are re-keyed per device (entity id equals the device id) and summed on read. Syncable `local` settings (tool-id-shaped namespace, stored scope `environment`, or a `SETTING_DEFINITIONS` entry marked `journal`) journal as per-key `setting` operations; `KV_ENTITY_BINDINGS` maps `__workspace__:layout` and `__workspace__:scratchpad` to the `workspace-layout` and `scratchpad` entities. Operation status is derived from enrollment: `pending`, `stranded` or `unsent-standalone`. Re-editing coalesces outbox rows. The sync engine lives in `apps/device-agent/src/sync` (apply-remote, push-results, rebase, conflicts, quarantine, status, runtime) and exposes `sync.*` RPCs plus `sync.status` and `sync.applied` frames that the desktop relays to the renderer.

## Synchronization Protocol

Synchronization should be **hub-and-spoke**, not peer-to-peer.

Do not build:

Direct Desktop A ↔ Desktop B ↔ Laptop peer synchronization is excluded.

Build:

Desktop A, Desktop B, and Laptop C each synchronize with the same DUDE Hub.

Devices do not need to discover or directly synchronize with one another.

This means:

- Desktop A does not need Desktop B to be online;
- devices can reconnect independently;
- the Hub owns authoritative revision history;
- conflict behavior is centralized.

## Example Synchronization Flow

Suppose a user changes a favorite on Desktop B.

Desktop B favorites JSON Formatter → the Device Store records a synchronization mutation → the Hub updates its canonical database and notifies Main Desktop and Laptop.

Suppose Laptop C is offline.

It retains its cached state.

When it reconnects:

Laptop C requests changes since revision N from the Hub, then updates its local replica.

## Conflict Resolution

Initial synchronization should use conventional revision-based mechanisms.

Recommended entity metadata:

```text
id
revision
updatedAt
updatedByDeviceId
```

Mutations should include the revision they were based on.

Example:

```text
UPDATE Pipeline X
basedOnRevision: 17
```

For most data:

- optimistic concurrency;
- revision comparison;
- explicit conflict handling;
- last-write behavior only where acceptable.

Do not implement CRDTs for every entity.

Use Yjs/CRDT behavior selectively for genuinely collaborative documents or editing surfaces where concurrent merge semantics provide value.

## Hub Backup and Transfer

Because the user owns the Hub, backup and migration are product requirements.

A Hub should be exportable into an encrypted backup package containing the canonical environment state.

Conceptually:

DUDE Hub exports canonical environment state into an encrypted DUDE Backup package.

The backup should cover appropriate:

- environment records;
- device registry;
- settings;
- projects;
- workspaces;
- pipelines;
- sync metadata;
- application configuration.

Secrets require separate handling according to the credential model.

With SaveSphere, a backup must also cover the SaveSphere content store, the blob store (originals, attachments and derived files) and the encrypted vault. Phase 32-SS1's backup v2 ([PD-124](../delivery/PHASE32SS_PLAN.md)) makes backups streaming and incremental and removes the 31G size ceiling for this reason.

### Hub transfer

If Main Desktop fails or is replaced:

On Second Desktop, explicitly select “Promote this device to DUDE Hub,” then restore the Hub backup.

Then restore the Hub backup.

After promotion:

After promotion, Second Desktop runs Client: yes; Agent: yes; Hub: yes.

Other clients reconnect to the new Hub endpoint.

## Standby Hub — Later

A future feature may maintain an encrypted backup/replica on another owned machine.

Example:

Main Desktop is PRIMARY HUB; encrypted backup or controlled replication flows to Second Desktop as STANDBY HUB.

If the primary fails, the user explicitly promotes the standby.

Initial versions should avoid automatic multi-master/failover consensus.

Automatic leader election would introduce:

- distributed consensus;
- quorum;
- split-brain handling;
- failover fencing;
- distributed DB complexity.

That is not necessary for the personal DUDE target.

Phase 32-SS1 plans the first step toward this: another DUDE device as a backup destination (warm standby), still promoted manually through the 31G restore and transfer ([PD-123](../delivery/PHASE32SS_PLAN.md), [PD-124](../delivery/PHASE32SS_PLAN.md)). Automatic failover remains out of scope (Phase 96).

## Persistence policy, scope and consent are separate dimensions

`none` / `session` / `local` / `user-choice` and secure-local credential storage govern **whether and how** content is retained. Environment/workspace/device/local-private scope governs **who owns it and whether it may synchronize**. Making a record durable locally does not make it eligible for synchronization.

Every persistent entity needs a stable ID, schema version, declared scope and sensitivity classification. Shared entities also need environment identity and canonical revision metadata. Workspace/project membership must not implicitly promote nested payloads, secrets, absolute local paths or history into shared data. Preferences and definitions are separable from the input/output content they reference.

Connection metadata may contain a selected shared host/port/database definition, but a machine-specific endpoint or socket stays device-scoped. Model a shared connection definition plus explicit device bindings/credential references; do not overwrite every machine's local configuration with one device's paths or secrets. Synced project references use logical identity and per-device path mapping. Unresolved local references produce a missing-binding state instead of an automatic file scan/upload.

Existing local history, native recents, System Changes, filesystem mutation journals, crash recovery and private scratch data remain local by default and are never journaled. Favorites, selected workbench definitions, usage/insights aggregates (frequency and recency counters, not tool inputs or outputs) and the Home layout with its notes are `environment`-scoped and are sync-eligible **only after explicit environment enrollment and per-category consent** (usage defaults off); Phase 31D transmits them after the first-sync confirmation. Local analytics do not become Hub telemetry merely because synchronization exists, and enrollment must let the user keep usage local.

## Sync Protocol Minimum Acceptance Contract

These requirements make the planning model implementable without committing to a particular HTTP framework or wire format:

1. Persist a shared-record local change and its outbox operation atomically. Each operation has a unique operation ID, environment/device identity, entity/type, operation kind, schema version and `basedOnRevision`; the Hub authenticates identity independently of claimed fields.
2. The Hub validates authorization, data scope, schema and expected revision; commits the canonical mutation and its change-feed entry atomically; and returns a stable acknowledgment/revision. Duplicate operation IDs must not apply a mutation twice after timeout/retry.
3. Devices replay durable queued changes with bounded retries/backoff and observable error state, acknowledge only committed operations, and resume after process or network interruption. Quarantine incompatible/rejected operations for review rather than looping silently or discarding them.
4. Use Hub-assigned monotonic change cursors and revisions. Client timestamps are display/audit metadata, not the sole conflict-resolution authority. A realtime notification prompts catch-up; durable change feeds remain authoritative if a notification is lost.
5. Explicitly model deletes/tombstones and cursor retention. A client older than retained history must receive a controlled snapshot/rebase flow that preserves its pending outbox and prevents deleted-record resurrection. Schema migrations and cursor invalidation must have a documented recovery path.
6. Limit payload sizes, batches and stored outbox growth; expose backpressure/repair state instead of silently dropping edits. Limits are measured and recorded during implementation; this PRD does not invent unvalidated numeric capacity targets.
7. Keep simple preference/favorite conflict policies documented by entity. Permit last-write behavior only when loss is acceptable; preserve competing pipeline/workspace/project changes as inspectable versions for explicit resolution. Never silently discard an offline pipeline edit.
8. Use Yjs only for approved collaborative editing surfaces, not as the generic database replication protocol. Collaborative content persistence, permissions and retention require separate opt-in and lifecycle rules. The approved surfaces are the three from 31J (PD-099). SaveSphere rich documents (32-SS2) and canvases (32-SS4) are the planned additions, with their own consent category, permissions and retention ([PD-126](../delivery/PHASE32SS_PLAN.md), [PD-130](../delivery/PHASE32SS_PLAN.md)).
9. Revocation stops subsequent Hub operations. Revoked or expired credentials must never be treated as permission to create a new authority or bypass authentication. Retained offline data remains subject to local access policy.
10. Device sync never executes a pipeline, script, request, shell command or mutation as a side effect of applying a definition. Restoring a workspace restores data/UI intent, not a privileged action.

## As built in Phase 31D (synchronization)

**Delivered in Milestones 649-661, documented here as the contract.** Rationale and amendments are in [PD-038 to PD-049](../history/DECISION_LOG.md#phase-31d-implementation-decisions); evidence is in [Phase 31D acceptance](../delivery/PHASE31D_ACCEPTANCE.md). Limits live in `SYNC_LIMITS` (`@dude/sync`): 128 KiB per record, 100 operations and 512 KiB per push, pages of 500, 90 days default retention. Measured behavior is in the acceptance document.

### Categories and consent

Consent is per category and applies only to an enrolled environment, after the first sync is confirmed. A disabled category's operations are held locally, and re-enabling a category forces a full snapshot rebase. A setting key syncs only if the Hub's `isSyncableSettingKey` (tool manifests and `SETTING_DEFINITIONS`) accepts it; the device quarantines the rest, and non-tool app namespaces do not sync.

| Category | Entity types | Default |
|---|---|---|
| settings | `setting` (per key, `environment`-scoped keys only) | on |
| favorites | `favorite` | on |
| pipelines | `pipeline`, `user-script` | on |
| projects | `project` | on |
| workspaces | `workspace-template` | on |
| home | `home-layout` | on |
| usage | `usage` | off |
| workspace-layout | `workspace-layout` | off |
| scratchpad | `scratchpad` | off |
| collab-documents | `markdown-doc` (Markdown documents kept on the Hub; optional on the wire, so a pre-31J client reads as off) | off |

### Conflict policy by entity

| Entity type | Policy | Apply mode | Conflict behavior |
|---|---|---|---|
| `setting` | `lww` | live | Hub order wins; no inbox |
| `favorite` | `lww` | live | Hub order wins; no inbox |
| `pipeline` | `merge3` | live | Field merge; otherwise inbox |
| `user-script` | `merge3` (from 31J `body` merges as text and `updatedAt` takes the later ISO time) | live | Field merge; otherwise inbox |
| `project` | `merge3` (`lastActivatedAt` takes the later ISO time) | live | Field merge; otherwise inbox |
| `workspace-template` | `merge3` | live | Field merge; otherwise inbox |
| `home-layout` | `merge3` | live | Field merge; otherwise inbox (no Keep both) |
| `usage` | `per-device` (entity id is the device id) | live | None; summed on read |
| `workspace-layout` | `lww` | next launch | Hub order wins |
| `scratchpad` | `merge3` (from 31J `snippets` is a keyed list by `id`: additions and removals per side, a removal wins over a concurrent edit, `title` and `body` merge as text) | live | Field merge; otherwise inbox (no Keep both) |
| `markdown-doc` | `merge3` (`body` merges as text, `updatedAt` takes the later ISO time) | live | Field merge; otherwise inbox |

### Outbox status machine

An operation is journaled atomically with its change and carries one stored status: `unsent-standalone` (not enrolled), `pending` (enrolled, awaiting push), `quarantined` (rejected by the Hub with a reason; user retries, discards or exports) or `stranded` (device revoked). Enrolling turns `unsent-standalone` into `pending`; revocation turns `pending` into `stranded`; Continue standalone returns `stranded` to `unsent-standalone`. **Held** is derived, not stored: a `pending` operation whose category is disabled or whose first sync has not completed. Applied and duplicate acknowledgements delete the operation only if it is unchanged since it was sent; an automatic merge assigns the operation a new id so an in-flight push of the older payload cannot clear it. A schema-newer remote record is deferred (cursor advances, `lastError` `needs-update`) and returns on a later rebase.

### Wire endpoints

All under `/api/v1`; device credential unless noted. Contract: `@dude/contracts/hub` `sync.schema.ts`.

- `POST /sync/push`: `{ ops }` to per-operation `applied`, `duplicate`, `conflict` (with the current record) or `rejected` (with a reason). From 31J a client that sends `accept: ['merged']` may also receive `merged` (with the revision and the merged record) for a collaborative entity ([Merging non-Yjs writes](#as-built-in-phase-31j-collaborative-documents-and-realtime-depth)).
- `GET /sync/changes?after&limit`: records changed after a revision, one entry per entity at its latest revision, tombstones included; `410 cursor-expired` below the floor.
- `GET /sync/snapshot?afterType&afterId&limit`: paged live records and `asOfRevision`.
- `PUT /sync/state`: the device reports cursor, counts and category consent; returns floor, head revision and retention days.
- `GET /sync/summary` (owner): counts per category, head revision, floor, retention, and lag and counts for active devices.
- `POST /sync/environment/clear/preview` and `POST /sync/environment/clear` (owner): the two-step Hub delete.
- Realtime `changes-available { revision }`, sent only to device sockets; a poll backs it up. 31D raised `HUB_PROTOCOL_VERSION` to 2 (minimum client 1) and a device reports `hub-outdated` against an older Hub; 31J raised it to 3 for the realtime-depth events and the collaboration socket, with the minimum client still 1.
- Audit: a push is audited with counts only, a snapshot on its first page, owner summary and environment clear preview/apply by event; `changes` and `state` are not audited. Payloads are never audited.

### Retention and rebase algorithm

1. The Hub keeps `retentionDays` (default 90) of history. Compaction (at startup and every six hours) deletes change-feed rows at or below a new **floor**, drops tombstones and applied operations at or below it, and raises the floor. The head revision reported is `max(feed, floor)`, and an upsert based on a compacted tombstone conflicts instead of resurrecting the record.
2. A device calling `changes` with `after` below the floor receives `cursor-expired`.
3. The device pulls a snapshot. The first page fixes `asOfRevision`; the device then pulls changes from that revision.
4. A local record that has a Hub revision but is absent from the snapshot was deleted on the Hub and is removed locally. A pending edit to it becomes an edit-delete conflict in the inbox, so the delete is not resurrected and the edit is not lost.
5. A local record that was never synced (a create with no Hub revision) is kept and pushed.
6. Pending operations survive the rebase; records present in the snapshot follow the normal apply rules.

### Revoked devices

Revocation stops every Hub call. The device freezes: operations become `stranded`, local data is kept and no credential is refreshed. The user may **Continue standalone** (the Hub link is dropped and stranded operations become `unsent-standalone`) or **re-pair** with a new key and run the first-sync preview again. A revoked key is never reinstated and the Hub never remote-wipes the device. Standalone conversion (also on unenroll) drops all outbox rows; the data stays in `records` and a later enrollment's first sync re-journals local-only data.

### First sync, lifecycle and live apply

Before anything is sent, a device with local records shows a preview and the user picks **Merge** (recommended for the default-on categories), **Use Hub** or **Keep local** (recommended for usage, workspace layout and scratchpad) per category. **Use Hub** runs behind a `VACUUM INTO` recovery snapshot and a single-use token and is resumable per category; the device re-keys to the Hub environment and every enrollment restarts the first sync. **Clear data** on an enrolled device keeps the enrollment and a rebase re-pulls; an optional **Also delete from Hub** is an owner-session, digest-bound two-step where a Hub failure wipes nothing. **Reset this device** unenrolls best-effort. Previews disclose unsent operations, and the high-consequence gate holds their confirmation-boundary specs.

Remote changes apply live through `applyRemote` on the entity collections and the key/value backend; workspace layout is held for the next launch, the pipeline builder reloads silently, and a changed scratchpad shows a notice (Phase 31J replaced the silent reload with a merge into the open editor and, where a Hub collaboration transport exists, made the open scratchpad drawer live; see [As built in Phase 31J](#as-built-in-phase-31j-collaborative-documents-and-realtime-depth)). Remote key/value deletes remove the cache entry but do not reset open signals until reload. The renderer surfaces state in Settings › Sync and the shell sync indicator ([UX](../product/UX_SPEC.md#environment-device-and-synchronization-navigation)).

## As built in Phase 31E (Hub web shared state)

**Delivered in Milestones 677-681, documented here as the contract.** Rationale and amendments are in [PD-050 to PD-054](../history/DECISION_LOG.md#phase-31e-implementation-decisions); evidence is in [Phase 31E acceptance](../delivery/PHASE31E_ACCEPTANCE.md). Limits are the 31D `SYNC_LIMITS`; browsers use the same record, operation and payload formats as the Agent.

**Browser rows.** A signed-in Hub web browser attaches a key-less `kind: 'browser'` device row (Hub migration 0005: `devices.kind`, `installation_id`, `last_session_at`, `sessions.browser_device_id`, `web_access`) keyed by its installation id. The row owns the browser's usage records and audit attribution and appears in Devices; it can never obtain a device token, enroll, be recovery-trusted or block pin rotation. Revoking or removing it ends its sessions, and a row with no session for 90 days is pruned. Sign-out wipes the installation id, so each sign-in after a sign-out creates a new row.

**Web routes.** `POST /api/v1/web/attach`, `GET /web/snapshot`, `GET /web/changes`, `POST /web/push`, `PUT /web/state` and `GET`/`PUT /web/access` reuse the sync contracts and `commitCanonical` (same policy enforcement, revision checks and change feed) with the browser row as the acting device. They accept the owner cookie session only (CSRF and Origin checks; bearer and device credentials get 401). A session without a browser row gets `not-attached` and must attach first. Records are filtered by per-category web access, an environment-level setting whose defaults match the desktop consent defaults (usage, workspace layout and scratchpad off); a disabled category is rejected as `category-disabled`. Desktops see browser edits as ordinary changes with the browser as origin. The sync summary reports each device's kind and the Agent-reported `paused` flag.

**Realtime.** The Hub sends `changes-available` to owner sockets (browsers) as well as device sockets, and `web-access-changed` to owner sockets when web access is toggled. REST carries all data; the nudge only costs latency if lost. The browser's realtime client (same-origin WebSocket, hello and welcome, heartbeats, backoff, 15 s polling while down) pulls changes from its cursor into live apply, re-snapshots on an expired cursor, reloads on web-access changes and locks to sign-in when the session ends. While not live the heartbeat probes the change feed so an HTTP-only failure recovers.

**Seeding and the Hub-wins rule.** Boot attaches and pages the snapshot before bootstrap. On first attach, origin-local copies of shared keys are dropped: the Hub wins and there is no first-sync preview. Syncable `environment` keys live in memory behind the Hub kv backend and are pushed in debounced batches; local-only keys stay in browser storage. Entity collections are optimistic with rollback.

**Conflicts in the browser.** Writes carry `basedOnRevision`. For `lww` and `per-device` policies a conflict re-pushes; for `merge3` the browser runs the `@dude/sync` three-way merge against the base it read, re-commits a clean merge and opens a Keep Hub / Keep mine / Keep both dialog for a real conflict. Nothing is parked and there is no browser outbox or conflict inbox, so the never-silently-discard contract holds through the immediate prompt.

**Online-only writes and offline boot.** While the Hub is unreachable (any 5xx, including the service worker's 504, counts as unreachable, except a 503 `hub-transferred`, which is a retired Hub and locks the page instead) shared writes are rolled back with a notice and never written locally; loaded tools keep working. If the Hub is unreachable at boot, Hub web starts read-only for shared state and reloads when the Hub answers. Session expiry locks to sign-in without wiping.

**Sign-out wipe.** Signing out clears local and session storage (including the installation id) and every IndexedDB database, then hard-navigates to sign-in. The service worker's public asset caches are kept; no private data enters them.

**Authority gate (Phase 31G, [PD-071](../history/DECISION_LOG.md)).** Before sign-in or attach, Hub web boot calls the public `hello` and judges the Hub against the one record this browser keeps (`dude:v1:__device__:hubAuthority`: Hub instance id and highest authority epoch seen; a `local-only` core setting, never synced). A browser refuses a Hub with a lower epoch than it has seen (a different instance must be strictly higher) and a `transferred` Hub, showing a full-page blocking notice instead of the sign-in page or app: "This Hub was moved" (Check again) or "This Hub is older than the one this browser used before" with both epochs and "Forget the previous Hub and continue", which replaces the record. A failed `hello` falls through to the ordinary boot. A running page that later gets `hub-transferred` (the fetch transport reports it once, wherever it was seen, 503 only with that code) or realtime close 4004 locks writes, stops the realtime link and shows the same notice; `hub-transferred` is never treated as an outage and never retried. Sign-out wipes the record with the origin: that only drops the downgrade guard for the next sign-in, never data.

**Sync UI.** Hub web has a browser `SyncPort` behind the shell indicator and Settings › Sync: Live, Hub unreachable (changes paused), Session expired and Reload needed states, Sync now, environment-level web-access toggles (never desktop consent) and a per-device table from the summary (kind, cursor and lag, pending, conflicts, quarantined, paused, last push and pull). Desktop conflicts and quarantine hand off to DUDE Desktop; first-sync, pause, quarantine and standalone panels are desktop-only.

**Not delivered.** A browser offline outbox, a server-side conflict inbox and end-to-end encrypted categories (Phase 82). Hub collaboration persistence was added by Phase 31J ([as built](#as-built-in-phase-31j-collaborative-documents-and-realtime-depth)). Android shell/sync (31H, with its acceptance recorded in the 31I gate) and the executable Android tools (31I, [as built](#as-built-in-phase-31i-tool-state-on-android)) are delivered and described below.

## As built in Phase 31G (backup, restore and transfer)

Phase 31G (Milestones 700-719, decisions [PD-069-PD-074](../history/DECISION_LOG.md#phase-31g-implementation-decisions) with the amendments recorded there) made restoring a Hub and moving it to another machine safe for the devices that depend on it. The file format, the key handling and the fence are in [Security](SECURITY_ARCHITECTURE.md#as-built-in-phase-31g-backup-restore-and-transfer); this section is the synchronization contract. Evidence is in [Phase 31G acceptance](../delivery/PHASE31G_ACCEPTANCE.md).

**Authority epoch and instance id.** The Hub keeps `authority_epoch` (positive integer, 1 when absent) and `authority_state` (`active` or `transferred`) in `meta`. A restore assigns a new `hub_instance_id` and epoch = the backup's epoch + 1; `backup reactivate` bumps a retired Hub's epoch. The epoch and state are optional fields on `hello`, the device token response, the realtime welcome and the sync responses, so an older Hub reads as epoch 1 and there is no protocol bump. The instance id is the second guard when two restores of one backup land on the same epoch.

**Device detection.** The device store stores the epoch next to the instance id it already holds (device-store migration 0005, `hub_enrollment.authority_epoch`). `hello` is checked at the start of every connect and again in refresh, token, welcome and revoke confirmation, so a changed Hub is never read as a revoked device. In order, a different instance id (`instance-changed`), a `transferred` state (`transferred`) or a lower epoch (`epoch-lower`) moves the connection to `authority-changed` and the sync phase to `needs-reconcile`: no push or pull happens, local data and the outbox are kept and one recovery snapshot (prefix `authority-changed`) is taken per changed authority.

**Cursor-ahead and history-regressed.** Independently of the hello check, a persisted `sync_reconcile_required` flag (reasons `cursor-ahead`, `epoch-lower`, `history-regressed`) blocks sync with the same phase and takes one `sync-reconcile` snapshot. A stored cursor beyond the Hub's head revision raises `cursor-ahead`. The rebase that replaces local state from a Hub snapshot (see [Retention and rebase](#retention-and-rebase-algorithm)) now refuses to run when an acknowledged local entity is newer than the snapshot's `asOfRevision`: a regressed entity is **not** un-acknowledged, the rebase aborts untouched, the cursor does not move and `history-regressed` blocks sync. A rebase that legitimately deletes anything takes a `rebase` snapshot first. This is the dangerous case the guard exists for: a stale backup restored over devices that had moved past it.

**Reconnect and first-sync preview.** `hub.reconnect` takes a pairing string (a re-pair code created for that device row, or a new Hub's ordinary code, which carries the Hub's URL and pin so the URL changes with it) and `acknowledged: true`. It is allowed from `offline`, `connecting`, `authority-changed`, `untrusted-tls`, `revoked` and `incompatible` (or while the reconcile flag is set) and never from `online` or standalone. It takes a `reconnect` recovery snapshot, replaces the enrollment (same device id, new key) and calls `resetHubBookkeeping`, which clears Hub revisions, merge bases, the pull cursor, `kv_sync`, first-sync progress, the pending-rebase marker and the reconcile flag and sets each outbox op's `based_on_revision` to null. It does **not** touch entities, the outbox ops themselves, the device identity or settings, so pending edits survive. The existing first-sync preview then offers Merge, Use Hub or Keep local; the recommended outcome after a restore is Merge, which yields the union of edits. A device whose Hub moved and whose old Hub is gone can reconnect from `offline` without a force-unenroll.

**Hub web.** The browser keeps only the local-only `__device__:hubAuthority` record; the boot gate and runtime lock are described in the 31E [Authority gate](#as-built-in-phase-31e-hub-web-shared-state) paragraph. A restored Hub's browser rows are not marked for re-pair: a browser signs in again and re-attaches.

**Not delivered.** Automatic failover or election, multi-master, live replication to a standby Hub and any partial-restore. A same-instance rollback by file copy can still receive one push batch before detection (a restored Hub cannot, because its device keys are revoked).

## As built in Phase 31J: collaborative documents and realtime depth

Phase 31J (complete; Milestones 787-815, decisions PD-099 to PD-115 in the [Phase 31J plan](../delivery/PHASE31J_PLAN.md), deviations recorded there, acceptance in [Phase 31J acceptance](../delivery/PHASE31J_ACCEPTANCE.md)) added Yjs collaboration for three surfaces, Hub-persisted collaborative state, presence, notifications, read-only job status and live owner views. The Hub still has one owner and one environment (PD-027): "collaboration" means the owner's own desktops, browsers and phone. Its physical and installed passes are owed ([acceptance](../delivery/PHASE31J_ACCEPTANCE.md#guided-manual-acceptance-script)). Authentication, limits and audit are in [Security](SECURITY_ARCHITECTURE.md#as-built-in-phase-31j-collaboration-notifications-and-presence).

### Collaborative surfaces and the Y.Doc mapping

Yjs is used only for the PD-099 surfaces; every other entity keeps its record policy above. `@dude/collab-doc` (imported only by `apps/hub` and `apps/web`; forbidden on mobile, absent from the Device Agent) owns the closed list of document kinds, the `kind:id` keys and the record-to-Y.Doc schemas:

| Document key | Y.Doc | Record and category |
|---|---|---|
| `scratchpad:default` | `Y.Map snippets` of per-snippet `Y.Map`s whose `title` and `body` are `Y.Text`, plus `Y.Array order` | `scratchpad` / `scratchpad` |
| `user-script:<id>` | `Y.Text body`; every other script field stays single-writer in the record | `user-script` / `pipelines` |
| `markdown-doc:<id>` | `Y.Text markdown` plus `Y.Map meta` holding the title | `markdown-doc` / `collab-documents` |
| `room:<id>` | `Y.Text markdown` only (the same root name, so a room can be kept as a `markdown-doc`) | none: Hub memory only |

Only the Hub seeds a document's initial content from its record. Materialization writes the collaborative fields back over the current record and keeps every other field. The package also holds the multi-hunk text apply (on `@dude/sync` `textHunks`), the binary frame codec (`[channel][kind: 0 sync | 1 awareness][y-protocols payload]`), the Hub awareness rewriter and the `CollabTransport` contract with the relay transport the desktop uses.

`markdown-doc` is a new entity (codec in `@dude/persistence`, scope `workspace`, sensitivity `sensitive`, `journaled: false`). Devices mirror kept documents through ordinary sync once `collab-documents` is on, but never journal a local edit to one: changes reach the Hub only through the live document.

### Hub persistence and materialization

Migration 0010 adds four tables: `collab_docs` (one compacted Y.Doc state per persisted key, never a room), `collab_updates` (the update tail since the last compaction), `collab_snapshots` (history) and `collab_bases` (the plain payload the Hub materialized or seeded from at a record revision, the merge base for non-Yjs writes). The record stays the interchange form; these tables are the live truth only while a document is edited. The migration raises the reader floor to 10.

An in-memory registry hands out document handles. It loads a document from its stored state plus tail (seeding it from the record once), folds the tail into the state after 200 updates, unloads a document 60 seconds after its last subscriber releases it, and refuses (`too-large`) an update whose materialized JSON would pass the 128 KiB record cap, using a trial apply on a clone when the update could reach it. A debounced materializer (2 seconds after the last edit, at most every 10 seconds) commits the plain record through `commitCanonical`, attributed to a verified recent editor (a desktop or a Hub web browser row), and records the new revision in `collab_bases`. The change feed, snapshots, consent filtering and every non-Yjs client (Android, an offline Agent outbox, older builds) therefore keep working unchanged. Tombstoning a record and clearing the environment delete the document's collaborative state.

### Merging non-Yjs writes

Before a push to a collaborative entity commits, the Hub opens the document and flushes its materializer synchronously, so a queued write never overwrites unflushed live edits; if the flush cannot write, the record is marked as behind the document and the write must merge or conflict. A write based on an older revision is merged three ways: the base is `collab_bases` at the writer's `basedOnRevision`, "theirs" is the live document (or the record when no collaborative state exists) and "ours" is the incoming payload, under the entity's field rules (`text` for the user-script and `markdown-doc` `body`, the keyed `snippets` list for the scratchpad, `max-iso` for `updatedAt`). A clean merge is committed and its difference applied to the Y.Doc as an ordinary forward edit attributed to the pusher, and the new revision is stored as a merge base; an applied write based on the current revision reaches the document the same way. An edit that arrived both as a Yjs frame and as an outbox write is therefore not duplicated.

The push result `merged` (`{revision, current}`) is returned only to clients that send `accept: ['merged']` (the Agent and Hub web); older clients still receive `conflict`. Both adopt a merged result without an inbox entry or dialog, and a retried merged operation receives the same result.

`mergeText3` in `@dude/sync` is dependency-free: code-point Myers diffs of each side against the base (beyond 600 edits the changed middle is one replacement), combined as concurrent collaborative edits combine. Deletions by either side are unioned, both sides' insertions at one position are kept with theirs first, and an identical insertion, or one contained in the other, is kept once. Because a diff can place the same insertion at different but equivalent gaps (`"X\n"` after a newline or `"\nX"` before it), each insertion first slides its movable part to the rightmost equivalent gap, so a twice-delivered edit next to unrelated edits in repetitive text is still kept once. The merge never fails and never adds markers; property tests cover idempotence and no loss. `merge3` gains the `text` and keyed-list rules, so devices and the Hub web conflict path merge the same way without Yjs.

### Consent

Collaboration on a document needs the same consent as syncing it (PD-103):

| Principal | Consent |
|---|---|
| Desktop device token | The category is on in the map the device itself last reported, and that report carries a `lastSyncAt` (the Hub's evidence of a completed first sync); the row is an active desktop in this environment |
| Owner bearer session (the Agent) | The consent of the device it is bound to; an unbound bearer has none |
| Hub web owner cookie session | The environment's web-access toggle for the category |

Rooms need no category. `collab-documents` is off by default for desktop consent and web access. It is optional in the strict state contracts, and `wireCategoryFlags` (`@dude/contracts/hub`) omits it unless it is on, so 31J clients and pre-31J Hubs keep accepting each other's state reports and a client that omits it reads as off. A change to web access or to a device's reported state rechecks every open subscription of the affected principals and ends those that lost consent with `consent-revoked`.

### Rooms and kept documents

Markdown Hub rooms are a third Markdown Workspace mode next to the unchanged LAN server and BYO relay. A room is a plain in-memory Y.Doc: at most 8 rooms of 8 participants, closed 5 minutes after its last participant leaves, never stored, materialized, snapshotted or backed up. Rooms are listed and created through `/api/v1/collab/rooms` (not audited). "Keep on Hub" (`POST /collab/rooms/:roomId/keep` with a title) is refused unless `collab-documents` is on for the caller; it creates a `markdown-doc` record through `commitCanonical` (audited `collab.document-kept`, ids only) and the client switches to the persisted document. Kept documents are listed (newest first, at most 500, not audited) and deleted through `/api/v1/collab/documents`; a delete is a tombstone through `commitCanonical` that ends the collaborative document and is audited `collab.document-deleted`. A kept document never expires on its own.

### History and retention

| Rule | Value |
|---|---|
| When | A persisted document that was edited is snapshotted 2 minutes after its last edit or when its last subscriber leaves, only when its collaborative content differs from the newest snapshot |
| Rate | At most one snapshot every 10 minutes per document (a restore ignores this) |
| Caps | 200 snapshots and 8 MiB per document; the oldest go first and the newest is always kept |
| Age | 30 days, pruned by the `collab-history-prune` job (at start, then daily) |
| Content | The materialized record payload, so a preview is the plain record shape |

Rooms never have history. `GET /api/v1/collab/history?doc=`, `GET /collab/history/:snapshotId` and the restore route require the document's category consent. A restore snapshots the current state first, computes the edits to the snapshot's content on a clone, applies them as a forward edit by the caller (the CRDT is never rewound, so a concurrent edit still merges), writes the record at once and is audited `collab.history-restored` without content.

The `collab-maintenance` job runs on the sync compaction cadence, just after it. It prunes `collab_bases` below the sync floor (a client based on such a revision gets `cursor-expired` anyway) and for documents whose record is gone, always keeping each document's newest base, and compacts the tail of stored documents that are not loaded. Manual and scheduled backups flush buffered updates and pending materializations immediately before the `VACUUM INTO` copy, so a restored Hub loads identical documents and records. The collaborative tables, history included, travel in backups and transfers; notifications and `job_last:*` are scrubbed, and rooms are never included.

### Clients and fallback modes

Hub collaboration is environment infrastructure behind the `HUB_COLLAB` port (PD-114), like sync: a desktop adapter over the Agent relay, a Hub web adapter (`core/hub-web/hub-collab.client.ts`) and an unavailable adapter for Pages and standalone builds. Tool manifests and the `collab-relay` capability are unchanged. `CollabDocService` shares one socket per page, ref-counts documents on channels 1-8, resyncs every open document over y-protocols after a reconnect, sends awareness with the Hub-assigned identity, replaces a document after a `too-large` refusal and maps refusals to a status (`connecting`, `live`, `reconnecting`, `offline`, `unavailable`, `refused`). The scratchpad drawer and `CollabTextSession` (the user-script body and Markdown documents and rooms) build on it.

| Mode | When | Behavior |
|---|---|---|
| Live | A Hub collaboration transport exists and the Hub accepted the document | Edits are shared as typed; the status reads "Live" or, while a desktop's link is down, "Live, reconnecting" |
| Read-only | Hub web while the Hub is unreachable | The shared text cannot be edited (shared writes on Hub web are online-only); editing resumes on reconnect |
| Local fallback | A desktop whose link stayed down for the 10-second grace, a refusal, or no transport (Pages, standalone, not enrolled, consent off) | The scratchpad and script body are saved as ordinary records (journaled through the outbox on a desktop; Pages and standalone keep the pre-31J Save-and-Reload drawer); after a desktop's link returns and nothing is pending or unsaved, a fresh live document is loaded and the Hub merges the outbox write. A Markdown document or room has no local save path, so its text stays a local draft |

### Desktop relay

The Y.Doc and editor binding live in the renderer. The resident Device Agent opens the pinned `/api/v1/collab` socket with its device token only while its gate holds (enrolled, Hub online, first sync done, no reconcile flag, no authority-changed, untrusted, revoked or incompatible state), rechecks the gate on every reconnect and Hub or sync status change, and owns hello, heartbeats and reconnect backoff (1-60 seconds). It relays opaque frames to the holding window over `dude:collab-hub:*` (base64 on the pipe, validated and byte-capped at every hop); the renderer may send only `subscribe` and `unsubscribe` control frames plus binary frames. The Agent depends on neither Yjs nor `@dude/collab-doc`. Rooms, kept documents and history go through Agent RPCs that always use the device token, never the owner bearer.

### Live views, open editors and presence

`HUB_PROTOCOL_VERSION` is 3. The realtime events added in 31J (`presence-changed`, `owner-view-changed`, `notification`) go only to sockets whose hello declared protocol 3 or later, so shipped Android builds keep their connection, and `/api/v1/collab` itself refuses a protocol below 3. `/api/v1/realtime` stays JSON-only and never carries record content.

- **Owner views.** Audit domains and registry and record changes map to the contentless `owner-view-changed {topic}` (`devices`, `sync`, `backup`, `alerts`, `diagnostics`, `jobs`, `notifications`), coalesced for 250 ms per topic and sent to owner sockets and protocol-3 device sockets (the `notifications` topic only to principals allowed to read notifications). Hub web and the desktop feed it to the `HUB_EVENTS` port, and the Devices, Sync, Backup, Security alerts, Endpoint, Hub jobs and notification views quietly refetch what they show. Job status has no event of its own: a job start or finish announces topic `jobs`.
- **Open editors.** `mergeIntoOpenEditor` (`@dude/sync`: `merge3` with the entity's field rules, bookkeeping fields ignored) adopts or merges a remote change into the open pipeline builder, script editor (fields other than a live body, which belongs to the document), project rename and home-layout draft. A conflict or deletion shows a notice and Save takes the existing conflict path.
- **Presence.** The Hub counts every principal as online, including Hub web browser rows through their owner cookie socket, serves `GET /api/v1/presence` to the owner and pushes `presence-changed` to protocol-3 owner sockets. Activity sharing is opt-in per device through the local-only `__device__:presenceShareActivity` (off; nothing is stored until the user chooses). `activityForUrl` in `@dude/contracts/hub/presence-activity` maps a route to a registry tool id or one of the closed shell destinations, and the value is sent through Hub web's realtime `activity` message or the Agent (`presence.setActivity`), only to protocol-3 Hubs and again after a reconnect. The Hub validates tool ids against the registry, keeps activity in memory only and never audits it. Per-document awareness (participants, cursors, selections) is ephemeral Hub memory, with each entry's identity rewritten by the Hub.

### Notifications and job status data

Notifications live in the Hub's `notifications` table, fed only by a closed producer list (backup failed, recovered and overdue; certificate renewed and renewal failed; sync compaction failure; address change; security alerts through the audit observer), deduplicated by source key, with read and dismiss state per notification. Dismissed notifications are kept 30 days, every notification at most 90 days, and at most 500. They carry no record content, are scrubbed from backups and cleared on restore. Each job's last run (start, finish, outcome, a short credential-free summary) is meta `job_last:<id>`, also scrubbed from backups; the record also keeps the most recent non-skipped attempt (`lastAttempt`), so a failed scheduled backup stays visible after later "not due yet" checks.

**Not delivered.** Named or read-only participants, guest permissions and richer collaborative surfaces (Phase 53; for SaveSphere content, 32-SS6); collaborative Home text panels, pipeline definitions, projects or settings (they keep their record policies); running a job on demand (Phase 88).

## Planned for SaveSphere (Phases 32-SS1 to 32-SS6)

Nothing in this section is implemented. It is the data contract that the SaveSphere program ([decisions PD-116–PD-140](../delivery/PHASE32SS_PLAN.md)) must meet; the detailed design is in [SaveSphere architecture](../savesphere/SAVESPHERE_ARCHITECTURE.md). The as-built sections above remain the contract for every existing entity.

**Storage on the Hub (32-SS1, PD-118).** Hub provisioning adds embedded storage next to the canonical database: a SaveSphere content store (SQLite, WAL), FTS5 full-text indexes, a vector index, a content-addressed blob store behind a pluggable `BlobStore` interface (local disk first; an S3-compatible tier or mirror later), a bounded cache and a durable job queue. The Hub is still the only writer to all of it, and devices reach it only through authenticated APIs and sockets. The previously unused `storage/` directory of the Hub data directory is the natural home for blobs; the exact layout is fixed at 32-SS1 planning.

**Scope and consent.**
- **Scope.** SaveSphere items, their documents, attachments, links, tags, notebooks, tasks, journal entries and flashcards are `environment`-scoped canonical data.
- **Device-scoped.** Per-device capture settings, watched-folder and mirror paths, and attachment-cache budgets are `device`-scoped.
- **Capture queues.** Pending captures are durable `device` data until the Hub acknowledges them.
- **Consent.** A device holds and synchronizes SaveSphere content only after the owner enables a SaveSphere sync category, named when 32-SS2 is planned. The first-sync preview and the per-category consent rules of 31D apply.
- **Inventory.** The data-scope inventory gains the SaveSphere entities when their source files exist.

**Channels: records, documents and blobs (32-SS2).** SaveSphere content is too large and too rich for the 31D record limits, so it moves on three channels:
- **Records.** Item metadata, properties, tags, links and membership use revision-checked record sync with the 31D outbox, idempotency and quarantine guarantees, within `SYNC_LIMITS`.
- **Documents.** Rich documents and canvases are Yjs documents on the Hub collaboration path (the 31J pattern: compacted state, update tail, snapshots), not squeezed through the 128 KiB record cap. A plain-text projection is materialized for search, the mirror and non-Yjs readers.
- **Blobs.** Originals, attachments and derived files move by content hash: resumable, verified by SHA-256 and deduplicated, outside `SYNC_LIMITS`.

**Offline tiers (PD-126).** The desktop (through the Device Agent store) and the Android app keep full replicas of records and documents, plus attachments within a configurable budget, fetching the rest on demand. Edits made offline are journaled and replayed, and Yjs merges concurrent document edits. Ink strokes merge additively. A conflict that cannot merge produces a linked conflict copy flagged in the inbox; an edit is never silently lost. The web PWA keeps only a durable capture queue and a read cache of recent and pinned items. Captures are acknowledged locally at once on every surface and never fail because the Hub is unreachable.

**Vault (32-SS2, PD-138).** Vault content is encrypted on the Hub with its own key and unlocked by step-up. Because the Hub holds that key, vault content is readable only while the Hub is reachable and the vault is unlocked. Device replicas hold no decryptable vault content, and offline vault access is not planned. The vault is excluded from indexes, AI, the mirror, ingest and sharing.

**History, trash and deletion (PD-130).**
- **Versions.** Every saved version is kept for 90 days, then thinned to daily and then monthly snapshots, with owner-configurable tiers.
- **Originals.** Captured originals and imported archives are never thinned.
- **Restore.** A restore is a forward edit.
- **Deletion.** Deleted items stay in the trash for 30 days, and permanent purge is a previewed step-up action.
- **31J documents unchanged.** The 31J 30-day snapshot history (PD-105) continues to govern the scratchpad, user scripts and Markdown documents; tiered history applies to SaveSphere content only.
- **Sync rules still apply.** Tombstones and cursor-retention rules (the [minimum contract](#sync-protocol-minimum-acceptance-contract), items 5 and 7) apply unchanged.

**Markdown mirror (32-SS3, PD-133).** A desktop mirror maps items to Markdown files (front matter for properties, an attachments folder, notebooks as folders, with the exact mapping fixed at 32-SS3 planning). It runs two-way:
- **External edits.** An edit made in the folder becomes a new version through the normal write path.
- **Conflicts.** A concurrent edit produces a conflict copy rather than an overwrite.
- **Deletes.** A file deleted in the folder moves the item to the trash.
- **Echo.** The mirror's own writes are suppressed so they don't loop back.

The mirror is device-scoped configuration and never mirrors the vault.

**Backup v2 (32-SS1, PD-124).** Backups stream the canonical database, the SaveSphere store and the blob store in chunks, with blobs deduplicated across backups, under the existing passphrase model and the 31G restore and authority-epoch rules. The 512 MiB plaintext ceiling and 32-file limit of the 31G format are removed. Destinations are a local or second drive, an S3-compatible bucket, another DUDE device (warm standby) and Google Drive or OneDrive. A backup counts only after verification. The format is built (Milestone 846) and the Hub writes it (Milestone 847: the engine, the local-folder destination, retention, the scheduler and the restore of both databases and every blob; S3, standby and the drives follow): a repository of write-once objects (`repo` with the wrapped master key, encrypted `packs/<id>` and `manifests/<backupId>`) where each manifest lists every blob by a keyed dedupe identity and points into earlier backups' packs, plus a single `.dudebackup` v2 export for moving one backup as a file; see [Security](SECURITY_ARCHITECTURE.md#as-built-in-32-ss1-backup-v2-format-milestone-846) and [the engine](SECURITY_ARCHITECTURE.md#as-built-in-32-ss1-backup-v2-engine-destinations-retention-and-restore-milestone-847). A scheduled run backs up every configured destination in turn with the master key the Hub keeps in its secret store, each destination due on its own; retention is 7 daily, 4 weekly and 6 monthly backups per destination, pruned only by the two-step `backup prune`.

**Guests (32-SS6, PD-139).** Guest principals read and write only through grants on specific notebooks or items. They never sync records, hold a device replica or reach the change feed.

## Migration from the delivered local stores

Migration is part of Phase 31B/31D, not a post-release cleanup. **Phase 31B migrated the delivered local stores into the Device State Store; Phase 31D delivered first-sync preview, import and merge.** Inventory current local/session/browser persistence, OS-backed credentials, saved pipelines/workspaces/projects/history, user settings and native journals. Preserve the existing tool persistence rules and stable tool IDs.

Before changing durable formats, create a recoverable local snapshot and versioned migration marker. Migrate to the desktop Device State Store incrementally through repository adapters. Keep browser session/local storage adapters where appropriate; do not require Node SQLite in a browser. Android selects a compatible local persistence adapter in Phase 31H. OS secrets stay in their secure store with reference migration, never a plaintext bulk export.

First connection to a Hub must preview which records/categories become shared, which stay local, potential ID/name collisions and conflict behavior. The Hub-hosting desktop uses the same enrollment path as other clients; it must not point its Device Store at the canonical database file. Joining an existing environment must not overwrite canonical state with an old local snapshot. Make import/merge/keep-local choices explicit.

Migration must be resumable and idempotent, tested against representative Phase 31 data, and recoverable after interruption. Preserve an untouched recovery copy until verification/retention policy permits cleanup. A downgrade must either read a supported format or refuse safely with recovery instructions; it must never reinterpret a newer schema silently.

### What Phase 31B did, and what remains

Phase 31B delivered a **best-effort, one-shot local import** rather than a long-lived compatibility layer, because the product had no existing production users to protect (see PD-021 in the [decision log](../history/DECISION_LOG.md#phase-31b-implementation-decisions)).

- On first launch of a store-enabled build, main validates the legacy `userData` JSON documents, mutation journals, snapshot headers and PowerShell history with each module's own parser, commits them in one transaction with an import flag, and then moves the files to `userData/legacy-import/<timestamp>/`. That folder is the untouched recovery copy; an interrupted import resumes. The legacy `secure-store.json` ciphertext is copied byte for byte into a secret reference.
- The renderer imports the current origin's `dude:v1:*` localStorage keys and the History/network-run IndexedDB databases once, then deletes the old copies. Renderer data written by earlier production launches lived at random-port origins and is unrecoverable.
- Store schema changes use the versioned migration runner described above. The legacy-compat code was deleted: manifest `storageMigrations`, `moveLocalValue`, every `migrateX` function, the legacy Home panel and the bundle's `homePanel`. Repository codecs validate rows for both hydration and bundle import.

**Delivered by Phase 31D:** the first-connection preview of what becomes shared and what stays local, import/merge/keep-local choices, Hub revision assignment, outbox replay and conflict handling (see [As built in Phase 31D](#as-built-in-phase-31d-synchronization)). Phase 31B itself only recorded unsent ops and never contacted a Hub.

## Backup consistency, restore and authority transfer

Use a transactionally consistent SQLite backup procedure, including any required WAL state, rather than copying only a live `dude.db` file. An encrypted backup includes a versioned manifest, schema/application compatibility information, integrity checks and the scoped canonical records, files and sync metadata it promises to restore. Export and backup are distinct: a portable selected-data export need not be a full operational restore package.

Backup encryption requires an explicit recovery-key/password strategy. Never store the only recovery material exclusively on the machine being backed up. Local OS credential stores and device-private data are not silently included in a Hub backup; explain which credentials must be restored separately or re-entered.

Before transfer, stop or fence the previous authority when reachable. Explicitly designate the restored Hub as the sole authority, verify restore integrity and endpoint/TLS/identity handling, then reconnect registered clients. A stale previous Hub must not resume as an active second writer. Restoring an older backup requires a new sync generation or equivalent invalidation and a controlled client rebase; pending outboxes must not be blindly replayed against a divergent history. This is manual authority transfer, not automatic election or multi-master replication.

Define retention/scheduling and standby replication later as needed, but require at least one verified encrypted backup/restore and Hub-transfer drill before calling the first distributed release done.
