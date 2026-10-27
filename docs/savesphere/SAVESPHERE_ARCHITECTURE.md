# SaveSphere Architecture

Status: planned. No SaveSphere implementation exists. This document describes how the SaveSphere program (Phases 32-SS1 to 32-SS6) is meant to sit on top of the DUDE that is built today. Statements about existing code were checked against the repository at Milestone 828.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there, and the decisions that govern SaveSphere are [PD-116 to PD-140](../delivery/PHASE32SS_PLAN.md). This document owns the technical shape that implements them. Where it and the plan disagree, the plan wins and this document is corrected.

Related: [SaveSphere documentation](README.md) · [SaveSphere Product Specification](SAVESPHERE_PRODUCT_SPEC.md) · [Capture and Import](CAPTURE_AND_IMPORT.md) · [SaveSphere program decisions](../delivery/PHASE32SS_PLAN.md) · [DUDE System Architecture](../architecture/SYSTEM_ARCHITECTURE.md) · [Data, Persistence and Synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md) · [DUDE Security Architecture](../architecture/SECURITY_ARCHITECTURE.md).

**Labels.** Three labels are used throughout:

- **As built** means the statement describes code that exists today and names the file or document it was checked against.
- **Planned** means it follows directly from a recorded decision (cited as PD-1xx).
- **Proposed** means it is an architectural shape this document suggests. It is confirmed, changed or rejected when the named phase is planned, and it is not a decision.

