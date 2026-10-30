# SaveSphere program decisions (Phases 32-SS1 to 32-SS6)

Status: program planned; **Phase 32-SS1 is built** (complete at Milestone 855, live passes owed: [plan](PHASE32SS1_PLAN.md#ss1-as-built-summary), [acceptance](PHASE32SS1_ACCEPTANCE.md)) and 32-SS2 to 32-SS6 are not implemented. Decisions PD-116–PD-140 were recorded at Milestone 828 (2026-10-25) and govern the SaveSphere program: six inserted phases, **32-SS1 to 32-SS6**, that run after Phase 31J and before Phase 32. The [ROADMAP SaveSphere entries](ROADMAP.md#savesphere-program) set each phase's scope and exit gate. The product, capture, architecture and AI details are in [SaveSphere documentation](../savesphere/README.md). [DUDE — Product Requirements](../DUDE_PRD.md) keeps authority over boundaries and invariants, and the dated [SaveSphere program decision](../history/DECISION_LOG.md#savesphere-program-decision--2026-10-25) records why the product scope widened. Each phase gets its own milestone map and decisions in its own plan document (Phase 32-SS1: [PD-141–PD-154](PHASE32SS1_PLAN.md), recorded at Milestone 829 on 2026-10-27), and any scope additions are added here as [dated scope entries](#dated-scope-entries-pd-140). PD-120, PD-122, PD-123 and PD-124 were reworded at Milestone 829 to match those decisions. Nothing in this document is an as-built claim.

**What SaveSphere is.** SaveSphere is a personally owned knowledge system inside DUDE, run by the owner's own Hub and reached over the owner's own domain. It is one place to capture, preserve, organize and find anything the owner decides to keep, whatever its source or format. It also replaces Samsung Notes, Evernote and OneNote for everyday notes, handwriting, PDF annotation and canvases. It is not a separate product or stack: it reuses DUDE's Hub, identity, sync, backup, Android app, desktop app and design system. The reference deployment is the product owner's Hub at `abdulssavesphere.com`, but every decision below applies to any owner's domain and Google account.

## Decisions

- **PD-116 — SaveSphere is rebuilt inside DUDE.** The earlier standalone SaveSphere codebase (.NET, PostgreSQL, Redis, Docker, Cloudflare Tunnel at a subdomain, 133 of 422 build-plan items done) is discarded. Only its feature set is used as reference material (its `MAIN.md` and `BUILDPLAN.md`). Its stack-specific choices do not carry over, and neither does its data: the old data is disposable, so no importer from old SaveSphere is built.
- **PD-117 — Phase identifiers and sequence.** The program is inserted as Phases **32-SS1 to 32-SS6** ("SS" for SaveSphere), with anchors `phase-32-ss1` to `phase-32-ss6`. This follows the 31A–31J precedent: every historical Phase 0–31J identifier and every retained Phase 32–100 identifier stays unchanged. The phases run strictly in order after 31J: 32-SS1 Hub Platform, 32-SS2 Notes Core, 32-SS3 Capture and Inbox, 32-SS4 Ink and PDF, 32-SS5 Structure and Copilot, 32-SS6 Sharing. Phase 32 begins after 32-SS6. The **first SaveSphere release gate** closes at the end of 32-SS5, so notes, capture, ink/PDF, structure and the Copilot all ship in the first release. A phase may be split while it is being planned (32-SS5 is the largest) only by renumbering later SS identifiers that nothing cites yet.
- **PD-118 — Hub provisioning creates SaveSphere's storage and services.** Designating a machine as a Hub (installing the Hub and running its setup) runs a provisioning wizard. The wizard creates, and the Hub then supervises, every storage tier and service SaveSphere needs, all embedded in the Hub and on its local disks:
  - SQLite in WAL mode: the existing canonical database plus a SaveSphere content store;
  - SQLite FTS5 full-text indexes and a vector index for semantic search;
  - a content-addressed blob store (SHA-256 keyed, deduplicated) for originals, attachments and derived files;
  - a bounded cache directory (previews, thumbnails, transcoding scratch);
  - a durable job queue with a worker pool for extraction, OCR, transcription, embedding, import, mirror and backup work.

  The blob store sits behind a pluggable `BlobStore` interface, so an S3-compatible bucket (Cloudflare R2, Backblaze B2, MinIO) can be added later as a mirror or storage tier without changing callers. No Docker, PostgreSQL, Redis or other external service is required. Provisioning is re-runnable and reports the status of each component, and an existing Hub upgraded into SaveSphere is provisioned the same way.
- **PD-119 — One host on the owner's bare domain, routed by path.** The Hub serves everything from the owner's bare domain (for example `https://abdulssavesphere.com`), with no `app.` or other prefix. `www.<domain>` redirects to the bare domain. Routes are paths:
  - `/` is DUDE Home;
  - `/savesphere/…` is SaveSphere;
  - `/tools/<id>` are the tools;
  - `/search`, `/ai`, `/settings` and `/admin`;
  - the existing `/api/v1/…`.

  The capture API is a path on the same host (`/api/v1/ingest/…`). It accepts scoped ingest tokens only, never cookies, and has its own rate limits. Email capture uses `save@<domain>`. This supersedes the earlier planning assumption of separate `app.<domain>` and `ingest.<domain>` hostnames. The installer and wizard are generic: any domain, any Google account, and an OAuth client the owner brings.
- **PD-120 — Ingress: a DUDE-managed Cloudflare Tunnel by default, with direct Public mode as the alternative.**
  - **Tunnel.** By default the Hub creates and supervises a Cloudflare Tunnel (`cloudflared`) for the owner's domain. `cloudflared` is the first child process the Hub supervises; it is started, restarted, health-checked and shown on the jobs and diagnostics views. The tunnel is remotely managed: the owner pastes its connector token, and its ingress rules and `originRequest` settings live in the Cloudflare dashboard, not on the Hub ([PD-142](PHASE32SS1_PLAN.md)). It is set up as the existing reverse-proxy mode with a trusted loopback hop, so it passes the same public readiness gate as any other exposure, with a tunnel-aware blocker set in place of the firewall-rule and inbound-bind blockers. There are no "proxy pins" for Cloudflare's edge certificate, which DUDE does not control: devices verify the tunnel domain against the public CA chain, and only the loopback hop is pinned ([PD-143](PHASE32SS1_PLAN.md)).
  - **Direct Public mode.** The 31F mode (built-in ACME and a firewall rule) remains the alternative for an owner who doesn't want a third party in the data path. It uses the same gate.
  - **Disclosure.** Setup must say plainly that Cloudflare terminates TLS at its edge and can read the traffic, and that direct Public mode avoids this.
  - **Credentials.** The tunnel connector token is stored as a Hub secret (DPAPI) and never logged or put on a command line. There is no Cloudflare API token. PD-064 stands: the Hub never stores a DNS-provider credential, and the tunnel hostname's DNS routing is the owner's dashboard action.
- **PD-121 — Google sign-in is the primary owner sign-in (amends PD-027).**
  - **Google sign-in.** The Hub signs the owner in with Google OIDC (authorization code with PKCE, using the owner's own OAuth client). A Google identity is bound to the existing owner by its stable subject (`sub`) only after an already-signed-in round-trip. The owner may link several of their own Google accounts. Linking needs step-up, the last linked account cannot be unlinked, and a sign-in from any other Google account is refused and audited.
  - **Fallback.** The Argon2id password and the recovery codes remain as the fallback, and step-up accepts either method.
  - **No hard dependency.** The Hub must remain fully operable with Google unreachable or the OIDC client removed.
  - **What stays the same.** There is still one owner (guests arrive in 32-SS6 under PD-139), and the setup-token bootstrap and every credential class from 31C are unchanged.
- **PD-122 — The whole domain is behind sign-in; GitHub Pages stays anonymous.** Every page and API on the owner's domain requires an owner (or, from 32-SS6, guest) session, the developer tools included, with this precise rule ([PD-144](PHASE32SS1_PLAN.md)): static assets stay public (the sign-in page, service worker, cached offline shell and Hub-offline page must load before a session exists, and hold no owner data); every API, websocket and admin route requires a session except a documented allowlist (sign-in, recovery, the OIDC callback, the `hello` endpoint, the token-only ingest path and public share links, PD-139); and the SPA `hubSessionGuard` keeps tool pages behind sign-in. An enumerate-and-probe spec enforces the allowlist. The GitHub Pages companion remains the anonymous, Hub-less build of the browser-safe tools (PD-007 stands).
- **PD-123 — Availability: the Hub stays on the owner's PC; downtime is accepted and mitigated.** The reference Hub is the owner's Windows PC, running as the existing Windows service. When that PC is off, asleep or rebooting, the domain is unreachable. Mitigations:
  - the Hub detects the power and sleep policy and offers a two-step, elevated, revertible change, and re-checks on start ([PD-152](PHASE32SS1_PLAN.md));
  - desktop and Android keep working from their local replicas (PD-126);
  - the PWA keeps its read cache and capture queue;
  - a browser or PWA that has loaded the site before shows a "Hub offline" page, a precached public asset used as the service worker's navigation fallback (a first-time visitor sees the ingress provider's error page, since nothing the owner runs is online);
  - a warm-standby DUDE device pulls encrypted backups under a per-device grant (PD-124, [PD-151](PHASE32SS1_PLAN.md)) and is promoted manually using the 31G transfer.

  Automatic failover, clustering and a hosted fallback remain out of scope (Phase 96 and [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries)).
- **PD-124 — Backup v2 streams, has no size cap and covers the blob store.** The 31G `.dudebackup` format is kept as a concept, but backups become streaming and chunked. The 512 MiB plaintext ceiling and the 32-file limit are removed, and blob-store content is included, deduplicated against earlier backups so they stay incremental. Destinations:
  - a local or second drive;
  - an S3-compatible bucket (B2, S3, R2);
  - another DUDE device acting as a warm standby, which pulls the encrypted backup under a per-device grant and is promoted by hand;
  - Google Drive or OneDrive.

  The key model stays DUDE's backup passphrase; no separate offline key is introduced. Every backup is verified when it is written and counts only after that. Retention defaults to 7 daily, 4 weekly and 6 monthly backups, pruned by a two-step confirm. A restore drill runs monthly, and a backup is overdue at twice its interval; an overdue or failed backup raises a Hub notification (PD-109). Local, S3-compatible and standby destinations close the 32-SS1 gate; Google Drive (built at Milestone 856, after the gate closed) and OneDrive (Milestone 857) are the last two milestones and may slip to a named follow-up without blocking it. An S3 blob mirror or tier is not part of this decision. Details: [PD-150](PHASE32SS1_PLAN.md), [PD-151](PHASE32SS1_PLAN.md).
- **PD-125 — SaveSphere is a shell destination, and Home gets SaveSphere panels.** SaveSphere is shell exception **#15**, a top-level destination at `/savesphere`, the same kind of thing as Settings and Insights. It is not a registry tool and adds no tool category: the eight categories stay closed. `/` stays DUDE Home, which gains SaveSphere Home panels (quick capture, inbox count, a resurfaced item and due reminders). A quick-capture command and SaveSphere search are added to the command palette.
- **PD-126 — Offline tiers.** The Electron desktop and the Android app each keep a full local SaveSphere replica: metadata, documents, and the attachments within a configurable budget, with the rest fetched on demand. Edits go into a durable outbox and merge through Yjs. The web PWA gets a capture queue plus a read cache of recent and pinned items only. Editing on the web needs the Hub. Captures never fail just because the device is offline.
- **PD-127 — Platforms and the office computer.**
  - **Windows desktop.** Electron on Windows is the desktop client.
  - **Android phone and tablet.** The existing DUDE Expo app, extended with native Kotlin Expo modules for S Pen ink (`androidx.ink`), the share target, document scanning and PDF.
  - **Linux laptop.** Uses the PWA until Phase 39 delivers the Linux desktop. Until then it gets neither the Markdown mirror nor watched folders.
  - **Employer-managed office computer.** Defaults to the web portal, with content captured manually or by forwarding.
  - **Employer Microsoft 365.** Installing the desktop app at the office, and connecting the employer's tenant through Microsoft Graph (Teams self-chat, Outlook), is an opt-in mode for when the employer permits it. It is never assumed.
- **PD-128 — Domain model.** Every SaveSphere entry is an item with a stable ID, and types and properties are data rather than hard-coded schema:
  - **Types and properties.** Built-in types (note, document, file, bookmark, task, journal entry, flashcard, person, event, and others) and owner-defined types, each with typed properties.
  - **Views.** Saved database views: table, list, kanban, calendar and gallery.
  - **Organization.** Notebooks and collections, which hold items by reference, so one item can appear in several. Tags.
  - **Links.** Typed links, `[[wikilinks]]`, backlinks and a graph view.
  - **Tasks and reminders.** Due dates, recurrence, and Today and Upcoming views.
  - **Journal.** Daily and weekly entries made from templates.
  - **Flashcards.** FSRS scheduling, with Anki import and export.
  - **Block IDs.** Rich documents carry a stable ID on every block, so links, citations and merges point at blocks.
- **PD-129 — Editing surfaces.**
  - **Rich text.** Tiptap/ProseMirror bound to Yjs.
  - **Handwriting.** Vector ink with pressure and tilt, on the Galaxy S25 Ultra, a Samsung S Pen tablet and a Windows pen. Every other surface shows ink read-only.
  - **Mixed notes.** Handwriting and typed blocks can sit in the same note.
  - **PDF annotation.** Highlights, ink and comments are stored as a separate layer. The original PDF is never modified; "export annotated copy" writes a new file.
  - **Canvas.** Infinite canvases with ink, text, shapes, images and live cards that reference existing items rather than copying them.
- **PD-130 — Tiered version history; originals kept for good.**
  - **Versions.** Every saved version of an item is kept for 90 days. After that, versions thin to one per day, then one per month. The exact tier boundaries are set when 32-SS2 is planned, and the owner can change them.
  - **Originals.** Original captured files and imported originals are never thinned or replaced; derived text (OCR, transcripts, summaries) sits alongside them.
  - **Trash and purge.** Deleted items stay in the trash for 30 days. Permanent purge is previewed and needs step-up.
  - **Restore.** Restoring a version applies it as a new forward edit.
- **PD-131 — Capture channels.**
  - quick capture from the shell, the command palette, an Android widget and a Quick Settings tile;
  - the Android share sheet ("Share → DUDE");
  - the PWA share target;
  - the ingest API with scoped tokens;
  - forwarding mail to `save@<domain>`;
  - Gmail through OAuth;
  - Outlook/Microsoft 365 through Graph (a personal account, or an employer tenant only under PD-127);
  - IMAP;
  - watched folders on each desktop;
  - drag-and-drop and file upload.

  Video saves (Instagram, TikTok, others) store the link plus metadata by default. A per-item "Archive original" toggle downloads the media where that is technically and legally possible. Every capture carries an idempotency key, so a retry never duplicates it, and records its source, device and time.
- **PD-132 — Official channels only for messaging and social sources; one-time imports.**
  - **Messaging and social apps.** WhatsApp, Instagram and TikTok are captured only through the Android share sheet and their official data exports. There is no scraping, no unofficial or reverse-engineered API, no automation of the owner's accounts and no notification reading.
  - **Samsung Notes.** Imported from bulk PDF exports. Handwriting is kept visually and made searchable by OCR and handwriting recognition. A best-effort `.sdocx` vector parser is a later stretch item.
  - **Other importers.** Evernote (ENEX), OneNote (Microsoft Graph), the WhatsApp chat export, Teams (manual or forwarded, or Graph where PD-127 allows), Instagram and TikTok "download your data" archives, email archives (mbox, eml), and folders of files and Markdown.

  Every importer follows one framework: stage, preview, commit, record source IDs so a re-run never duplicates, keep the original archive, and produce a report. The per-source catalog is in [Capture and Import](../savesphere/CAPTURE_AND_IMPORT.md).
- **PD-133 — Portability: a live two-way Markdown mirror, external editors and open export.**
  - **Mirror.** A desktop can mirror SaveSphere into a folder the owner chooses, as Markdown files with front matter and the original attachments. The folder works with Obsidian and VS Code and syncs both ways: external edits come back as new versions, and conflicts produce conflict copies rather than overwriting anything. Mirror writes are filesystem mutations under a standing authorization the owner grants per folder, as required by the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract); the mirror never deletes outside its folder.
  - **External editors.** Any attachment can be opened in an external application (an ACTION_EDIT intent on Android, a watched temp copy on desktop), and the saved result comes back as a new version.
  - **Export.** A full export (Markdown, JSON for structure, and original files, with a checksummed manifest) is always available.
- **PD-134 — AI organization is gated by confidence.** When a capture arrives, AI proposes a title, type, tags, destination notebook or collection, and links to related items.
  - **Confident proposals** are applied automatically, recorded as an undoable revision authored by "AI".
  - **Less confident proposals** go to the inbox as suggestions to accept or reject.
  - **The owner's choices win.** An owner choice pins that field, and AI never changes a pinned field again.
  - **Hard limits.** AI never deletes, merges, or rewrites the owner's own text.
- **PD-135 — A pluggable AI provider, with the provider choice deferred.** AI runs on the Hub through a provider interface with separate slots for chat/reasoning, embeddings, vision/OCR, handwriting recognition and transcription. Earlier planning recorded a cloud model as the default; **which providers to use, and whether embeddings, OCR and transcription run locally or in the cloud, is deliberately deferred to 32-SS5 planning.** Every AI task discloses what it sends and to which provider. The owner sets a spend cap, and usage is tracked. The vault is excluded unless the owner explicitly allows a specific item. SaveSphere stays usable, with search, capture and editing working, when no AI provider is configured.
- **PD-136 — Personal Knowledge Copilot.**
  - **Search.** Hybrid search (full-text plus vector, with link traversal) across titles, text, OCR, recognized handwriting, transcripts, PDF annotations and metadata.
  - **Questions with citations.** Answers name the source items and blocks. A citation is checked against what was actually retrieved, and an unverifiable citation is dropped.
  - **Summaries** of an item, a notebook, or a search result.
  - **Related items and suggested links.**
  - **Resurfacing** of forgotten but relevant items.

  Captured content is always passed to models as delimited data, never as instructions, and the Copilot has no tools that write, fetch, send or open the vault.
- **PD-137 — Where reminders and resurfacing are delivered.** Due reminders, resurfaced items and digests reach the owner through:
  - a SaveSphere panel on DUDE Home and the existing shell bell (PD-111);
  - Android push notifications;
  - a daily or weekly email digest;
  - Windows desktop notifications, through the 31J path (PD-110).

  The Android push transport (Firebase Cloud Messaging only as an optional transport, with background polling as the fallback) and the outbound email path (Gmail API send with the owner's grant, or SMTP) are decided when 32-SS5 is planned. Notification payloads carry no item content.
- **PD-138 — The vault.** The vault holds sensitive notes and files, plus structured credentials, ID documents and similar records with copy-to-clipboard.
  - **Encryption.** It is encrypted at rest on the server with its own key, which is separate from the backup passphrase and from the canonical database. Opening it needs step-up, and it locks again when idle.
  - **What it is not.** It is not a browser-autofill password manager.
  - **What can't reach it.** Its content is excluded from AI, OCR-to-index, the Markdown mirror, export (unless the owner explicitly includes it), ingest tokens and sharing.
  - **No end-to-end encryption here.** End-to-end encrypted sync remains Phase 82.
- **PD-139 — Sharing comes in 32-SS6, and the owner stays sole admin.**
  - **Guests.** Named Google accounts can be invited as guest principals with view, comment or edit access to the notebooks or items the owner selects.
  - **Public links.** Read-only, expiring and revocable.
  - **Limits.** Guests never see the vault, AI settings, devices, tools state or admin pages, and they cannot invite others. Every grant, link and access is audited.
  - **Roadmap effect.** This delivers named participants for SaveSphere content ahead of Phase 53. Phase 53 keeps general participants and guest permissions for the rest of DUDE.
- **PD-140 — How scope grows, and what is out of scope.** More capabilities are expected to come up. Each one enters scope only through a dated decision added to this document and the roadmap, never by being implied in a phase description. Out of scope unless a later dated decision reverses it:
  - a browser-autofill password manager;
  - full multi-tenant or family spaces (other people with their own SaveSphere on the Hub);
  - scraping, unofficial APIs, account automation or notification reading for any source;
  - automatic Hub failover or a hosted read-only fallback;
  - iOS and macOS clients;
  - a Linux desktop before Phase 39;
  - any DUDE-operated hosted service;
  - a requirement for PostgreSQL, Docker or another external database;
  - AI that deletes, merges or rewrites the owner's text;
  - an importer from the discarded SaveSphere codebase.

## Dated scope entries (PD-140)

Each entry adds scope only as written; it does not widen anything else.

### 2026-10-27 (Milestone 829): Phase 32-SS1 scope additions

Recorded as [PD-141–PD-154](PHASE32SS1_PLAN.md). The additions to scope that PD-118–PD-124 did not state are:

- **Public-CA trust mode** for the Device Agent, the desktop and the Android Kotlin Hub client, limited to the owner's configured tunnel domain. It is a new way for devices to verify a Hub endpoint beside SPKI pinning, and it ships in 32-SS1 with emulator acceptance (PD-143). It does not apply to LAN, private or direct Public mode, which keep their pins.
- **Warm-standby pull grant.** A per-device, step-up, audited grant lets a paired desktop pull encrypted backup chunks over a device-token streaming route. This is the first device-token route that reads backup bytes; it opens nothing else, and the standby cannot decrypt without the passphrase (PD-151).
- **Power policy change.** An elevated, two-step, revertible change to the machine's sleep and hibernate settings, with a `ConsequenceClass` and a confirmation-boundary spec (PD-152). It is the first Hub action that edits an operating-system power setting.
- **Ingest-token scrub and reissue.** The scaffold token class is removed from a restored database and must be reissued, closing the open question about tokens surviving a restore (PD-149).
- **The Hub-offline page** as a precached public asset used as the service worker's navigation fallback, and an explicit route-gating allowlist enforced by an enumerate-and-probe spec (PD-144).
- **A Hub-internal durable job queue** that runs only Hub-internal work; owner- or device-initiated privileged execution remains Phase 88 (PD-147).

Out of scope still: a Cloudflare API token or any DNS-provider credential (PD-064), a hosted Hub-offline page, automatic failover, and an S3 blob mirror or tier.

## Phase map

| Phase | Delivers | Decisions |
|---|---|---|
| [32-SS1](ROADMAP.md#phase-32-ss1) Hub Platform | Provisioning wizard and embedded storage/services, Google sign-in with linked accounts, bare-domain hosting and the `www` redirect, managed Cloudflare Tunnel, sign-in gating for the whole domain, resumable chunked uploads, durable job queue, backup v2, the cached Hub-offline state | PD-118–PD-124; refined by [PD-141–PD-154](PHASE32SS1_PLAN.md) |
| [32-SS2](ROADMAP.md#phase-32-ss2) Notes Core | Item model, notebooks, collections, tags, links and backlinks, rich-text editor on Yjs, attachments, tiered history and trash, full-text search, the vault, desktop and Android replicas, web read cache, export, the SaveSphere destination and Home panels | PD-125, PD-126, PD-128–PD-130, PD-133 (export), PD-138 |
| [32-SS3](ROADMAP.md#phase-32-ss3) Capture and Inbox | Every capture channel, the import framework and importers, inbox triage, dedupe, the SSRF-safe link/metadata fetcher, video archive toggle, watched folders, the Markdown mirror, the external-editor round-trip | PD-127, PD-131–PD-133 |
| [32-SS4](ROADMAP.md#phase-32-ss4) Ink and PDF | `androidx.ink` and Windows pen ink, hybrid ink and text, PDF viewer and annotation layer, document scanner, infinite canvas, handwriting recognition for search, the Samsung Notes PDF fidelity pass | PD-129, PD-132 |
| [32-SS5](ROADMAP.md#phase-32-ss5) Structure and Copilot | Types, properties and database views, tasks and reminders, graph, journal, flashcards, AI provider and processing pipeline, confidence-gated organization, Copilot, resurfacing, notification channels; **first SaveSphere release gate** | PD-128, PD-134–PD-137 |
| [32-SS6](ROADMAP.md#phase-32-ss6) Sharing | Guest principals and public read-only links | PD-139 |

## Open items decided when each phase is planned

These are deliberately unresolved; the docs must not present any of them as decided:

- AI providers, and local versus cloud processing for embeddings, OCR and transcription (32-SS5, PD-135);
- OCR, handwriting-recognition and transcription engines, each chosen by the first phase that needs it (32-SS3 to 32-SS5), and the vector-index library (32-SS1 provisions the schema slot and proves a pinned `sqlite-vec` loads inside the Hub executable, PD-147; 32-SS5 fills the index and confirms the library);
- the canvas engine, judged on license and stylus support (32-SS4);
- the Android push transport and the outbound email path (32-SS5, PD-137);
- the exact version-history tiers (32-SS2, PD-130);
- whether and when to add an S3-compatible blob tier (deferred past 32-SS1, PD-118, PD-148; S3 is a backup destination only in 32-SS1);
- the `.sdocx` parser (a stretch item after 32-SS4, PD-132);
- the release label for the first SaveSphere release (at the 32-SS5 gate).

## As-built constraints the phases must resolve

These facts about the delivered system conflict with the decisions above. The rows resolved in 32-SS1 (the queue, backups, Google sign-in, the tunnel and public-CA trust, the secret store and the upload parser) were built in Milestones 829–855 and are recorded in the [SS1 as-built summary](PHASE32SS1_PLAN.md#ss1-as-built-summary); the "Constraint today" column keeps the pre-32-SS1 wording as the historical record. Each must be resolved, by a recorded decision or amendment, when the named phase is planned; none of them may be bypassed silently.

| Constraint today | Where it is recorded | Conflicts with | Resolved in |
|---|---|---|---|
| The Hub supervises no child process; background work is in-process timers with read-only status and no queue (PD-112) | [hub AGENTS](../../apps/hub/AGENTS.md), [DATA_SYNC: notifications and job status](../architecture/DATA_SYNC_ARCHITECTURE.md#notifications-and-job-status-data) | PD-118 job queue, PD-120 `cloudflared` | 32-SS1 (PD-147). The queue runs Hub-internal work only; owner- or device-initiated privileged execution stays Phase 88 |
| Backups hold files as whole buffers under a 512 MiB plaintext and 32-file ceiling, covering the database and `hub.json` only | [SECURITY: As built in Phase 31G](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31g-backup-restore-and-transfer) | PD-124 | 32-SS1 (PD-150: backup v2 format and engine) |
| The owner signs in only by password and recovery codes; PD-027 said "No external OAuth" | [PD-027](../history/DECISION_LOG.md#phase-31c-implementation-decisions) (amended 2026-10-25) | PD-121 | 32-SS1 |
| Hub web shared writes are online-only, and nothing authenticated is stored in the browser beyond the session (PD-053) | [DATA_SYNC: As built in Phase 31E](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31e-hub-web-shared-state) | PD-126 PWA capture queue and read cache | 32-SS2 (read cache) and 32-SS3 (capture queue), by an amendment to PD-053 limited to SaveSphere and wiped at sign-out |
| Yjs is approved only for the three 31J surfaces (PD-099); `@dude/collab-doc` may be imported only by the Hub and web, is forbidden on Android, and the Device Agent carries no Yjs | [DATA_SYNC: As built in Phase 31J](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31j-collaborative-documents-and-realtime-depth), [Portable Core](../architecture/PORTABLE_CORE.md), [packages AGENTS](../../packages/AGENTS.md) | PD-126 and PD-129 (Yjs documents on desktop and Android replicas, including offline edits) | 32-SS2. Decide which package holds the SaveSphere document mapping and whether Android may import it, and how the desktop replica keeps offline Yjs state (for example as opaque update bytes the Agent stores without importing Yjs) |
| Records are capped at 128 KiB, and a push at 100 operations and 512 KiB (`SYNC_LIMITS`) | [DATA_SYNC: As built in Phase 31D](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31d-synchronization) | Rich documents and attachments | 32-SS2. Documents use the Yjs channel and attachments the blob channel; metadata records stay within the limits |
| The Android share target reads `content:` URIs into memory under a 2 MiB cap and never persists or synchronizes a shared payload | [SECURITY: As built in Phase 31I](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31i-android-tool-permissions-and-input-boundaries) | PD-131 share-to-SaveSphere captures | 32-SS3. A separate, explicit SaveSphere capture path; the tool path keeps its rule |
| The Android manifest strips media and storage permissions, and Android sync is foreground-only with no background work (PD-096) | [SECURITY: As built in Phase 31I](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31i-android-tool-permissions-and-input-boundaries), [Phase 31I plan](PHASE31I_PLAN.md) | PD-126 replicas, PD-131 widget and tile, PD-137 push | 32-SS2 to 32-SS5. Each new permission or background mode is recorded as a security decision |
| The public readiness gate's `public-firewall-rule` blocker applies even in reverse-proxy mode, and device pins assume a certificate the operator controls | `apps/hub/src/diagnostics/readiness.ts`, [SECURITY: As built in Phase 31E](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31e-trust-and-exposure) | PD-120 tunnel (no inbound port; Cloudflare rotates its edge certificate) | 32-SS1 (PD-143). A tunnel-aware readiness check set, and public-CA trust for the tunnel domain with only the loopback hop pinned, instead of pinning an edge certificate DUDE doesn't control |
| The Hub has no general secret store; each machine-bound secret (CA key, ACME key, schedule key) is DPAPI-protected on its own and never included in a backup | [SECURITY: As built in Phase 31G](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31g-backup-restore-and-transfer) | PD-120 tunnel credential, PD-121 OIDC client secret, PD-124 destination credentials, PD-135 provider keys, PD-138 vault key | 32-SS1 (PD-142: the `secrets/` module; re-entry after restore) and 32-SS2. The vault key must have a recovery path, or a restore onto another machine cannot open the vault |
| The Hub accepts JSON bodies only, with a 64 KiB default limit (512 KiB on sync and web pushes) | `apps/hub/src/server/create-server.ts` | PD-118 resumable chunked uploads, PD-131 file capture | 32-SS1 (PD-148, as built in Milestone 845). A streaming upload route family with its own parser and limits |
| Phase 29 file watching runs in Electron main only while DUDE is running; the Device Agent performs no file operations | `apps/desktop/fs-watch-service.ts`, [Phase 29](../history/DELIVERY_HISTORY.md#phase-29) | PD-131 watched folders, PD-133 mirror | 32-SS3. Accept "only while DUDE runs (window or tray)", or decide to widen the Agent's role |
| The Android app holds a device credential only, with no owner session | [SECURITY: As built in Phase 31H](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31h-android-identity-and-recovery) | PD-138 vault unlock and PD-130 purge on Android (step-up needs an owner session) | 32-SS2 |
| The desktop ships for Windows only (NSIS) | [Phase 39](ROADMAP.md#phase-39) | The Linux laptop | Accepted: the PWA until Phase 39 (PD-127) |
| `data-scope-entities.json` accepts only entities whose source file exists | `scripts/data-scope-inventory.mjs` | Documenting planned entities | Each phase adds its entities with its code |

## Deviations and implementation notes

Each phase records its milestone map and deviations in its own plan document ([Phase 32-SS1](PHASE32SS1_PLAN.md#deviations-and-implementation-notes)); program-level amendments are dated here.

### 2026-10-27, Milestone 829: wording amended for Phase 32-SS1

PD-120 (no "proxy pins" for the tunnel; remotely managed tunnel; connector token only), PD-122 (static assets public, API, websocket and admin routes gated, SPA guard for tool pages), PD-123 (two-step power policy change, Hub-offline page as a precached fallback, standby pull) and PD-124 (retention, verify-on-write, monthly drill, overdue at 2x, standby pull, Drive and OneDrive cut line) were reworded in place, PD-064 was clarified in the decision log, and the as-built constraints table now names the resolving decision. The decisions are PD-141–PD-154 in [Phase 32-SS1 decisions](PHASE32SS1_PLAN.md). The scope additions are the dated entry below.
