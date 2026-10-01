# Data, Persistence and Synchronization

This specification separates canonical Hub state from local Device Stores, retained inputs and synchronization consent. Delivered local persistence remains supported; the distributed stores and protocol are planned.

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

Existing local history, System Changes, filesystem mutation journals, crash recovery, usage/recents and private scratch data remain local by default. Favorites and selected workbench definitions may synchronize after environment enrollment/consent. Local analytics do not become Hub telemetry merely because synchronization exists.

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

## Migration from the delivered local stores

Migration is part of Phase 31B/31D, not a post-release cleanup. Inventory current local/session/browser persistence, OS-backed credentials, saved pipelines/workspaces/projects/history, user settings and native journals. Preserve the existing tool persistence rules and stable tool IDs.

Before changing durable formats, create a recoverable local snapshot and versioned migration marker. Migrate to the desktop Device State Store incrementally through repository adapters. Keep browser session/local storage adapters where appropriate; do not require Node SQLite in a browser. Android selects a compatible local persistence adapter in Phase 31H. OS secrets stay in their secure store with reference migration, never a plaintext bulk export.

First connection to a Hub must preview which records/categories become shared, which stay local, potential ID/name collisions and conflict behavior. The Hub-hosting desktop uses the same enrollment path as other clients; it must not point its Device Store at the canonical database file. Joining an existing environment must not overwrite canonical state with an old local snapshot. Make import/merge/keep-local choices explicit.

Migration must be resumable and idempotent, tested against representative Phase 31 data, and recoverable after interruption. Preserve an untouched recovery copy until verification/retention policy permits cleanup. A downgrade must either read a supported format or refuse safely with recovery instructions; it must never reinterpret a newer schema silently.

## Backup consistency, restore and authority transfer

Use a transactionally consistent SQLite backup procedure, including any required WAL state, rather than copying only a live `dude.db` file. An encrypted backup includes a versioned manifest, schema/application compatibility information, integrity checks and the scoped canonical records, files and sync metadata it promises to restore. Export and backup are distinct: a portable selected-data export need not be a full operational restore package.

Backup encryption requires an explicit recovery-key/password strategy. Never store the only recovery material exclusively on the machine being backed up. Local OS credential stores and device-private data are not silently included in a Hub backup; explain which credentials must be restored separately or re-entered.

Before transfer, stop or fence the previous authority when reachable. Explicitly designate the restored Hub as the sole authority, verify restore integrity and endpoint/TLS/identity handling, then reconnect registered clients. A stale previous Hub must not resume as an active second writer. Restoring an older backup requires a new sync generation or equivalent invalidation and a controlled client rebase; pending outboxes must not be blindly replayed against a divergent history. This is manual authority transfer, not automatic election or multi-master replication.

Define retention/scheduling and standby replication later as needed, but require at least one verified encrypted backup/restore and Hub-transfer drill before calling the first distributed release done.
