# SaveSphere Capture and Import

Status: planned. No SaveSphere capture channel or importer exists yet. Capture channels, the import framework and the importers ship in [Phase 32-SS3](../delivery/ROADMAP.md#phase-32-ss3); the Samsung Notes fidelity pass ships in [Phase 32-SS4](../delivery/ROADMAP.md#phase-32-ss4). Nothing in this document is an as-built claim except where it names an existing DUDE foundation.

Read [the master PRD](../DUDE_PRD.md) first. The [SaveSphere program decisions](../delivery/PHASE32SS_PLAN.md) (PD-116 to PD-140) govern this document; where the two differ, the decisions win. This document covers how content gets into SaveSphere: the capture channels, the per-source paths for the owner's existing data, the shared import framework, deduplication, and the security rules for everything that arrives from outside.

Related: [SaveSphere documentation](README.md), [SaveSphere product specification](SAVESPHERE_PRODUCT_SPEC.md), [SaveSphere architecture](SAVESPHERE_ARCHITECTURE.md), [SaveSphere program decisions](../delivery/PHASE32SS_PLAN.md).

## Contents

- [Principles](#principles)
- [Capture channels](#capture-channels)
- [Per-source catalog](#per-source-catalog)
- [The import framework](#the-import-framework)
- [Deduplication](#deduplication)
- [Inbox and triage](#inbox-and-triage)
- [Portability channels out](#portability-channels-out)
- [Security notes for capture](#security-notes-for-capture)

## Principles

- **Capture never blocks and never fails because a device is offline.** Every client writes a capture to a durable local queue first and uploads it later ([PD-126](../delivery/PHASE32SS_PLAN.md)): the desktop and Android replicas through their outbox, the web PWA through its capture queue. The same applies when the device is online but the Hub is down ([PD-123](../delivery/PHASE32SS_PLAN.md)). Each queued capture shows its state: saved on the device, waiting to upload, saved to the Hub, or failed with a reason.
- **Every capture carries an idempotency key.** The client generates the key when the capture is made and keeps it across every retry, so a repeated upload never creates a second item ([PD-131](../delivery/PHASE32SS_PLAN.md)). Server-side channels (mail polling, watched folders, importers) derive the key from a stable source identifier instead.
- **Provenance is recorded.** Every capture records its channel, the device or account it came from, the time it was made on the client and the time the Hub received it, and the source URL or source identifier where one exists.
- **Originals are kept.** The captured file, message or archive is stored unchanged in the content-addressed blob store ([PD-118](../delivery/PHASE32SS_PLAN.md)). Extracted text, OCR, recognized handwriting, transcripts and thumbnails sit alongside it and never replace it ([PD-130](../delivery/PHASE32SS_PLAN.md)).
- **Official channels only.** Messaging and social sources are reached only through the Android share sheet and the services' own data exports ([PD-132](../delivery/PHASE32SS_PLAN.md)). SaveSphere never scrapes, never uses unofficial or reverse-engineered APIs, never automates the owner's accounts and never reads notifications ([PD-140](../delivery/PHASE32SS_PLAN.md)). Mail and Microsoft sources use their documented APIs with the owner's own grant.
- **Captures land in the inbox.** A new capture goes to the inbox unless AI organization is confident enough to file it, in which case the filing is an undoable revision authored by "AI" ([PD-134](../delivery/PHASE32SS_PLAN.md)). With no AI provider configured, everything goes to the inbox ([PD-135](../delivery/PHASE32SS_PLAN.md)).
- **The vault is never an automatic destination.** No automatic channel (ingest token, mail polling, watched folder, importer, AI filing) writes into the vault. Content reaches the vault only when the owner explicitly files it there from an unlocked session ([PD-138](../delivery/PHASE32SS_PLAN.md)).

## Capture channels

The channel list is fixed by [PD-131](../delivery/PHASE32SS_PLAN.md). Two DUDE foundations already exist and are extended rather than replaced:

- **The Android share target.** The `dude-share` Expo module (`apps/mobile/modules/dude-share`) receives `ACTION_SEND` intents, reads `content:` URIs through the temporary grant that comes with the intent, keeps only the most recent share in memory, never persists it, and is used today with a 2 MiB input cap for DUDE tools. SaveSphere needs a different path on top of it: shared content of any size, copied into the durable capture queue before the share activity returns, with multi-item shares (`ACTION_SEND_MULTIPLE`) added.
- **Desktop folder watching.** Phase 29 shipped remembered-folder grants, recursive watching, event coalescing, root-level exclusions and a change timeline in the `watched-folders` tool ([Delivery History, Phase 29](../history/DELIVERY_HISTORY.md#phase-29)). SaveSphere watched folders reuse this infrastructure; rule-driven automation stays in [Phase 40](../delivery/ROADMAP.md#phase-40).

| Channel | Surfaces | Mechanism | Authentication | Limits and notes | Phase |
|---|---|---|---|---|---|
| Quick capture | DUDE shell and command palette (desktop, web); Home panel; Android home-screen widget and Quick Settings tile | Minimal capture box for text, a link or a file; saved to the local queue at once | Existing owner session or device credential | No destination choice is required; the capture goes to the inbox | 32-SS3 |
| Android share sheet | Any Android app ("Share → DUDE") | Extended `dude-share` target; content copied into the durable queue, then uploaded | Device credential of the Android app | Text, URLs, images, files and multi-item shares; no size cap beyond device storage and Hub limits | 32-SS3 |
| PWA share target | Installed web PWA on platforms that support Web Share Target | Manifest `share_target`; the service worker writes the share to the web capture queue | Owner session | Availability depends on the browser and platform; the web build has no share target today | 32-SS3 |
| Drag-and-drop and file upload | Web, desktop, Android file picker | Resumable chunked uploads (built in 32-SS1) into the blob store | Owner session or device credential | Interrupted uploads resume; when the Cloudflare Tunnel is used, chunks stay under Cloudflare's per-request body limit | 32-SS3 |
| Ingest API | Scripts, automations, other tools | `/api/v1/ingest/…` on the owner's bare domain ([PD-119](../delivery/PHASE32SS_PLAN.md)); text, URL or file plus an idempotency key | Scoped ingest token in a bearer header only, never cookies | Own rate limits; narrow scopes, for example capture-only; contract-first like every Hub route (TypeBox schemas and a matching `@dude/api-client` method) | 32-SS3 |
| Forward to `save@<domain>` | Any mail client | Inbound mail parsed into a capture with body and attachments | Sender allowlist plus SPF/DKIM verification | The inbound transport is decided when 32-SS3 is planned; see [Inbound mail](#inbound-mail-transport) | 32-SS3 |
| Gmail | The owner's Gmail accounts | Gmail API through OAuth with the owner's own client; the owner picks labels or selected threads | OAuth grant, stored as a Hub secret | Read-only scope where it suffices; only the selected label or threads are read | 32-SS3 |
| Outlook and Microsoft 365 | Personal Microsoft account; employer tenant only under [PD-127](../delivery/PHASE32SS_PLAN.md) opt-in | Microsoft Graph mail (and Teams self-chat where permitted); the owner picks folders or categories | OAuth grant, stored as a Hub secret | An employer tenant is never connected by default; tenant policy can block consent | 32-SS3 |
| IMAP | Other mail providers | Polled mailbox folder chosen by the owner | Credentials or OAuth as the provider requires, stored as Hub secrets | Many providers now require OAuth or app passwords for IMAP | 32-SS3 |
| Watched folders | Each Windows desktop (Electron); Linux only after [Phase 39](../delivery/ROADMAP.md#phase-39); the office PC only in the PD-127 opt-in mode | Phase 29 watcher; new and changed files are captured from a folder the owner grants per device | Device credential | Read-only on the source folder: capture never moves, renames or deletes the owner's files | 32-SS3 |
| Link capture | Every channel that delivers a URL | URL stored at once; the Hub fetches title, description, site name, icon and preview image through the SSRF-safe fetcher | Inherits the capture's channel | Metadata is best effort; sites that require sign-in often return little to an anonymous fetch | 32-SS3 |
| Video links | Instagram, TikTok and other video sites | Link plus metadata by default; per-item "Archive original" downloads the media where that is technically and legally possible | Inherits the capture's channel | Archiving never signs in to the source or automates the owner's account; when it is not possible the item says so | 32-SS3 |

### Inbound mail transport

PD-119 fixes the address (`save@<domain>`) and PD-131 the channel; the transport is not decided and is chosen when 32-SS3 is planned. The candidates:

- **A push handoff,** for example Cloudflare Email Routing delivering to a small Email Worker that checks authentication results and posts the raw message to the ingest API with a dedicated token. This only works while the Hub is reachable, so the handoff must either retry or reject when the Hub is offline. The Worker would run in the owner's own Cloudflare account and would see the mail in transit, so it falls under the same disclosure rule as the tunnel ([PD-120](../delivery/PHASE32SS_PLAN.md)).
- **A polled mailbox,** where mail to `save@<domain>` is routed to a mailbox the Hub reads over IMAP or a mail API. Mail waits in the mailbox while the Hub is offline.

Whichever is chosen, the Hub itself re-checks the allowlist and authentication results before it creates a capture.

## Per-source catalog

Each subsection covers one of the owner's real sources. Third-party export formats change without notice; where this document describes what an export contains, the importer handles it where the export contains it and reports anything it could not map.

### Samsung Notes

- **Ongoing capture.** New handwriting is written in SaveSphere ink on the Galaxy S25 Ultra (32-SS4), not in Samsung Notes. A note still created in Samsung Notes can be shared to DUDE as a PDF through the share sheet.
- **Historical import.** Samsung Notes has no export API. The owner exports notes in bulk as PDF from the app and imports the files ([PD-132](../delivery/PHASE32SS_PLAN.md)).
- **Fidelity.** Each note becomes a document item with the PDF as its original. Handwriting is kept visually, exactly as it appears in the PDF; it is made searchable by OCR and handwriting recognition, not converted into editable ink. Typed text is indexed from the PDF text layer where the export has one.
- **Preserved.** Page appearance, the note title (where it survives as the file name), and the export file's timestamps. Original creation dates, folders and tags are kept only where the export carries them.
- **Limitations.** Ink is not editable after import; a best-effort `.sdocx` vector parser is a later stretch item, not a commitment ([PD-132](../delivery/PHASE32SS_PLAN.md)).
- **Phase.** PDF import in 32-SS3; the fidelity pass (handwriting recognition for search, page rendering checks against the owner's real exports) in 32-SS4.

### Evernote

- **Ongoing capture.** None; SaveSphere replaces Evernote for new notes.
- **Historical import.** ENEX files exported from Evernote, one or more per notebook.
- **Fidelity.** ENML note bodies are converted to SaveSphere rich text. Resources (images, PDFs, other files) become attachments placed where the note referenced them. Content that has no rich-text equivalent is kept as an attachment or flagged in the report.
- **Preserved.** Title, tags, created and updated times, source URL and other note attributes where the export contains them; the notebook, mapped from the export file the owner chose.
- **Limitations.** Anything Evernote leaves out of ENEX (for example, some newer note features) cannot be imported.
- **Phase.** 32-SS3.

### OneNote

- **Ongoing capture.** None; SaveSphere replaces OneNote.
- **Historical import.** Microsoft Graph, with the owner's grant to the personal account that holds the old school notebooks. Notebooks the Graph API cannot reach (for example, ones stored only on a local disk) must first be moved to the owner's OneDrive.
- **Fidelity.** Notebooks map to SaveSphere notebooks, and sections and section groups map to collections. Page HTML is converted to rich text; embedded images and files become attachments.
- **Preserved.** Page titles, created and modified times, section hierarchy, and ink as far as Graph returns it. Ink fidelity depends on what Graph exposes for each page: where it returns ink data it is kept as a source attachment and the page is also kept visually; where it does not, the import report says so.
- **Limitations.** Graph throttling and page-content limits make large notebooks slow; the import is resumable and reports pages it could not fetch.
- **Phase.** 32-SS3.

### WhatsApp

- **Ongoing capture.** The owner's single-participant group is used as a "messages to self" channel. Items are saved from it through the Android share sheet (sharing a message, link or media item to DUDE), or by copying text into quick capture. There is no WhatsApp API for personal messages, and SaveSphere never reads notifications ([PD-132](../delivery/PHASE32SS_PLAN.md)).
- **Historical import.** WhatsApp's own chat export: the message text file, with or without the media files, shared to DUDE or uploaded as a zip.
- **Fidelity.** One conversation item per export, with each message (time, sender, text) as structured content and media as attachments linked to their messages. Links found in messages are also captured as link items for dedupe and search.
- **Preserved.** Message order, timestamps, sender names, and media included in the export.
- **Limitations.** The export is per chat, its date and time format depends on the phone's locale, and WhatsApp limits how many recent messages one export includes (fewer when media is included). Older messages beyond that limit are not recoverable through this path.
- **Phase.** 32-SS3.

### Microsoft Teams

- **Ongoing capture (default).** Copy a message into quick capture, share it, or forward it by mail to `save@<domain>`. This is the default on the employer-managed office PC ([PD-127](../delivery/PHASE32SS_PLAN.md)).
- **Ongoing capture (opt-in).** Where the employer permits it, the owner connects the employer tenant through Graph and SaveSphere reads the owner's self-chat. This mode is never assumed, and tenant consent policy can block it.
- **Historical import.** A personal Teams data export, where Microsoft offers one for the account, imported as conversation items with shared files as attachments.
- **Preserved.** Message text, timestamps and attachments where the source provides them.
- **Limitations.** Work accounts usually cannot export their own chats; for them, the forward/copy path and opt-in Graph are the only routes.
- **Phase.** 32-SS3.

### Instagram

- **Ongoing capture.** Reels and posts are shared from the Instagram app to DUDE through the share sheet. The owner's current habit (sending reels to a second Instagram account) can be replaced by sharing straight to DUDE. Each share becomes a link item with metadata; "Archive original" applies as described under [Capture channels](#capture-channels).
- **Historical import.** Instagram's "Download your information" archive, requested in JSON format where Instagram offers the choice. Saved posts become bookmark items, and the direct-message thread with the second account becomes a conversation item whose shared reels and posts are also captured as link items.
- **Preserved.** Links, captions, timestamps and included media where the archive contains them.
- **Limitations.** Instagram often returns little metadata to an anonymous fetch, so titles and thumbnails may be missing. The archive is prepared by Instagram asynchronously, and its download link expires.
- **Phase.** 32-SS3.

### TikTok

- **Ongoing capture.** "Share → DUDE" or "Copy link" followed by quick capture. Short links are resolved through the SSRF-safe fetcher and stored with their final URL.
- **Historical import.** TikTok's "Download your data" archive, requested in JSON format where TikTok offers the choice. Favorites and liked videos become bookmark items, tagged by list.
- **Preserved.** Video links and the dates they were saved, where the archive contains them.
- **Limitations.** As with Instagram, metadata is best effort and the archive is prepared asynchronously.
- **Phase.** 32-SS3.

### Email

- **Ongoing capture.** Forwarding to `save@<domain>`, Gmail labels or selected threads, Outlook/Microsoft 365 folders or categories through Graph, and IMAP folders, as listed under [Capture channels](#capture-channels).
- **Historical import.** `.mbox` archives (for example from Google Takeout) and `.eml` files ([PD-132](../delivery/PHASE32SS_PLAN.md)). Other archive formats are not in the decided importer list; mail in them can be reached through the API channels instead.
- **Fidelity.** Messages are grouped into threads. Each message keeps its headers, its text and sanitized HTML body, and its attachments as attachment items; the raw message is kept as the original.
- **Preserved.** Sender, recipients, subject, dates and message IDs (also used as source IDs), and thread structure.
- **Phase.** 32-SS3.

### Files and folders

- **Ongoing capture.** Watched folders on each desktop (see [Capture channels](#capture-channels)) and drag-and-drop or upload anywhere.
- **Historical import.** Bulk import of a folder or zip from any of the owner's desktops and laptops. The folder structure maps to collections; PDFs, Office documents, images and other files become file or document items with text extracted for search.
- **Markdown folders.** Front matter becomes properties, `[[wikilinks]]` and relative links become links, and referenced files become attachments, so a folder written by Obsidian or VS Code arrives connected.
- **Preserved.** File names, folder paths, modification times and content hashes.
- **Phase.** 32-SS3.

### Browser bookmarks and web pages

- **Historical import.** Netscape bookmark HTML, the export format of all major browsers. The folder hierarchy maps to collections, and each bookmark becomes a bookmark item whose metadata is fetched in the background.
- **Ongoing capture.** Page links arrive through the share sheet, quick capture and the ingest API. A browser clipper may later come with the [Phase 38 browser extension](../delivery/ROADMAP.md#phase-38); it is a roadmap item, not part of this program.
- **Phase.** 32-SS3.

## The import framework

Every importer uses one framework ([PD-132](../delivery/PHASE32SS_PLAN.md)). Nothing reaches the owner's knowledge base until the owner commits.

1. **Upload and stage.** The export archive or files are uploaded with resumable chunked uploads, or fetched through Graph for OneNote and Teams. An import record is created for this run.
2. **Parse in the background.** A job on the Hub's durable queue parses the source into a staging set of items, attachments, tags and links, with progress shown on the jobs view.
3. **Preview.** The owner sees counts by type, a sample of converted items, and warnings (unmapped content, missing attachments, unreadable entries) before anything is applied.
4. **Commit in batches.** Staged items are written through the normal write path, so they get versions, search indexing and processing like any other item. Batches let a large import make visible progress and resume after an interruption.
5. **Report.** The report lists what succeeded, what failed and why, and what was skipped.

Rules that apply to every importer:

- **Source IDs make re-runs safe.** Every item records its source identifier. Re-running an import skips unchanged items and applies changed ones as new versions, so earlier content stays in history ([PD-130](../delivery/PHASE32SS_PLAN.md)); it never creates duplicates.
- **The original archive is kept** as an attachment on the import record, so a later, better importer can re-read it.
- **Review collection and source tag.** Imported items carry a tag naming their source and are placed in a per-import review collection, in addition to any notebook or collection mapped from the source's own structure.
- **Resumable and cancellable.** An interrupted import resumes from its last committed batch. Cancelling during staging discards the staging set; cancelling during commit stops after the current batch and reports what was committed.
- **Nothing before commit.** Staging data is not searchable, not synced and not sent to AI until it is committed.

## Deduplication

- **Exact duplicates** are detected at capture and import time by content hash (the blob store's SHA-256), normalized URL (scheme and host case, fragments and known tracking parameters removed, short links resolved), and source ID. A repeated file is stored once in the blob store; the duplicate capture is shown with a duplicate warning in the inbox rather than silently dropped.
- **Near-duplicate suggestions** (the same article from two URLs, a reworded note, a re-exported PDF) come from AI in [Phase 32-SS5](../delivery/ROADMAP.md#phase-32-ss5) and appear as inbox suggestions.
- **Nothing is merged automatically.** AI never deletes or merges items ([PD-134](../delivery/PHASE32SS_PLAN.md)); the owner resolves every duplicate.

## Inbox and triage

The inbox holds every capture that has not been filed. It filters by source, content type and date, supports quick and bulk filing and tagging, and shows duplicate warnings and AI suggestions to accept or reject ([PD-134](../delivery/PHASE32SS_PLAN.md)). An owner's choice pins that field against later AI changes. The inbox count and quick capture also appear as SaveSphere panels on DUDE Home ([PD-125](../delivery/PHASE32SS_PLAN.md)). The [SaveSphere product specification](SAVESPHERE_PRODUCT_SPEC.md) has the full triage behavior.

## Portability channels out

Capture brings content in; two channels take it back out in open form ([PD-133](../delivery/PHASE32SS_PLAN.md)):

- **Markdown mirror.** A desktop can mirror SaveSphere into a folder the owner chooses, as Markdown with front matter plus the original attachments. Edits made in Obsidian or VS Code come back as new versions; conflicts produce conflict copies. Mirror writes run under a standing authorization the owner grants per folder, as required by the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract), and the mirror never deletes outside its folder. The Linux laptop gets no mirror before Phase 39 ([PD-127](../delivery/PHASE32SS_PLAN.md)). The mirror never contains vault content.
- **External-editor round-trip.** Any attachment can be opened in an external application (an `ACTION_EDIT` intent on Android, a watched temporary copy on the desktop), and the saved result returns as a new version.

The [SaveSphere architecture](SAVESPHERE_ARCHITECTURE.md) defines the mirror's file layout, change detection and conflict semantics. The full export is described in the [SaveSphere product specification](SAVESPHERE_PRODUCT_SPEC.md).

## Security notes for capture

- **Ingest tokens.** Stored hashed on the Hub and shown once at creation. Each has a name, scopes, an optional expiry and a last-used time, and can be revoked on its own. Tokens authenticate only through a bearer header on `/api/v1/ingest/…`, never through cookies, and have their own rate limits ([PD-119](../delivery/PHASE32SS_PLAN.md)). A token can never reach the vault or perform a step-up action ([PD-138](../delivery/PHASE32SS_PLAN.md)). Creation, use and revocation are audited, and the token is never logged.
- **Mail.** Only mail from the owner's allowlisted sender addresses is accepted, and it must pass SPF/DKIM verification. Everything else is dropped without becoming a capture, and rejections are counted and audited. Changes to the allowlist are audited.
- **Third-party grants.** Gmail, Graph and IMAP credentials are Hub secrets: never logged, never sent to clients, and revocable from settings. Each grant uses the narrowest scope that serves its channel.
- **SSRF-safe fetcher.** All server-side fetches of captured URLs go through one fetcher on the Hub:
  - only `http` and `https`;
  - DNS is resolved by the fetcher, and private, loopback, link-local, CGNAT (`100.64.0.0/10`), multicast, unspecified and cloud-metadata addresses (such as `169.254.169.254`) are blocked, including their IPv6 forms, IPv4-mapped IPv6 addresses and unique-local and link-local IPv6 ranges;
  - the connection goes to the checked IP, so a second DNS answer cannot swap the target (DNS-rebinding defense);
  - redirects are followed manually, and every hop is checked again;
  - response size, total time and redirect count are limited;
  - no cookies or credentials are sent, and every blocked fetch is audited.
- **Uploads.** File type is detected from content, not from the extension or the declared MIME type. Per-type and global size limits apply. Captured HTML is sanitized before it is stored or rendered, and user files are served as downloads or through generated previews, never as active content on the owner's origin.
- **Captured content is data.** Anything captured or imported may contain text written to manipulate an AI. It is always passed to models as delimited data, never as instructions, and the Copilot has no tool that writes, fetches, sends or opens the vault ([PD-136](../delivery/PHASE32SS_PLAN.md)). At most, injected text can produce a suggestion the owner rejects.
- **Employer data.** Employer content enters SaveSphere only through the owner's manual actions or the opt-in Graph mode the employer permits ([PD-127](../delivery/PHASE32SS_PLAN.md)).
