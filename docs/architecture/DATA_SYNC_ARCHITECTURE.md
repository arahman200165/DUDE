# Data, Persistence and Synchronization

This specification separates canonical Hub state from local Device Stores, retained inputs and synchronization consent. Delivered local persistence remains supported; the canonical Hub skeleton and Hub enrollment are delivered (Phase 31C), while the synchronization protocol and the remaining distributed stores are planned.

Workspace implementation and host ownership are documented in [Portable Core](PORTABLE_CORE.md#data-scope). The Hub service and Hub enrollment are delivered; the sync and mobile reservations provide no runtime capabilities.

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
- [Phase 31D synchronization design](#phase-31d-synchronization-design)
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

PostgreSQL should be an implementation option, not a mandatory dependency for personal DUDE.

### As built in Phase 31C (Hub)

The Hub's canonical database is `data/dude.db`, opened by the Hub process alone through `@dude/sqlite-store` (`node:sqlite`, WAL, `synchronous=FULL`, `quick_check`, checksummed numbered migrations). Under the service it lives in `%ProgramData%\DUDE\Hub`; before a migration step on an existing database the Hub writes a `VACUUM INTO` copy to `data/pre-migration/` (the `backups/` directory is reserved for Phase 31G and unused). Opening a database whose `minReaderVersion` is newer than the running Hub is refused, so an older Hub cannot open a newer database. Two migrations exist (`0001-initial`, `0002-owner-reset`).

| Table group | Tables | Holds |
|---|---|---|
| Plumbing | `meta`, `schema_migrations` | Hub instance ID, schema and reader version; applied steps with checksums |
| Identity | `environment`, `owner`, `owner_credentials`, `recovery_codes`, `setup_state` | The Hub-minted environment, the single owner, the Argon2id credential, hashed single-use recovery codes, the one-time setup or owner-reset token (hashed) |
| Sessions | `sessions` | Hashed cookie and device-bound bearer sessions with idle and absolute expiry |
| Devices | `devices`, `device_keys`, `device_tokens`, `challenges`, `pairing_codes` | The registry (including the recovery-trust flag), Ed25519 public keys, hashed access tokens, single-use challenges and pairing codes |
| TLS | `tls_pins`, `tls_pin_acks` | Active, next and retired certificate pins and per-device acknowledgements |
| Hardening | `throttle`, `audit_events` | Persisted failure throttles; the append-only audit log (closed event list, credential-free details, retained 365 days or 100,000 events) |
| Canonical skeleton | `records`, `change_feed`, `applied_ops` | Entity rows keyed by environment, type and ID with revision, tombstone and schema version; the global monotonic change feed; applied op IDs for duplicate suppression |

`commitCanonical` writes the record, its change-feed entry and the applied op ID in one transaction under one global revision. A duplicate op ID returns the recorded revision without writing, and a rejected commit rolls back completely. Only the environment and workspace codecs are canonical entities. The skeleton is exercised by specs and a hard-kill WAL durability check, but **no public record endpoint, import, replay or cursor API exists**: nothing is written to it from a client in Phase 31C.

**Environment identity.** The Hub mints `environmentId` and `hubInstanceId` at owner bootstrap ([PD-036](../history/DECISION_LOG.md#phase-31c-implementation-decisions)). A device keeps its standalone `meta.environment_id` and its local records unchanged when it enrolls, and stores the Hub's environment ID separately in its `hub_enrollment` row. Re-keying local records to the canonical environment belongs to the Phase 31D import, so a second device with its own standalone ID can enroll without a reconciliation problem.

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

**Writes.** Entity mutations commit immediately and are awaited; key/value writes debounce for one second in the renderer and flush on window close and quit, except journaled settings, which commit at once. The store, not the renderer, decides whether a write journals: only the explicit list of favorites, pipelines, user scripts, projects, workspace templates, appearance, reopen-on-restart, home layout and usage/insights does. Each journaled change writes its record and one outbox op atomically; ops coalesce per entity (a later upsert replaces an unsent one, an unsent upsert followed by a delete leaves no op, a delete followed by an upsert becomes an upsert). The outbox is bounded (`OUTBOX_MAX_ROWS`) and surfaces backpressure instead of dropping edits. Ops carry the status `unsent-standalone`; nothing replays them before Phase 31D.

**Reads.** `main.ts` awaits a boot snapshot of the store before bootstrapping Angular, and services keep synchronous signals over an in-memory cache.

**Migrations.** A versioned runner applies numbered steps, each in its own transaction, idempotent and resumable, after a `VACUUM INTO` backup. Shipped steps are checksummed and never edited. A store whose `minReaderVersion` is newer than the running build is refused and quarantined rather than reinterpreted, and the app enters degraded mode.

**Failure.** Main reconnects to (and, when none answers, respawns) the Device Agent with 0.5, 2 and 8 second backoff. More than three crashes in two minutes moves the app to a degraded in-memory mode with a persistent banner offering retry, open recovery folder and reset; JSON journal fallbacks are drained back into the store on the next healthy start.

**Identity.** The device ID is a UUIDv7 stored with a salted hash of the Windows MachineGuid. If the hash no longer matches at startup the store was copied: a new device ID is minted, the old one is kept as `cloned_from`, unsent outbox ops are rewritten to the new device and secrets are marked as needing re-entry. A reset or reinstall produces a new device. The display name defaults to "Windows PC" and is never taken from the hostname.

**Web.** The web build has no SQLite and no outbox. It keeps its browser storage adapters behind the same repository ports, plus a stable per-browser installation ID that Clear all data preserves.

### As built in Phase 31C (Hub enrollment)

Device-store migration 0002 adds the single-row `hub_enrollment` table (state `enrolled` or `revoked`, Hub instance and environment IDs, URL, protocol version, active and next SPKI pins with certificates, key ID and public key, the CurrentUser-DPAPI-wrapped Ed25519 private key, and enrollment, last-contact and revocation times). It is additive and keeps `minReaderVersion` at 1, so an older build opens the store and behaves as a standalone device. `EnrollmentState` is `standalone | enrolled | revoked` and `EnvironmentRecord.kind` gains `hub`. Clone detection and *Reset this device* clear the enrollment; *Clear data* keeps it; the renderer-facing `hub.enrollment` view carries no key material. Settings > This Device shows standalone, enrolled or revoked. Enrolling uploads only the pairing proof and device metadata (display name, platform, app version, capabilities, public key) after an explicit disclosure; no records are uploaded.

**Still owed by Phase 31D** on top of the 31B list below: Hub record endpoints, re-keying local records to the Hub environment, first-connection preview and import, revision assignment, cursors, outbox replay, conflict handling and revoked-device sync semantics.

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

## Persistence policy, scope and consent are separate dimensions

`none` / `session` / `local` / `user-choice` and secure-local credential storage govern **whether and how** content is retained. Environment/workspace/device/local-private scope governs **who owns it and whether it may synchronize**. Making a record durable locally does not make it eligible for synchronization.

Every persistent entity needs a stable ID, schema version, declared scope and sensitivity classification. Shared entities also need environment identity and canonical revision metadata. Workspace/project membership must not implicitly promote nested payloads, secrets, absolute local paths or history into shared data. Preferences and definitions are separable from the input/output content they reference.

Connection metadata may contain a selected shared host/port/database definition, but a machine-specific endpoint or socket stays device-scoped. Model a shared connection definition plus explicit device bindings/credential references; do not overwrite every machine's local configuration with one device's paths or secrets. Synced project references use logical identity and per-device path mapping. Unresolved local references produce a missing-binding state instead of an automatic file scan/upload.

Existing local history, native recents, System Changes, filesystem mutation journals, crash recovery and private scratch data remain local by default and are never journaled. Favorites, selected workbench definitions, usage/insights aggregates (frequency and recency counters, not tool inputs or outputs) and the Home layout with its notes are `environment`-scoped and **may become sync-eligible only after explicit environment enrollment and consent** in Phase 31D; in Phase 31B they are classified and journaled into the local outbox but never transmitted. Local analytics do not become Hub telemetry merely because synchronization exists, and enrollment must let the user keep usage local.

## Sync Protocol Minimum Acceptance Contract

These requirements make the planning model implementable without committing to a particular HTTP framework or wire format:

1. Persist a shared-record local change and its outbox operation atomically. Each operation has a unique operation ID, environment/device identity, entity/type, operation kind, schema version and `basedOnRevision`; the Hub authenticates identity independently of claimed fields.
2. The Hub validates authorization, data scope, schema and expected revision; commits the canonical mutation and its change-feed entry atomically; and returns a stable acknowledgment/revision. Duplicate operation IDs must not apply a mutation twice after timeout/retry.
3. Devices replay durable queued changes with bounded retries/backoff and observable error state, acknowledge only committed operations, and resume after process or network interruption. Quarantine incompatible/rejected operations for review rather than looping silently or discarding them.
4. Use Hub-assigned monotonic change cursors and revisions. Client timestamps are display/audit metadata, not the sole conflict-resolution authority. A realtime notification prompts catch-up; durable change feeds remain authoritative if a notification is lost.
5. Explicitly model deletes/tombstones and cursor retention. A client older than retained history must receive a controlled snapshot/rebase flow that preserves its pending outbox and prevents deleted-record resurrection. Schema migrations and cursor invalidation must have a documented recovery path.
6. Limit payload sizes, batches and stored outbox growth; expose backpressure/repair state instead of silently dropping edits. Limits are measured and recorded during implementation; this PRD does not invent unvalidated numeric capacity targets.
7. Keep simple preference/favorite conflict policies documented by entity. Permit last-write behavior only when loss is acceptable; preserve competing pipeline/workspace/project changes as inspectable versions for explicit resolution. Never silently discard an offline pipeline edit.
8. Use Yjs only for approved collaborative editing surfaces, not as the generic database replication protocol. Collaborative content persistence, permissions and retention require separate opt-in and lifecycle rules.
9. Revocation stops subsequent Hub operations. Revoked or expired credentials must never be treated as permission to create a new authority or bypass authentication. Retained offline data remains subject to local access policy.
10. Device sync never executes a pipeline, script, request, shell command or mutation as a side effect of applying a definition. Restoring a workspace restores data/UI intent, not a privileged action.

## Phase 31D synchronization design

**Planned design (being implemented in Milestones 649–662).** Rationale is recorded in [PD-038 to PD-049](../history/DECISION_LOG.md#phase-31d-implementation-decisions). Numeric limits are provisional until measured in Milestone 661.

### Categories and consent

Consent is per category and applies only to an enrolled environment. A disabled category's operations are held locally.

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

### Conflict policy by entity

| Entity type | Policy | Apply mode | Conflict behavior |
|---|---|---|---|
| `setting` | `lww` | live | Hub order wins; no inbox |
| `favorite` | `lww` | live | Hub order wins; no inbox |
| `pipeline`, `user-script` | `merge3` | live | Field merge; otherwise inbox |
| `project` | `merge3` (`lastActivatedAt` takes the later ISO time) | live | Field merge; otherwise inbox |
| `workspace-template` | `merge3` | live | Field merge; otherwise inbox |
| `home-layout` | `merge3` | live | Field merge; otherwise inbox (no Keep both) |
| `usage` | `per-device` (entity id is the device id) | live | None; summed on read |
| `workspace-layout` | `lww` | next launch | Hub order wins |
| `scratchpad` | `merge3` | live | Field merge; otherwise inbox (no Keep both) |

### Outbox status machine

An operation is journaled atomically with its change and carries one stored status: `unsent-standalone` (not enrolled), `pending` (enrolled, awaiting push), `quarantined` (rejected by the Hub with a reason; user retries, discards or exports) or `stranded` (device revoked). Enrolling turns `unsent-standalone` into `pending`; revocation turns `pending` into `stranded`; Continue standalone returns `stranded` to `unsent-standalone`. **Held** is derived, not stored: a `pending` operation whose category is disabled or whose first sync has not completed. Applied and duplicate acknowledgements delete the operation only if it is unchanged since it was sent.

### Wire endpoints

All under `/api/v1`; device credential unless noted. Contract: `@dude/contracts/hub` `sync.schema.ts`.

- `POST /sync/push`: `{ ops }` to per-operation `applied`, `duplicate`, `conflict` (with the current record) or `rejected` (with a reason).
- `GET /sync/changes?after&limit`: records changed after a revision, one entry per entity at its latest revision, tombstones included; `410 cursor-expired` below the floor.
- `GET /sync/snapshot?afterType&afterId&limit`: paged live records and `asOfRevision`.
- `PUT /sync/state`: the device reports cursor, counts and category consent; returns floor, head revision and retention days.
- `GET /sync/summary` (owner): counts per category and per-device lag and counts.
- `POST /sync/environment/clear/preview` and `POST /sync/environment/clear` (owner): the two-step Hub delete.
- Realtime `changes-available { revision }`, sent only to device sockets.

### Retention and rebase algorithm

1. The Hub keeps `retentionDays` (default 90) of history. Compaction deletes change-feed rows at or below a new **floor**, drops tombstones and applied operations at or below it, and raises the floor.
2. A device calling `changes` with `after` below the floor receives `cursor-expired`.
3. The device pulls a snapshot. The first page fixes `asOfRevision`; the device then pulls changes from that revision.
4. A local record that has a Hub revision but is absent from the snapshot was deleted on the Hub and is removed locally. A pending edit to it becomes an edit-delete conflict in the inbox, so the delete is not resurrected and the edit is not lost.
5. A local record that was never synced (a create with no Hub revision) is kept and pushed.
6. Pending operations survive the rebase; records present in the snapshot follow the normal apply rules.

### Revoked devices

Revocation stops every Hub call. The device freezes: operations become `stranded`, local data is kept and no credential is refreshed. The user may **Continue standalone** (the Hub link is dropped and stranded operations become `unsent-standalone`) or **re-pair** with a new key and run the first-sync preview again. A revoked key is never reinstated and the Hub never remote-wipes the device.

## Migration from the delivered local stores

Migration is part of Phase 31B/31D, not a post-release cleanup. **Phase 31B migrated the delivered local stores into the Device State Store; Phase 31D still owns first-sync preview, import and merge.** Inventory current local/session/browser persistence, OS-backed credentials, saved pipelines/workspaces/projects/history, user settings and native journals. Preserve the existing tool persistence rules and stable tool IDs.

Before changing durable formats, create a recoverable local snapshot and versioned migration marker. Migrate to the desktop Device State Store incrementally through repository adapters. Keep browser session/local storage adapters where appropriate; do not require Node SQLite in a browser. Android selects a compatible local persistence adapter in Phase 31H. OS secrets stay in their secure store with reference migration, never a plaintext bulk export.

First connection to a Hub must preview which records/categories become shared, which stay local, potential ID/name collisions and conflict behavior. The Hub-hosting desktop uses the same enrollment path as other clients; it must not point its Device Store at the canonical database file. Joining an existing environment must not overwrite canonical state with an old local snapshot. Make import/merge/keep-local choices explicit.

Migration must be resumable and idempotent, tested against representative Phase 31 data, and recoverable after interruption. Preserve an untouched recovery copy until verification/retention policy permits cleanup. A downgrade must either read a supported format or refuse safely with recovery instructions; it must never reinterpret a newer schema silently.

### What Phase 31B did, and what remains

Phase 31B delivered a **best-effort, one-shot local import** rather than a long-lived compatibility layer, because the product had no existing production users to protect (see PD-021 in the [decision log](../history/DECISION_LOG.md#phase-31b-implementation-decisions)).

- On first launch of a store-enabled build, main validates the legacy `userData` JSON documents, mutation journals, snapshot headers and PowerShell history with each module's own parser, commits them in one transaction with an import flag, and then moves the files to `userData/legacy-import/<timestamp>/`. That folder is the untouched recovery copy; an interrupted import resumes. The legacy `secure-store.json` ciphertext is copied byte for byte into a secret reference.
- The renderer imports the current origin's `dude:v1:*` localStorage keys and the History/network-run IndexedDB databases once, then deletes the old copies. Renderer data written by earlier production launches lived at random-port origins and is unrecoverable.
- Store schema changes use the versioned migration runner described above. The legacy-compat code was deleted: manifest `storageMigrations`, `moveLocalValue`, every `migrateX` function, the legacy Home panel and the bundle's `homePanel`. Repository codecs validate rows for both hydration and bundle import.

**Still owned by Phase 31D:** the first-connection preview of what becomes shared and what stays local, ID/name collision handling, import/merge/keep-local choices, Hub revision assignment, outbox replay and conflict handling. Phase 31B only records unsent ops; it never contacts a Hub.

## Backup consistency, restore and authority transfer

Use a transactionally consistent SQLite backup procedure, including any required WAL state, rather than copying only a live `dude.db` file. An encrypted backup includes a versioned manifest, schema/application compatibility information, integrity checks and the scoped canonical records, files and sync metadata it promises to restore. Export and backup are distinct: a portable selected-data export need not be a full operational restore package.

Backup encryption requires an explicit recovery-key/password strategy. Never store the only recovery material exclusively on the machine being backed up. Local OS credential stores and device-private data are not silently included in a Hub backup; explain which credentials must be restored separately or re-entered.

Before transfer, stop or fence the previous authority when reachable. Explicitly designate the restored Hub as the sole authority, verify restore integrity and endpoint/TLS/identity handling, then reconnect registered clients. A stale previous Hub must not resume as an active second writer. Restoring an older backup requires a new sync generation or equivalent invalidation and a controlled client rebase; pending outboxes must not be blindly replayed against a divergent history. This is manual authority transfer, not automatic election or multi-master replication.

Define retention/scheduling and standby replication later as needed, but require at least one verified encrypted backup/restore and Hub-transfer drill before calling the first distributed release done.