The [open items](../delivery/PHASE32SS_PLAN.md#open-items-decided-when-each-phase-is-planned) of the plan stay open here: AI providers and local versus cloud processing, OCR and transcription engines, the vector-index library, the canvas engine, the Android push transport and outbound email path, the exact history tiers, an S3-compatible blob tier, the `.sdocx` parser and the release label.

## Contents

- [Placement in DUDE](#placement-in-dude)
- [Hub provisioning and storage](#hub-provisioning-and-storage)
- [Domain, ingress and availability](#domain-ingress-and-availability)
- [Identity](#identity)
- [Content model and storage](#content-model-and-storage)
- [Sync and offline](#sync-and-offline)
- [Processing pipeline](#processing-pipeline)
- [Search and AI](#search-and-ai)
- [Markdown mirror and external editors](#markdown-mirror-and-external-editors)
- [Notifications and reminders](#notifications-and-reminders)
- [Vault](#vault)
- [Sharing](#sharing)
- [Backup v2](#backup-v2)
- [Planned packages and modules](#planned-packages-and-modules)
- [Candidate dependencies](#candidate-dependencies)
- [Performance and limits targets](#performance-and-limits-targets)
- [Questions for phase planning](#questions-for-phase-planning)

## Placement in DUDE

SaveSphere is Hub-backed environment infrastructure presented as a shell destination. It is not a set of registry tools. **Planned (PD-125):** it is shell exception **#15**, a top-level destination at `/savesphere` of the same kind as Settings (#8) and Insights (#10). It adds no tool category, so the eight categories stay closed. `/` stays DUDE Home and gains SaveSphere Home panels, and the command palette gains quick capture and SaveSphere search. **As built:** fourteen shell exceptions exist; #14 is the notification bell (`apps/web/src/app/shell/AGENTS.md`). Because SaveSphere is a sanctioned exception, edits under `apps/web/src/app/shell/` and `core/` are expected for it. The rule that adding or changing a *tool* never needs a shell or core edit is unchanged.

**Proposed (32-SS2):** like Hub collaboration (PD-114), SaveSphere sits behind a port with a desktop adapter (through the Device Agent over sender-checked IPC), a Hub web adapter (same-origin fetch and sockets) and an unavailable adapter. The destination exists on Hub web and on a desktop enrolled in a Hub. On the GitHub Pages companion it is absent: Pages stays the anonymous, Hub-less build ([PD-122](../delivery/PHASE32SS_PLAN.md), PD-007). A standalone desktop shows an explanation rather than an error, the way the bell does.

| Existing layer | As built today | SaveSphere use |
|---|---|---|
| Owner identity, sessions, step-up | Argon2id password, ten hashed recovery codes, `__Host-` cookie and `dob_` bearer sessions, 5-minute step-up with session rotation (`apps/hub/src/auth/`, Hub migration 0007) | Google OIDC is added as the primary sign-in, with the password and recovery codes as fallback (PD-121). Step-up gates vault unlock, purge and account linking |
| Devices and credentials | Registry, Ed25519 device keys, `ddt_` device tokens, key-less browser rows (`apps/hub/src/devices/`, migration 0005) | Desktop and Android replicas sync as devices. Ingest tokens (32-SS3) and guest sessions and share links (32-SS6) are new credential types |
| Sync | `@dude/sync` outbox model, `commitCanonical`, change feed, `SYNC_LIMITS` (128 KiB per record, 100 operations and 512 KiB per push; `packages/sync/src/limits.ts`), `OUTBOX_MAX_ROWS` 10,000 (`packages/sync/src/outbox/outbox-op.model.ts`) | The protocol rules are reused. Content does not go through the workbench record tables (see [Sync and offline](#sync-and-offline)) |
| Collaboration | `/api/v1/collab`, `collab_docs`/`collab_updates`/`collab_snapshots`/`collab_bases` (migration 0010), closed document kinds in `@dude/collab-doc` | SaveSphere follows the same persistence pattern for its rich documents, ink, canvases and PDF layers |
| Realtime | `/api/v1/realtime`, JSON-only and nudge-only, never carrying record content | SaveSphere change nudges. Content never travels on this socket |
| Notifications and bell | `notifications` table (migration 0009) fed by a closed producer list (`apps/hub/src/notifications/producers.ts`); bell (#14); Windows toasts raised by Electron main (`apps/desktop/hub-notification-toasts.ts`) | Reminders, resurfacing and digests are added as deliberate new producers (PD-137) |
| Job status | Read-only registry of eleven jobs, `HUB_JOB_IDS` (`packages/contracts/src/hub/jobs.schema.ts`): eight timers (PD-112) plus, from Milestone 834 and only on a Hub with `savesphere.db`, `queue-runner`, `blobs-verify` and `blobs-staging-sweep`; `GET /api/v1/jobs`, no run-now | Extended by the durable job queue (see below); `GET /api/v1/queue` is its read model |
| Backup | `.dudebackup` through `@dude/hub-backup`: whole buffers, 512 MiB plaintext and 32-file ceilings (`MAX_BACKUP_PLAINTEXT_BYTES`, `MAX_BACKUP_FILES` in `packages/hub-backup/src/backup-format.ts`) | Replaced by streaming backup v2 that covers blobs (PD-124) |
| Device Agent | Per-user Node process owning the `node:sqlite` Device State Store (device-store migrations 0001 to 0005, `apps/device-agent/src/store/migrations/`), the pinned Hub link and the DPAPI device key; it executes no tools | Holds the desktop replica (PD-126) |
| Android | Expo app, app-private `expo-sqlite` behind a serial gate, local modules `dude-hub` (pinned HTTPS/WSS client and Keystore identity) and `dude-share` (`apps/mobile/modules/`) | Holds the Android replica and gains Kotlin modules for ink, scanning, PDF and larger share capture (PD-127) |
| Design tokens | `theme-tokens.json` generates web CSS and portable native token data | Every SaveSphere surface. Ink and canvas colors chosen by the owner are content data, not theme colors |
| Hub web host | `hub-web` host kind, base href `/`, its own service worker (`ngsw-config.hub.json`, public assets only), `hubSessionGuard` (`apps/web/src/app/core/hub/hub-guards.ts`) | Serves the destination. The cached shell becomes the Hub-offline experience |

**New for SaveSphere:** provisioning, a SaveSphere content store, a content-addressed blob store, a durable job queue with a worker pool, resumable uploads, the ingest API, Google OIDC, a supervised `cloudflared`, a Hub-side AI provider interface, the processing pipeline, search indexes, the vault, guests and share links, the Markdown mirror and backup v2.

## Hub provisioning and storage

**Planned (PD-118).** Designating a machine as a Hub runs a provisioning wizard. The wizard creates every storage tier and service SaveSphere needs, all embedded in the Hub and on its local disks, and the Hub then supervises them. No Docker, PostgreSQL, Redis or other external service is required. Provisioning is re-runnable and reports the status of each component, and an existing Hub upgraded into SaveSphere is provisioned the same way.

**Wizard steps (proposed order, 32-SS1):**

1. **Storage.** Create the content store, the indexes, the blob store, the cache and the queue, and check free space and the volume.
2. **Domain and ingress.** Choose the bare domain, then either the managed tunnel or direct Public mode (PD-119, PD-120).
3. **Google sign-in.** Enter the owner's own OAuth client and link the first Google account (PD-121).
4. **Backup destination.** Choose a destination, run the first verified backup and schedule a restore drill (PD-124).
5. **Power policy check.** Read the sleep and hibernate settings of the active power plan and offer changes (PD-123).
6. **AI provider.** Optional, and possible later. The provider choice itself is deferred to 32-SS5 planning (PD-135).

Each component reports `not provisioned`, `ready`, `degraded` or `failed`, with the exact fix. The status is shown in Settings and on the diagnostics view.

**As built:** exposure changes (names, certificates, proxy, mode) are elevated admin-pipe commands, and no owner-session route may widen exposure (`apps/hub/AGENTS.md`). **Proposed (32-SS1):** the wizard keeps that rule. Steps that widen exposure (the domain, the tunnel and direct Public mode) run through the elevated local channel on the Hub machine, as the desktop's local Hub setup hand-off already does. The web wizard shows their status and the copyable commands.

**On-disk layout.** **As built:** `apps/hub/src/config/data-dir.ts` creates `service/` (including `service/web`), `data/` (with `dude.db` and `pre-migration/`), `storage/`, `backups/`, `config/` (with `hub.json` and `tls/`) and `logs/` under the data directory (`%ProgramData%\DUDE\Hub` for the service). `storage/` is created and is removed by `dude-hub purge`, but nothing writes to it. **Proposed (32-SS1):**

| Path | Holds |
|---|---|
| `data/dude.db` | Existing canonical database: identity, devices, sessions, audit, workbench sync, collaboration. New identity tables (linked accounts, ingest tokens, guests) arrive here as numbered migrations 0011 and later |
| `data/savesphere.db` | SaveSphere content store: items, types, links, documents, history, search indexes, capture receipts and queue state. It has its own numbered migration sequence and reader floor |
| `storage/blobs/<2 hex>/<2 hex>/<sha256>` | Content-addressed originals, attachments and derived files. Each file is written once and never modified |
| `storage/uploads/` | Partial resumable uploads, expired by a job |
| `storage/staging/` | Import staging (PD-132 stage, preview, commit) |
| `cache/` | Bounded and disposable: previews, thumbnails, transcoding scratch. Never backed up; `purge` gains it as a target |
| `index/` | Only if the chosen vector-index library needs files outside SQLite (open item) |

A separate content store keeps SaveSphere growth, migrations and the `VACUUM INTO` cost out of `dude.db`. The Hub process remains the only writer of both files, and the CLI still never opens either while the service runs. How a SaveSphere write and its audit row (which stays in `dude.db`) are ordered is decided (PD-146): there is no `ATTACH` (a transaction across two WAL files is not atomic), and the audit event is written as an `audit_outbox` row in the same `savesphere.db` transaction and drained into `dude.db` on commit and at start, at-least-once and deduplicated by key.

**SQLite.** Both files open through `@dude/sqlite-store`. **As built:** that package provides WAL, `synchronous=FULL`, `quick_check` and checksummed numbered migrations. The Node 24 `node:sqlite` build creates FTS5 virtual tables (checked on Node 24.21.0, SQLite 3.53.4). The vector index is the open library item: 32-SS1 provisions the place for it and 32-SS5 fills it.

**`BlobStore` (planned interface, PD-118; proposed shape):**

```ts
interface BlobStore {
  put(body: ReadableStream<Uint8Array>, opts?: { expectedSha256?: string; sizeHint?: number }): Promise<{ sha256: string; size: number; created: boolean }>;
  get(sha256: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>>;
  stat(sha256: string): Promise<{ size: number; storedAt: string } | null>;
  list(after?: string, limit?: number): Promise<{ sha256: string; size: number }[]>;
  delete(sha256: string): Promise<void>; // garbage collection only
  verify(sha256: string): Promise<'ok' | 'missing' | 'corrupt'>;
}
```

The local-disk implementation streams to a temporary file on the same volume while hashing, flushes it, then renames it into place without ever overwriting. A hash that already exists is a dedupe hit. References are counted in the content store, and only a garbage-collection job deletes a blob, after its last reference has been gone for a grace period. A periodic verify job re-hashes a sample and reports corruption as a notification. An S3-compatible implementation (R2, B2, MinIO) is a later open item that callers would not notice (PD-118).

**Durable job queue (as built in Milestone 834, PD-118 and PD-147; the sketch below is the original shape, see the [Milestone 834 notes](../delivery/PHASE32SS1_PLAN.md#2026-10-27-milestone-834-durable-job-queue-and-isolated-workers) for what shipped).** A `jobs` table holds:

- id, kind, priority and payload reference;
- state (`queued`, `leased`, `succeeded`, `failed`, `dead`, `canceled`);
- attempts, `run_after`, lease owner and lease expiry;
- a unique idempotency key;
- progress and a short error code.

Workers lease a job and renew the lease while they work. An expired lease returns the job to the queue. Failures retry with exponential backoff up to a cap, then the job goes `dead` and is visible. Cancellation is cooperative. Interactive work (a capture's first processing pass) outranks bulk re-indexing and imports. Queue rows are operational state: they are scrubbed from backups, and a restored Hub re-derives pending work from content state (for example, items that are missing a derived artifact).

The queue extends, and does not replace, the read-only job status of PD-112. The eight original timer jobs stay timers, and the jobs view gains queue depth and failures per kind. **Proposed:** the owner may cancel or retry SaveSphere processing jobs, because these are Hub-internal operations on the owner's own content. This is not device or remote execution, which stays in [Phase 88](../delivery/ROADMAP.md#phase-88) under the [Future Remote Execution](../architecture/SECURITY_ARCHITECTURE.md#future-remote-execution) boundary. The queue dispatches nothing to devices. The "no generalized distributed job system" limit of the [Worker Execution Layer](../architecture/SYSTEM_ARCHITECTURE.md#worker-execution-layer) concerns browser workers and device jobs, and still holds.

**Worker pool isolation (as built in Milestone 834: child processes only; `worker_threads` were not needed yet).** Parsers, OCR, transcription and thumbnailing handle hostile input. They run outside the request-serving process:

- CPU-bound JavaScript work runs in `worker_threads`.
- Native engines and untrusted parsers run in child processes, for example `dude-hub.exe` re-spawned in an internal worker mode.

Each run gets a wall-clock timeout and a memory ceiling (`--max-old-space-size` for Node children, a Windows Job Object for native ones) and is killed on breach. A crash fails that job attempt, never the Hub. Workers receive file handles or blob paths and return results; they get no database handle and no Hub secret. Whether worker entry points can be packaged inside the Node SEA, and whether OS-level egress blocking for workers is practical on Windows, are checked at 32-SS1 planning.

## Domain, ingress and availability

**Planned (PD-119):** one host on the owner's bare domain (generic `<domain>`; the reference deployment is the owner's own), routed by path:

| Path | Serves |
|---|---|
| `/` | DUDE Home with SaveSphere panels |
| `/savesphere/…` | The SaveSphere destination |
| `/tools/<id>` | Tools. **As built:** already the Hub web route form, since the hub build uses base href `/` |
| `/search`, `/ai`, `/settings`, `/admin` | Shell destinations (`/settings` exists today) |
| `/api/v1/…` | The existing API |
| `/api/v1/ingest/…` | The capture API: scoped ingest tokens only, never cookies, with its own rate limits |

`www.<domain>` redirects to the bare domain. **Proposed:** the Hub's Host guard admits `www.<domain>` only to answer a permanent redirect, before any other handler and without setting a cookie. This behaves the same in tunnel and direct Public mode, and the direct-mode certificate must cover both names. Email capture uses `save@<domain>`; its inbound path belongs to [Capture and Import](CAPTURE_AND_IMPORT.md).

**As built:** the Fastify server's default body limit is 64 KiB (`HUB_BODY_LIMIT` in `apps/hub/src/server/create-server.ts`), the sync and web push routes raise it to 512 KiB, and no non-JSON content-type parser is registered. **Planned (32-SS1):** resumable chunked uploads therefore get their own streaming route family, with a non-JSON body parser scoped to those routes only. **Proposed:** an upload session names its expected SHA-256 and size, and each chunk is idempotent by offset. Chunks stay well below 100 MB, because Cloudflare documents a 100 MB request-body limit on its lower plans. The server hashes the whole stream before it commits the blob.

**Managed Cloudflare Tunnel (planned, PD-120).** **As built:** the Hub supervises no long-running child process. It only runs short-lived helpers, such as the DPAPI protector in `apps/hub/src/tls/ca-key-protector.ts` and the firewall commands in `service/firewall.ts`. `cloudflared` becomes the first supervised child. The Hub starts it with the Hub, restarts it with backoff, health-checks it through its loopback metrics/readiness endpoint, and stops it with the Hub. **Proposed:** a Job Object makes sure `cloudflared` cannot outlive the Hub. Its state, restart count and last error appear on the jobs and diagnostics views, and its logs land in `logs/` without credentials.

The tunnel is mapped onto the **existing reverse-proxy mode**. **As built** (31E): `network proxy on --trusted <cidr> --public-origin <url>` binds the Hub to loopback and trusts forwarded headers from the configured peers, one hop (`apps/hub/src/config/hub-config.ts`). Proxy pins are registered with `tls proxy-pin add|activate|remove`. With the tunnel, the trusted hop is loopback (`cloudflared` on the same machine) and the public origin is `https://<domain>`. **Decided at 32-SS1 planning (PD-142, PD-143):** the tunnel is remotely managed, so ingress and `originRequest` are set in the Cloudflare dashboard (the wizard shows the exact values), and DUDE registers no proxy pin for Cloudflare's edge certificate: devices verify the tunnel domain against the public CA chain, and only the loopback hop is pinned. **Proposed:** `cloudflared` verifies the Hub's loopback certificate against the Hub's local CA rather than skipping origin verification.

The tunnel passes the **same public readiness gate** as any other exposure. **As built:** `evaluatePublicReadiness` (`apps/hub/src/diagnostics/readiness.ts`) applies the `public-firewall-rule` blocker whether or not proxy mode is on, but a tunnel needs no inbound port. **Proposed (32-SS1):** a tunnel-aware check set (tunnel connected and healthy, no inbound rule required) replaces `public-firewall-rule` and `inbound-bind` in tunnel mode and leaves every other blocker unchanged (decided, PD-143). The reachability echo still has to verify an off-LAN client through the public name.

**Disclosure (planned).** Setup states plainly that Cloudflare terminates TLS at its edge and can read the traffic, and that direct Public mode avoids this.

**Tunnel credentials (planned).** The credential is the connector token the owner pastes (PD-142). It is a Hub secret, is never logged and is given to `cloudflared` in its environment only. The Hub holds no Cloudflare API token and still stores no DNS-provider credential for anything else (PD-064). **As built:** the Hub has no general secret store. It protects each machine-bound secret separately with DPAPI LocalMachine and its own entropy: the CA key, the ACME account key and the scheduled-backup derived key (`tls/ca-key-protector.ts`, `backup/schedule-key.ts`). None of these is included in a backup. **Proposed (32-SS1):** a small Hub secrets module generalizes that pattern for the tunnel credential, the OIDC client secret, AI provider keys, backup destination credentials and the vault key wrap. Because that material stays out of backups, a restored Hub asks the owner to re-enter those credentials.

**Direct Public mode (planned, PD-120)** is the 31F mode, unchanged: built-in ACME, the `DUDE Hub (Public)` firewall rule, an operator-configured router port-forward and the same gate ([31F](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31f-internet-readiness)).

**Sign-in gating (planned, PD-122).** Everything on the domain requires an owner session, or a guest session from 32-SS6. The only unauthenticated paths are sign-in, recovery, static assets (including the cached offline shell), the token-only ingest path and public share links, plus the degraded-state page described below. **As built:** every Hub route declares a credential type, and on Hub web `hubSessionGuard` redirects an unauthenticated visitor to sign-in. **Proposed:** the server-side list of unauthenticated paths becomes explicit and is enforced by a spec that enumerates it, and blob downloads always require a session, a grant or a share token.

**Availability and the Hub-offline page (planned, PD-123).** The Hub stays on the owner's PC, and downtime is accepted. Desktop and Android keep working from their replicas, and the PWA keeps its read cache and capture queue. Where the "Hub offline" page can actually come from is limited:

- **Browsers that have loaded the site before.** The Hub web service worker can show the page. **As built:** the service worker caches public assets only and never caches `/api` (`ngsw-config.hub.json`), and Hub web already boots read-only for shared state when the Hub is unreachable (31E). **Proposed:** the offline page is a precached public asset used as the navigation fallback. Next to it, the SaveSphere read cache and capture queue keep working.
- **First-time visitors, cleared caches and other browsers.** When the Hub or the tunnel is down, the Hub cannot answer at all. Visitors get the tunnel provider's error page, or a connection error in direct Public mode. DUDE does not depend on Cloudflare being configurable to show an owner-supplied page; 32-SS1 does not rely on it (PD-144 serves the Hub-offline page from the service worker's precache).
- **The Hub is up but SaveSphere is degraded.** The Hub serves the page itself as an unauthenticated path.

A warm-standby DUDE device can receive backups and be promoted manually through the 31G transfer. Automatic failover, clustering and a hosted fallback stay out of scope ([Phase 96](../delivery/ROADMAP.md#phase-96), [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries)).

## Identity

**Planned (PD-121, amends [PD-027](../history/DECISION_LOG.md#phase-31c-implementation-decisions)):** Google OIDC becomes the primary owner sign-in.

**Proposed flow (32-SS1).** Sign-in uses the authorization code flow with PKCE (S256), `state` and `nonce`, and the owner's own OAuth client. The client secret is a Hub secret, and the redirect URI is a fixed path on `https://<domain>`. The ID token is checked against Google's published keys (cached; a fetch failure disables the button with an explanation, never weakens the check) for `iss`, `aud`, `exp`, `nonce` and `auth_time`.

**Binding.** **Planned:** an identity binds to the owner by `sub` only, never by email, and only after a round-trip that starts from an already signed-in session. **Proposed:** a `linked_identities` table in `dude.db` holds provider, `sub`, a display hint, the link time and the last-use time. Linking needs step-up, and the last linked account cannot be unlinked. A sign-in from any other Google account is refused and audited (planned). **Proposed:** that audit record holds the provider and the outcome but not the foreign account's address, and failed callbacks count toward the existing flood and IP-block thresholds (`apps/hub/src/security/ip-block.ts`). A successful sign-in issues the same owner cookie session that exists today, so the 31C credential classes and the setup-token bootstrap are unchanged.

**Step-up and fallback.** **As built:** step-up is a 5-minute password confirmation through `POST /auth/step-up`. **Planned:** step-up accepts either method. **Proposed:** a Google round-trip satisfies step-up when it is forced fresh (`max_age=0` with an `auth_time` check). The Argon2id password and the recovery codes stay as the fallback. The Hub stays fully operable with Google unreachable or the OIDC client removed: sign-in then simply offers the password.

**Other principals.** Replicas authenticate as devices, and a device credential never grants owner rights. Owner-only actions on Android (vault unlock, purge) need an owner session there, which the Android app does not have today. How it gets one is a [question](#questions-for-phase-planning) for 32-SS2 planning. Guests (PD-139) arrive in 32-SS6 as a new principal kind with a grant table ([Sharing](#sharing)). Every new route stays contract-first: it declares its credential types, which now also include ingest tokens (32-SS3) and guest sessions and share tokens (32-SS6).

## Content model and storage

**Planned (PD-128):** every entry is an item with a stable ID, and types and properties are data. **Proposed tables in `savesphere.db` (32-SS2, with types, properties and views completed in 32-SS5):**

| Table | Holds |
|---|---|
| `items` | UUIDv7 id, type, title, created and updated times and principal or device, source, trash time, vault flag, revision, schema version, pinned-field set (PD-134) |
| `item_types`, `property_defs` | Built-in and owner-defined types and typed properties, all stored as rows and versioned |
| `item_properties` | Property values validated against the type definition, with an indexed side table for properties used by views |
| `links` | Source item and block, target item and optional block, link type, origin (`wikilink`, typed, capture, import, accepted suggestion) |
| `tags`, `item_tags`; `collections`, `memberships` | Tags; notebooks and collections holding items by reference, so one item can appear in several |
| `views` | Saved table, list, kanban, calendar and gallery views stored as data |
| `attachments`, `derived_artifacts` | Item to blob (name, media type, role `original` or `attachment`); derived output with provenance (see [Processing pipeline](#processing-pipeline)) |
| `doc_state`, `doc_updates`, `doc_snapshots`, `doc_projection` | Yjs persistence and the plain projection (below) |
| `item_revisions` | Metadata changes as reversible patches, each with an author (owner, device, import or "AI") |
| `capture_receipts`, `import_sources` | Idempotency keys (PD-131); source-system ids mapped to items so a re-run never duplicates (PD-132) |
| `change_feed`, `applied_ops`, `tombstones` | SaveSphere's own revision sequence for replicas |

**Rich documents (planned, PD-129):** Tiptap and ProseMirror bound to Yjs. Every block carries a stable ID (PD-128). **Proposed:** the ID is assigned on creation, kept when a block is edited or moved, given anew to the second half of a split, and regenerated on paste when it would collide. A document is one Y.Doc per item, reusing the 31J pattern ([as built](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31j-collaborative-documents-and-realtime-depth)):

- a compacted state plus an update tail;
- history snapshots;
- only the Hub seeds content;
- restore applied as a forward edit.

A materializer writes a plain **projection** (text per block for search, Markdown for the mirror and export, a static render for read caches, guests and share links).

This differs from 31J on purpose. 31J materializes the whole document into a sync record through `commitCanonical`, refuses updates that would push the record past 128 KiB, and keeps `@dude/collab-doc` to a closed list of three kinds. **Proposed:** SaveSphere documents are not squeezed through `SYNC_LIMITS`. The Y.Doc is the source of truth for a document body, the projection lives in the content store and not as a sync record, and three channels carry the data: item metadata uses record-style operations (each within a per-record cap), document bodies use Yjs updates, and attachments use the blob channel. A per-document size ceiling is set by measurement ([targets](#performance-and-limits-targets)).

**Ink (planned, PD-129).** Ink is vector stroke data with pressure and tilt. Handwriting and typed blocks can sit in one note, and every surface except the pen surfaces shows ink read-only. **Proposed:**

- Each stroke has a stable stroke ID and a compact, delta-encoded point stream (position, pressure, tilt, orientation, time offset), plus tool, width and the owner-chosen color.
- Strokes live in a keyed Y.Map. Concurrent additions are both kept, and erasing deletes a key. A partial erase replaces one stroke with new strokes.
- `androidx.ink` and Windows pen input convert to this portable form at the native boundary.

**PDF annotation (planned).** Highlights, ink and comments form a separate layer keyed to the original blob's SHA-256, and the original is never modified. **Proposed:** the layer is a Y.Doc per annotated attachment, with anchors in PDF page coordinates plus the highlighted text. "Export annotated copy" writes a new blob and a new attachment.

**Canvas (planned).** Infinite canvases hold ink, text, shapes, images and live cards that reference items without copying them. **Proposed:** a Y.Doc of elements keyed by ID, each with a transform and z-order. The canvas engine is open (32-SS4).

**History (planned, PD-130).**

- Versions are kept for 90 days, then thin to one per day and then one per month. The exact tiers are set at 32-SS2 planning, and the owner can change them.
- Originals are never thinned or replaced.
- Trash holds deleted items for 30 days. Permanent purge is previewed and needs step-up.
- Restoring a version applies it as a forward edit.

**Proposed:** a version is a Y.Doc snapshot taken when the document goes idle, as in 31J, or a metadata revision. AI-authored changes are separate versions so they can be undone. A daily thinning job keeps the newest version per bucket and never touches blobs with role `original`. Purge follows the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract) with the server-side ConfirmationStore and a confirmation-boundary spec. It removes the item, its history and its derived artifacts, and leaves blobs to garbage collection.

## Sync and offline

**Planned (PD-126):** desktop and Android each keep a full replica: metadata, documents, and attachments within a configurable budget, with the rest fetched on demand. Edits go into a durable outbox and merge through Yjs. The web PWA gets a capture queue plus a read cache of recent and pinned items, and editing on the web needs the Hub. Captures never fail just because the device is offline.

**Why SaveSphere does not use the workbench record tables (proposed, 32-SS2).** `SYNC_LIMITS`, `OUTBOX_MAX_ROWS` (10,000) and Android's 10,000-row ceiling per context are sized for workbench state, not for a knowledge base of tens of thousands of items. SaveSphere therefore gets its own tables, feed and endpoints. It keeps every rule of the [Sync Protocol Minimum Acceptance Contract](../architecture/DATA_SYNC_ARCHITECTURE.md#sync-protocol-minimum-acceptance-contract): outbox writes atomic with the local change, unique operation IDs, Hub-assigned revisions and cursors, tombstones and retention, quarantine instead of silent loss, and backpressure instead of dropped edits.

| Data | Channel (proposed) |
|---|---|
| Item metadata, types, links, tags, memberships, views | Outbox operations with `basedOnRevision`, a SaveSphere change feed, per-field `merge3` rules |
| Document bodies (rich text, ink, canvas, PDF layers) | Yjs updates: live over a collaboration socket; catch-up for offline replicas by state-vector exchange |
| Originals and attachments | Blob channel: resumable chunked upload, content-addressed ranged download, dedupe by hash |

**Desktop replica.** It lives in the Device Agent's store and arrives through a new numbered device-store migration (0006 or later), with blobs in a folder beside the store. **As built:** the Agent writes a `VACUUM INTO` copy before each store upgrade and keeps the last three. With a large replica that multiplies disk use, so 32-SS2 planning decides between replica tables in `dude-device.db` and a second Agent-owned database. **As built:** in 31J the Y.Doc and editor live in the renderer, and the Agent depends on neither Yjs nor `@dude/collab-doc`. **Proposed:** the Agent keeps opaque Yjs updates in the replica, the renderer applies them, and compaction uses the Hub's state, so the Agent can stay Yjs-free.

**Android replica.** It uses app-private `expo-sqlite` with a new structural migration, blobs in app-private files, and the existing backup exclusions. **As built:** `@dude/collab-doc` is forbidden in `apps/mobile` (`docs/architecture/PORTABLE_CORE.md`), and the app has no DOM. Android Yjs (PD-126) therefore needs a SaveSphere document package that is allowed on mobile, and an editor host for Tiptap; a WebView editor bridged to the native app is the obvious candidate. Both are decided at 32-SS2 planning.

**Attachment budget (planned).** **Proposed:** least-recently-used eviction of attachments that are not pinned. Metadata and documents are never evicted, and the budget is a `device`-scoped setting.

**PWA.** **As built** (31E): Hub web has no offline outbox, writes are online-only, and sign-out wipes every IndexedDB database. **Planned:** a capture queue in IndexedDB, with one idempotency key per capture, and a read cache. **Proposed:** sign-out warns when captures are still unsent before it wipes them, and the read cache is wiped like everything else.

**Consent (planned).** A new SaveSphere sync category, named at 32-SS2 planning. The 31D rules still apply: enrollment, the first-sync preview with Merge, Use Hub or Keep local, and per-category consent on devices, with the web-access toggle on Hub web. Collaboration consent follows PD-103.

**Conflicts (proposed).** Document bodies merge through Yjs without markers. Ink merges additively. Metadata merges by field rules, and anything that cannot merge produces a conflict copy: a new item linked to the original and flagged in the inbox. Nothing is ever lost silently. An edit to an item deleted elsewhere restores the item to the trash with the edit applied and flags it.

## Processing pipeline

**Proposed (built in 32-SS3; AI processors in 32-SS5).** Each content type has an ordered list of processors, registered as data:

1. Detect the type from content (magic bytes), never from the extension.
2. Extract text and metadata (PDF, DOCX, EPUB, HTML, email, Markdown, code).
3. Run OCR on images and scanned pages.
4. Recognize handwriting for search (ink, Samsung Notes PDF pages; PD-132).
5. Transcribe audio and video.
6. Make thumbnails and previews (to `cache/`).
7. Compute embeddings per block or passage.
8. Classify and organize ([PD-134](../delivery/PHASE32SS_PLAN.md)).

Each processor's output is a derived artifact (stored text, or a blob next to the original) with provenance:

- processor ID and version;
- engine or model ID;
- a hash of the parameters;
- the source SHA-256;
- the creation time.

A job is idempotent on (source hash, processor, version). A new processor version or a model change queues low-priority re-index jobs, and embeddings record model and dimension so two models can coexist during a re-index.

Captured HTML is sanitized before it is stored or rendered. Vault content is excluded from every processor that indexes or reaches AI (PD-138). Untrusted parsers run in the [worker pool](#hub-provisioning-and-storage). With no AI provider configured, the non-AI processors still run and the AI ones show "not configured" (PD-135).

The engines are open items: OCR and transcription engines, the vector library, and whether embeddings, OCR and transcription run locally or in the cloud (32-SS5).

## Search and AI

**Full-text (planned, PD-136; proposed shape, 32-SS2).** One FTS5 table over passages: item ID, block ID, field kind (title, property, body, OCR, handwriting, transcript, PDF annotation, attachment text) and text. A `unicode61` word index serves ranked queries and phrases, and an optional trigram index serves substring and code search. Hits are block-level, with `snippet()` highlights. Filters on type, tag, date and property join in SQL, and saved searches are views. The vault is never indexed.

**Vector and hybrid (32-SS5).** Embeddings are stored per block, with long blocks chunked, in the open vector library. **Proposed:** rankings are fused by reciprocal rank fusion of the FTS5 BM25 and vector k-nearest-neighbour lists, then expanded along links (PD-136).

**Provider interface (planned, PD-135; proposed shape).**

```ts
interface AiProvider {
  readonly id: string;
  chat?(req: ChatRequest, ctx: AiTaskContext): Promise<ChatResult>;
  embed?(passages: readonly string[], ctx: AiTaskContext): Promise<EmbeddingBatch>;
  vision?(image: BlobRef, ctx: AiTaskContext): Promise<OcrResult>;
  handwriting?(strokes: StrokeSetRef, ctx: AiTaskContext): Promise<RecognitionResult>;
  transcribe?(media: BlobRef, ctx: AiTaskContext): Promise<TranscriptResult>;
}
```

Every call goes through a Hub-side broker that does the following:

- refuses vault content unless the owner allowed that item;
- writes a disclosure record: task, provider, model, and the item and block IDs and byte counts sent, never the content;
- meters usage into a ledger and refuses work beyond the owner's spend cap, raising a notification;
- applies timeouts;
- reads provider keys as Hub secrets.

Which providers to use is deferred to 32-SS5 planning. SaveSphere works fully without any provider.

**Confidence-gated organization (planned, PD-134).** Confident proposals apply as revisions authored by "AI". Others go to the inbox. Owner choices pin a field. AI never deletes, merges or rewrites the owner's text. **Proposed:** these limits are enforced in the apply layer, not in prompts. AI writes pass through an allowlist (type, tags, membership, added links, and a title only on an unpinned capture title) that rejects every other operation.

**Copilot (planned, PD-136).** Answers cite items and blocks. **Proposed:** a verifier keeps a citation only if its (item, block) pair was in the retrieved set and any quoted text appears in that passage. Captured content goes to models as delimited data, and the Copilot has no tool that writes, fetches, sends or opens the vault (planned). **Proposed:** answers render as sanitized text that never loads remote resources, which closes an exfiltration path through image URLs.

**Relationship to the desktop LLM bridge.** **As built:** `apps/desktop/llm-bridge.ts` is a sender-checked `dude:llm:chat` IPC call in Electron main to an OpenAI-compatible endpoint. Its base URL and model come from the device-scoped `ai-provider` document, its key is `ai.llmApiKey` in `safeStorage`, and it is non-streaming with a 120-second timeout. It stays as it is for developer tools and does not share configuration with the Hub provider. [Phase 36](../delivery/ROADMAP.md#phase-36) may choose to reuse the Hub interface; nothing here decides that.

## Markdown mirror and external editors

**Planned (PD-133).** A desktop can mirror SaveSphere into a folder the owner chooses, as Markdown files with front matter plus the original attachments, synced both ways. External edits come back as new versions, and conflicts produce conflict copies. Mirror writes are filesystem mutations under a standing authorization the owner grants per folder, under the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract), and the mirror never deletes outside its folder. It is desktop-only: Windows now, Linux after [Phase 39](../delivery/ROADMAP.md#phase-39) (PD-127). The mirror is delivered in 32-SS3.

**Mapping (proposed).**

- One file per item, named from its sanitized title plus a short ID suffix.
- Front matter holds `savesphere_id`, type, tags, properties, notebooks and timestamps.
- Notebooks are folders. An item in several notebooks lives in its primary notebook's folder and lists the others in its front matter.
- Attachments go in an `_attachments/` folder and are linked relatively.
- Ink, canvases and PDF layers appear as read-only rendered files; edits to those files are not imported.

**Two-way sync (proposed).** Outgoing writes are atomic (a temporary file, then a rename). Incoming changes are three-way merged against the last mirrored text (`mergeText3`) and applied to the Y.Doc as a forward edit, which creates a new version. Echo suppression records the hash of each written file and ignores events whose content matches it. When both sides changed and cannot be mapped, the mirror writes `<name> (conflict <device> <time>).md` and never overwrites. A new file becomes a new item. A deleted file moves the item to the trash. An item deleted in SaveSphere moves its file to the Windows Recycle Bin, as the Phase 29 trash operations already do, never a hard delete. Granting a folder is a previewed two-step action with consequence class `filesystem-write`, a confirmation-boundary spec and a journal, and it is revocable.

**Where it runs.** **As built:** Phase 29 watching is `apps/desktop/fs-watch-service.ts` in Electron main. It runs while DUDE runs (window open or in the tray), has no launch-on-login service, and builds on remembered-root grants (`fs-grants.ts`, `resolveInRoot`) and journaled mutation (`fs-mutation.ts`) ([Phase 29](../history/DELIVERY_HISTORY.md#phase-29)). The Device Agent does no file watching and performs no file operations for anyone. **Proposed (32-SS3):** the mirror engine runs in Electron main, reuses those pieces and reads and writes the replica through the Agent. Running it inside the Agent, so it works with the desktop closed, would widen the Agent's role and needs its own decision.

**External editors (planned).** On Android an attachment opens through an `ACTION_EDIT` intent with a granted content URI and is read back on return. On the desktop a watched temporary copy is opened in the default application. A saved result comes back as a new version, and the original is kept.

## Notifications and reminders

**Planned (PD-137).** Due reminders, resurfaced items and digests reach the owner through a SaveSphere panel on DUDE Home and the bell, Android push, a daily or weekly email digest, and Windows notifications through the 31J path. Payloads carry no item content.

**Proposed (32-SS5):**

- **Scheduler.** The reminder scheduler is a durable job. It expands only the next occurrence of a recurrence, and after downtime it fires each overdue reminder once, de-duplicated.
- **Producers.** Reminder, resurfacing and digest kinds are added deliberately to the closed producer and kind lists. The 31J title and body limits and the no-record-content rule ([31J security](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31j-collaboration-notifications-and-presence)) apply unchanged, so a notification says "1 reminder due" and the client loads the item under its own session.
- **Delivery adapters.**
  - The bell and the Home panel, as built.
  - Windows toasts. **As built:** Agent to Electron main to `hub-notification-toasts.ts`, opt-in per kind and working while the window is in the tray.
  - Android push. The transport (FCM as an optional transport, with background polling as the fallback) is open until 32-SS5.
  - The email digest. The send path (Gmail API with the owner's grant, or SMTP) is open until 32-SS5, and so is what a content-free digest shows.

## Vault

**Planned (PD-138).**

- **Contents.** Sensitive notes and files, plus structured credentials and ID records with copy-to-clipboard. It is not an autofill password manager.
- **Encryption.** Encrypted at rest on the server with its own key, separate from the backup passphrase and from the canonical database.
- **Access.** Opening it needs step-up, and it locks again when idle.
- **Exclusions.** It is excluded from AI, OCR-to-index, the mirror, export (unless explicitly included), ingest tokens and sharing.
- **No end-to-end encryption.** That remains [Phase 82](../delivery/ROADMAP.md#phase-82).

**Proposed key scheme (final scheme at 32-SS2 planning).**

- **Wrapping.** A random 256-bit vault data key is wrapped with DPAPI LocalMachine using its own entropy, the same pattern as the CA key.
- **Encryption.** Vault fields, documents and attachments are encrypted with XChaCha20-Poly1305 (`@noble/ciphers`, already used by `@dude/hub-backup`).
- **Blob identity.** Vault blobs are keyed by ciphertext, so plaintext hashes never reveal or deduplicate against non-vault content.
- **Unlocking.** Step-up unlocks the key into Hub memory for an unlock window. Idle or explicit lock zeroes it.
- **Search.** Vault search runs in memory while unlocked, with no persistent index.
- **Replicas.** Devices do not replicate vault content; it is fetched on demand while unlocked and held in memory only.

This protects the vault against a copied database, a stolen disk or a leaked backup. It does not protect it against code running as the Hub service account. Backups carry vault content as ciphertext. The DPAPI wrap is machine-bound and is not in a backup, so restoring onto another machine cannot open the vault without some other recovery path. Which path, for example a separate vault recovery key, is not decided; it is a [question](#questions-for-phase-planning) for 32-SS2.

## Sharing

**Planned (PD-139, 32-SS6).**

- **Guests.** Named Google accounts are invited as guest principals with view, comment or edit access to selected notebooks or items.
- **Public links.** Read-only, expiring and revocable.
- **Limits.** Guests never see the vault, AI settings, devices, tools state or admin pages, and cannot invite others. The owner stays the sole admin.
- **Audit.** Every grant, link and access is audited.

This delivers named participants for SaveSphere ahead of [Phase 53](../delivery/ROADMAP.md#phase-53).

**Proposed:**

- **Guest binding and sessions.** A guest binds by Google `sub` when accepting an invitation and gets its own cookie session class, separate from the owner's.
- **Grants.** A `grants` table holds principal, target, level and an optional expiry. One authorization layer resolves every SaveSphere read and write to a principal and checks grants. Guest editing reuses the collaboration socket, where the 31J awareness identity rewriting already applies.
- **Share tokens.** At least 128 random bits, stored hashed, served on an unauthenticated path with `noindex` and their own rate limit. They render the static projection, with no socket. Attachments are reachable only through token-scoped URLs.
- **Audit volume.** Access auditing at link scale has to fit the audit retention of 365 days or 100,000 events; aggregation is settled at 32-SS6 planning.

## Backup v2

**As built** (31G, [data](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31g-backup-restore-and-transfer), [security](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31g-backup-restore-and-transfer)):

- one `.dudebackup` file with a plaintext reader header, an XChaCha20-Poly1305 payload in 64 KiB chunks and an Argon2id passphrase key;
- a scrubbed `VACUUM INTO` copy of `dude.db` plus `hub.json`, held as whole buffers under the 512 MiB and 32-file ceilings;
- verify-before-rename, a DPAPI-protected derived key for schedules, and an offline elevated restore that assigns a new instance ID and epoch + 1;
- TLS and DPAPI material never included.

**Planned (PD-124).** Backups become streaming and chunked, with no size cap, and include the blob store, deduplicated against earlier backups so they stay incremental. The destinations are a local or second drive, an S3-compatible bucket, a warm-standby DUDE device, and Google Drive or OneDrive. The key model stays the backup passphrase. Every backup is verified before it counts, a restore drill is scheduled, and an overdue or failed backup raises a notification. Backup v2 is delivered in 32-SS1.

**Proposed format (32-SS1).**

- **Snapshots.** A backup is an encrypted snapshot manifest. It lists streamed `VACUUM INTO` copies of both databases (scrubbed as today, plus queue rows) and the set of referenced blobs.
- **Pack files.** Blobs live in encrypted pack files under random names. A destination index maps keyed hashes (an HMAC of each SHA-256 under a key derived from the passphrase) to packs, so later backups upload only new blobs and a destination never sees plaintext hashes.
- **Format library.** `@dude/hub-backup` keeps its chunk construction and injected KDF, random source and clock, gains stream interfaces, and stays portable.
- **Verification.** Each run re-reads and authenticates the manifest and new packs. The drill restores to a scratch directory and verifies everything.
- **Retention.** Pruning removes old snapshots, and packs that are no longer referenced are collected afterwards.
- **Destinations.** Destination adapters share one interface. Their credentials are Hub secrets.

**Restore** stays an offline elevated command and now also restores the content store and blobs. The 31G semantics are unchanged (new instance ID, epoch + 1, devices re-pair). Replicas reconcile through the existing `authority-changed` and `needs-reconcile` flow, and the history-regressed guard extends to the SaveSphere feed. **Warm standby** is a destination, and promotion is the manual 31G transfer (`backup create --for-transfer`, restore, re-pair). The standby device pulls the encrypted chunks over a device-token route behind a per-device grant (PD-151). Ingest tokens are scrubbed on restore and reissued (PD-149).

## Planned packages and modules

Every entry here is **Planned**. Names are **proposed**.

| Location | Responsibility | Phase |
|---|---|---|
| `@dude/contracts/hub` subpaths (`savesphere`, `ingest`, `oidc`, `uploads`, `queue`) | TypeBox request and response schemas, per the Hub rule that contracts live on that subpath | 32-SS1 onward |
| `@dude/api-client` | A typed method for every new route; `apps/hub/src/server/api-client-parity.spec.ts` must pass | 32-SS1 onward |
| `@dude/savesphere` (portable) | Item, type and property model, block-ID rules, Markdown mapping, merge rules, projections, view and query representation, persistence codecs; no Node built-ins | 32-SS2 |
| SaveSphere document package (portable) | Yjs schemas for rich text, ink, canvas and PDF layers. It must be allowed on mobile, unlike `@dude/collab-doc` | 32-SS2 |
| `@dude/hub-backup` | Streaming v2 format | 32-SS1 |
| `apps/hub/src/` `provisioning/`, `secrets/`, `blobs/`, `uploads/`, `queue/` (separate from the read-only `jobs/job-status.ts`), `workers/`, `tunnel/`, `auth/oidc/` | Platform | 32-SS1 |
| `apps/hub/src/savesphere/` (content store, routes, history, search), `ingest/`, `processors/`, `ai/` (providers, broker, ledger), `sharing/` | Content and services | 32-SS2 to 32-SS6 |
| `apps/device-agent/src/savesphere/` | Replica, blob cache, sync driver, new device-store migration | 32-SS2 |
| `apps/desktop/` | Mirror engine and external-editor round-trip in main | 32-SS3 |
| `apps/mobile/` modules | Ink (`androidx.ink`), document scanner, PDF, extended share capture, capture widget and Quick Settings tile | 32-SS2 to 32-SS4 |
| `apps/web/src/app/shell/savesphere/`, `core/savesphere/` | Destination (exception #15), port and adapters, Home panels, palette sources; the editor lazily loaded in `apps/web` only, as PD-107 did for CodeMirror | 32-SS2 onward |

**Repository rules that bind all of this:**

- **Routes.** Every Hub route is contract-first: TypeBox schemas, a declared credential type and an audit event. New audit events are added deliberately to the closed list in `packages/contracts/src/hub/audit.ts`, and audit never carries content or credentials.
- **Destructive actions.** Purge, mirror grants, restore and vault export follow the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract) with confirmation-boundary specs in the high-consequence gate.
- **Data scope.** Every persisted entity declares a scope ([Portable Core](../architecture/PORTABLE_CORE.md#data-scope)). Proposed: SaveSphere content is `environment`, the attachment budget and mirror folder grants are `device`, and queued PWA captures are `local-only` until uploaded. `docs/architecture/data-scope-entities.json` and `check:inventory` gain entries only once the source files exist.
- **Bundles.** The destination, the editor and the viewers are lazy chunks that stay inside the existing prefetch and bundle budgets.

## Candidate dependencies

**Decided:** Yjs (already an `apps/web` dependency since PD-107), Tiptap/ProseMirror with `y-prosemirror` (PD-129), and `androidx.ink` (PD-127, PD-129).

Every other entry below is a candidate. Each is judged against the [Dependency Philosophy](../architecture/SYSTEM_ARCHITECTURE.md#dependency-philosophy) (runs wherever its capability is declared, no mandatory remote service, maintained, compatible architecture), the dependency-minimal default in `AGENTS.md`, and its license.

| Need | Candidates | Evaluated at |
|---|---|---|
| Vector index | `sqlite-vec` loaded into `node:sqlite` as an extension (native binary per platform, SEA packaging), or an alternative | 32-SS1 (provision), 32-SS5 (fill); open item |
| Tunnel | The `cloudflared` binary, hash-pinned as WinSW is | 32-SS1 |
| OIDC | `node:crypto` JWT verification with a small hand-written flow, or `openid-client`/`jose` | 32-SS1 |
| PDF | `pdfjs-dist` for viewing and text extraction; Android PdfRenderer or `androidx.pdf` | 32-SS3, 32-SS4 |
| OCR | Tesseract (WASM or native), Windows OCR, a cloud vision slot | 32-SS5; open item |
| Transcription | whisper-class local ASR or a cloud slot | 32-SS5; open item |
| Document text | DOCX, EPUB and email parsers; Hub-side HTML sanitization (DOMPurify needs a server-side DOM) | 32-SS3 |
| Thumbnails | `sharp` (native libvips) or a pure-JS path | 32-SS3 |
| Canvas engine | Judged on license and stylus support | 32-SS4; open item |
| Document scanning | ML Kit document scanner (a Google Play services dependency, disclosed) or CameraX with custom edge detection | 32-SS4 |
| Flashcards | An FSRS implementation such as `ts-fsrs` | 32-SS5 |
| S3-compatible blobs and backup | A minimal SigV4 client or the AWS SDK | When the S3 tier or backup destination is planned |

## Performance and limits targets

These are **proposed** starting targets. In line with the [Sync Protocol Minimum Acceptance Contract](../architecture/DATA_SYNC_ARCHITECTURE.md#sync-protocol-minimum-acceptance-contract), limits are measured and recorded during implementation, and each phase confirms or replaces the values below.

| Target | Proposed value | Confirmed at |
|---|---|---|
| Capture acknowledged locally (desktop, Android, PWA queue) | Under 200 ms, online or offline | 32-SS3 |
| Text capture visible in the Hub inbox when online | Under 5 s | 32-SS3 |
| Search first results at about 50,000 items on the reference Hub | Under 200 ms at p95 for full-text; hybrid under 1 s | 32-SS2, 32-SS5 |
| Open an item from a local replica | Under 300 ms | 32-SS2 |
| Upload chunk size | 8 MiB, resumable by offset, below the tunnel request-body limit | 32-SS1 |
| Single attachment size | No fixed cap (streaming); bounded by disk and the blob verify job | 32-SS1 |
| Default attachment budget | Desktop 10 GiB, Android 2 GiB, owner-adjustable | 32-SS2 |
| Per-document Y.Doc ceiling | Set by measurement, with a refusal path like 31J's `too-large` | 32-SS2 |
| Worker limits | Per-processor timeout and memory ceiling, measured on representative files | 32-SS1, 32-SS3 |
| Backup v2 | Memory bounded independently of data size; an incremental run proportional to new blobs | 32-SS1 |

## Questions for phase planning

These questions follow from comparing the decisions with the as-built code. None of them is decided here.

- **32-SS1.**
  - Resolved at Milestone 829 ([PD-141-PD-154](../delivery/PHASE32SS1_PLAN.md)): device trust behind the tunnel (public-CA trust for the tunnel domain, loopback hop pinned, PD-143); the tunnel-aware readiness check (PD-143); which wizard steps run on the elevated local channel (the elevated `provision` run, PD-153); worker entry points in the SEA (executable re-spawn, PD-147); ordering between the two databases and the audit log (separate files, `audit_outbox`, PD-146); and how backup bytes reach a warm-standby device (the standby pulls, PD-151). Milestone 830 still gates the SEA, FTS5 and `sqlite-vec` assumptions.
- **32-SS2.**
  - Replica tables in the device store or a second Agent database.
  - A mobile-allowed Yjs document package and the Android editor host.
  - How Android gains an owner session for vault unlock and purge.
  - How the vault key survives a restore onto another machine.
  - The SaveSphere sync category name.
- **32-SS3.**
  - Whether the mirror runs in Electron main or the Agent.
  - Whether ingest tokens survive a restore.
- **32-SS6.**
  - Aggregating access audit within the audit retention limits.
