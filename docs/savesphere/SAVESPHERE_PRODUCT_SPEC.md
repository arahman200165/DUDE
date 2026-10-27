# SaveSphere Product Specification

This specification describes the planned behavior of SaveSphere, the owner's personal knowledge system inside DUDE. Nothing in it is implemented yet; it states what Phases 32-SS1 to 32-SS6 must deliver. The phase that delivers each capability is marked inline, for example "(32-SS3)".

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; the [SaveSphere program decisions](../delivery/PHASE32SS_PLAN.md) govern this program, and this document owns the detailed SaveSphere product contracts within them.

Related: [SaveSphere overview](README.md) · [Capture and Import](CAPTURE_AND_IMPORT.md) · [SaveSphere Architecture](SAVESPHERE_ARCHITECTURE.md) · [DUDE Product Specification](../product/PRODUCT_SPEC.md) · [DUDE UX Specification](../product/UX_SPEC.md) · [Roadmap: SaveSphere program](../delivery/ROADMAP.md#savesphere-program).

## Contents

- [Vision and principles](#vision-and-principles)
- [Target journeys](#target-journeys)
- [Surfaces and offline behavior](#surfaces-and-offline-behavior)
- [Domain model](#domain-model)
- [Editing](#editing)
- [Organization](#organization)
- [Search and the Personal Knowledge Copilot](#search-and-the-personal-knowledge-copilot)
- [Reminders and resurfacing delivery](#reminders-and-resurfacing-delivery)
- [Preservation, history and portability](#preservation-history-and-portability)
- [The vault](#the-vault)
- [Sharing](#sharing)
- [Scope ceilings](#scope-ceilings)
- [Acceptance themes](#acceptance-themes)

## Vision and principles

The owner's information is scattered across note apps, messaging apps, social saves, email and folders on several computers, and finding something means first remembering where it was put. SaveSphere SHALL be one place where anything the owner decides to keep is captured in seconds, preserved as it arrived, organized with little effort, connected to related material and found again without remembering its location. It is a part of DUDE, not a separate product: it uses the owner's Hub, identity, sync, backup, desktop app, Android app and design system ([PD-116](../delivery/PHASE32SS_PLAN.md)).

Principles:

- **One connected knowledge base.** Notes, documents, files, bookmarks, tasks, journal entries and flashcards are all items with stable IDs, properties, links and history. One item can appear in many notebooks, collections, views and canvases without being copied.
- **Preserve originals.** What the owner captured or imported is kept exactly as it arrived. Extracted text, OCR, transcripts and summaries are added beside the original and never replace it.
- **Capture in seconds.** Saving something never requires deciding where it belongs first. Filing happens later, in the inbox or automatically.
- **Find without remembering where.** Search covers everything SaveSphere knows about an item, including text recognized from images, handwriting and audio.
- **AI organizes; the owner overrides.** AI may file, title, tag and link captures on its own when it is confident, but every AI change is an undoable revision, and an owner choice is final ([PD-134](../delivery/PHASE32SS_PLAN.md)). SaveSphere remains fully usable with no AI configured ([PD-135](../delivery/PHASE32SS_PLAN.md)).
- **The data belongs to the owner and stays portable.** Content lives on the owner's Hub and devices, is backed up by DUDE's backup, and can always be exported or mirrored as open files ([PD-124](../delivery/PHASE32SS_PLAN.md), [PD-133](../delivery/PHASE32SS_PLAN.md)).
- **Private by default.** Everything on the owner's domain requires sign-in ([PD-122](../delivery/PHASE32SS_PLAN.md)). Nothing is visible to anyone else until the owner shares it (32-SS6).
- **Simple by default.** An ordinary note takes seconds to create. Types, properties, views and canvases stay out of the way until the owner wants them.

**Relation to DUDE's local-first principle.** DUDE's [Local first](../DUDE_PRD.md#local-first) principle is refined, not reversed: utility inputs in DUDE tools still stay local by default. Content the owner explicitly saves into SaveSphere is the consented exception, and that explicit save is the disclosure that the content goes to the owner's Hub ([Decision Log](../history/DECISION_LOG.md#savesphere-program-decision--2026-10-25)). Any further transmission (an AI provider, a cloud backup destination, the Cloudflare Tunnel) is separately disclosed and owner-chosen.

## Target journeys

1. **Capture from anywhere in seconds.** On the phone, the owner shares a page, photo, video link or message to DUDE from the Android share sheet and it is saved without further choices (32-SS3). On a Windows desktop, a quick-capture shortcut or command-palette entry opens a minimal capture box (32-SS2 for typed notes, 32-SS3 for every channel). From any computer, forwarding an email to `save@<domain>` saves it. Files dropped into a desktop watched folder are captured. A capture made offline is queued and never fails because the device is offline.
2. **Find anything.** The owner types a few words they remember into SaveSphere search or the command palette and gets matching items, including matches inside PDFs, images, handwriting and transcripts, with the matching passage highlighted (full-text from 32-SS2; recognized text as it arrives in 32-SS3 to 32-SS5). The owner can also ask the Copilot a question and get an answer that cites the items it came from (32-SS5).
3. **Daily note-taking.** SaveSphere replaces Samsung Notes, Evernote and OneNote: typed rich-text notes (32-SS2), handwritten and hybrid notes with the S Pen or a Windows pen, PDF annotation and infinite canvases (32-SS4).
4. **Import the past.** The owner imports Samsung Notes PDF exports, Evernote, OneNote, WhatsApp chat exports, Instagram and TikTok data archives, email archives and folders of files and Markdown. Each import is previewed, committed, reported, and safe to re-run without duplicates (32-SS3; per-source details in [Capture and Import](CAPTURE_AND_IMPORT.md)).
5. **Be reminded of forgotten things.** Due tasks and reminders reach the owner on Home, the shell bell, Android, Windows notifications and a digest email, and SaveSphere resurfaces forgotten but relevant items (32-SS5).
6. **Use it from every device the owner has** ([PD-127](../delivery/PHASE32SS_PLAN.md)): the Android phone and Samsung tablet (DUDE's Android app), Windows PCs (the Electron desktop), the Linux laptop (the installed PWA until Phase 39 brings a Linux desktop) and an employer-managed office PC (the web portal in a browser, capturing manually or by forwarding).

## Surfaces and offline behavior

### Surfaces

- **The SaveSphere destination** at `/savesphere` on the desktop, the Hub-served web and the Android app (32-SS2). It is shell exception #15, a top-level destination like Settings and Insights, not a registry tool, and it adds no tool category ([PD-125](../delivery/PHASE32SS_PLAN.md)). On the Hub it is served at `https://<domain>/savesphere/…` on the owner's bare domain ([PD-119](../delivery/PHASE32SS_PLAN.md)); the reference deployment is `abdulssavesphere.com`.
- **DUDE Home panels.** `/` stays DUDE Home and gains SaveSphere panels: quick capture, the inbox count, a resurfaced item and due reminders (32-SS2; the resurfaced-item and reminder panels show content once 32-SS5 delivers resurfacing and reminders).
- **Command palette.** A quick-capture command and SaveSphere search are available from the command palette (`Ctrl+K`) ([PD-125](../delivery/PHASE32SS_PLAN.md)).
- **Android app.** The existing DUDE Android app gains a SaveSphere area (32-SS2), the share target, a home-screen widget and a Quick Settings tile for capture (32-SS3), and native pen ink, document scanning and PDF (32-SS4) through native Kotlin modules ([PD-127](../delivery/PHASE32SS_PLAN.md)).
- **Windows desktop.** The Electron desktop hosts the same destination, quick capture, watched folders and the Markdown mirror (32-SS3), and Windows pen ink (32-SS4).
- **Web and PWA.** The Hub-served web app, installable as a PWA, is the surface for the Linux laptop and the office PC, and the PWA share target is a capture channel (32-SS3).
- **The GitHub Pages companion** stays anonymous and Hub-less ([PD-122](../delivery/PHASE32SS_PLAN.md)); it has no SaveSphere content.

All surfaces follow the [DUDE UX Specification](../product/UX_SPEC.md): token-only theming in every theme, contrast mode and palette, keyboard reachability and screen-reader support.

### Sign-in and reachability

- Every path on the owner's domain requires an owner session, or from 32-SS6 a guest session. Static assets (including the cached offline shell) are public so the sign-in page can load, and every API, websocket and admin route is gated except sign-in, recovery, the token-only ingest path and public share links ([PD-122](../delivery/PHASE32SS_PLAN.md), [PD-144](../delivery/PHASE32SS1_PLAN.md)).
- The owner signs in with Google; the password and recovery codes remain as the fallback, and the Hub works with Google unreachable ([PD-121](../delivery/PHASE32SS_PLAN.md), 32-SS1).
- The reference Hub is the owner's Windows PC. When it is off, asleep or rebooting, SaveSphere is reachable only from local replicas, caches and capture queues. A browser or installed PWA that has loaded the site before shows a "Hub offline" state from its cached shell; a first-time visitor sees the ingress provider's error page, because nothing the owner runs is online to serve anything else ([PD-123](../delivery/PHASE32SS_PLAN.md), 32-SS1).

### Offline behavior per surface

Defined by [PD-126](../delivery/PHASE32SS_PLAN.md):

| Surface | While the Hub is unreachable |
|---|---|
| Windows desktop (Electron) | Full local replica: metadata, documents and attachments within a configurable budget (the rest fetched on demand when online). Reading, editing, capture and search of the replica keep working. Edits go into a durable outbox and merge through Yjs on reconnect. |
| Android app (phone and tablet) | The same full local replica, outbox and Yjs merge as the desktop, including ink. Today the Android app may not import the 31J Yjs mapping package; 32-SS2 must provide one it can use (see [SaveSphere Architecture](SAVESPHERE_ARCHITECTURE.md)). |
| Web PWA (Linux laptop, office PC) | A capture queue and a read cache of recent and pinned items only. Editing existing items needs the Hub. |
| A browser with nothing cached | Nothing SaveSphere controls: the ingress provider's error page (for the Cloudflare Tunnel) or a connection failure (direct Public mode). |

Rules that hold on every surface:

- A capture never fails because the device is offline; it is queued durably and sent when the Hub is reachable.
- Pending captures and edits are never silently discarded. Each surface SHALL show whether an item or capture is saved locally, pending upload, saved to the Hub, or failed, and SHALL surface anything needing the owner's attention. The exact states and their presentation are decided when 32-SS2 is planned.
- Merge semantics, outbox behavior and conflict handling follow [Data, Persistence and Synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md); details specific to SaveSphere are in [SaveSphere Architecture](SAVESPHERE_ARCHITECTURE.md).

## Domain model

Defined by [PD-128](../delivery/PHASE32SS_PLAN.md).

- **Items (32-SS2).** Every entry is an item with a stable ID, a type, a title, properties, links, optional rich content, attachments, created and modified times, its capture source and its version history. Renaming or moving an item never breaks a link to it.
- **Types (32-SS5).** Built-in types include note, document, file, bookmark, task, journal entry, flashcard, person and event; the full built-in list is set when 32-SS5 is planned. The owner can define new types. Built-in and owner-defined types are both data, stored the same way; changing a type adds or removes fields on its items without a migration step visible to the owner. Before 32-SS5, items use the built-in types 32-SS2 needs.
- **Properties (32-SS5).** Each type carries typed properties. Kinds include text, number, checkbox, select and multi-select, date and date-time, URL, file, rating, status and link-to-item; the final kind list is set when 32-SS5 is planned.
- **Notebooks and collections (32-SS2).** Both hold items by reference, so one item can appear in several without duplication. Removing an item from a notebook or collection does not delete it.
- **Tags (32-SS2).** Free-form labels, with autocomplete and a page per tag.
- **Links (32-SS2; graph 32-SS5).** Typed links between items, `[[wikilinks]]` with title autocomplete and mentions inside rich text, a backlinks panel on every item, and a graph view (global and per item, filterable) in 32-SS5.
- **Stable block IDs (32-SS2).** Every block in a rich document carries a stable ID, kept through split, merge and paste, so links, citations, search hits and merges can point at a block.
- **Tasks and reminders (32-SS5).** Task items and inline checklist tasks with due dates, reminders and recurrence, and Today and Upcoming views.
- **Journal (32-SS5).** Daily and weekly entries created from owner-editable templates.
- **Flashcards (32-SS5).** Cards linked back to their source item and block, scheduled with FSRS, with a review session, and Anki import and export.
- **Archive and trash (32-SS2).** Archiving hides an item from default views without deleting it. Deleting moves it to the trash ([Preservation, history and portability](#preservation-history-and-portability)).

## Editing

Defined by [PD-129](../delivery/PHASE32SS_PLAN.md).

### Rich text (32-SS2)

The rich-text editor is Tiptap/ProseMirror bound to Yjs. It SHALL support:

- headings, bulleted and numbered lists, checklists and quotes;
- tables;
- code blocks with syntax highlighting;
- math;
- callouts;
- embedded images, audio, video and PDFs from the item's attachments;
- links, `[[wikilinks]]` and item mentions, each of which creates a link;
- Markdown shortcuts while typing, and Markdown paste;
- undo and redo.

Pasted, imported and captured HTML is sanitized before it is stored or rendered.

**Saving.** Edits autosave continuously; there is no Save button. The editor always shows the current save state (see [Offline behavior per surface](#offline-behavior-per-surface)). Concurrent edits from the owner's devices, and from 32-SS6 from guests with edit access, merge in real time through DUDE's Yjs collaboration ([Data, Persistence and Synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31j-collaborative-documents-and-realtime-depth)).

### Handwriting and hybrid notes (32-SS4)

- Vector ink with pressure and tilt is written on supported pens: the Galaxy S25 Ultra and a Samsung S Pen tablet (through `androidx.ink`) and a Windows pen on the desktop.
- Ink tools: pen, highlighter, eraser and lasso (select, move and resize strokes).
- Every other surface, including the web, shows ink read-only.
- A hybrid note mixes handwritten and typed blocks in one note.
- Recognized handwriting is stored as derived text for search; the original ink is never replaced.

### PDF annotation (32-SS4)

- Highlights, ink and comments on a PDF are stored as a separate annotation layer. The original PDF is never modified.
- "Export annotated copy" writes a new file with the annotations applied.
- Annotation text and recognized annotation ink are searchable.
- The Android app's document scanner produces PDFs that enter SaveSphere as originals.

### Canvas (32-SS4)

Infinite canvases hold ink, text, shapes, images and live item cards. A card references an existing item (its current title and preview), never a copy, and placing it creates a link. The canvas engine is chosen when 32-SS4 is planned, on license and stylus support.

### External editors (32-SS3)

Any attachment can be opened in an external application: an edit intent on Android, a watched temporary copy on the desktop. The saved result returns as a new version of that attachment; the earlier version stays in history ([PD-133](../delivery/PHASE32SS_PLAN.md)).

## Organization

### Inbox and triage (32-SS3)

- New captures that are not yet filed land in the inbox, newest first, with filters by source, content type and date.
- Quick filing: move to a notebook or collection, tag, change the type, or open the item.
- Bulk actions: select many items, then file, tag, archive or delete them.
- Snooze hides an item until a chosen date.
- Duplicate warnings flag likely duplicates (the same file content or the same normalized URL) with an action to resolve them. Exact dedupe and idempotency rules are in [Capture and Import](CAPTURE_AND_IMPORT.md).
- From 32-SS5, the inbox also holds AI proposals that were not confident enough to apply automatically.

### Confidence-gated AI organization (32-SS5)

Defined by [PD-134](../delivery/PHASE32SS_PLAN.md). When a capture arrives and an AI provider is configured, AI proposes a title, type, tags, a destination notebook or collection, and links to related items.

- A confident proposal is applied automatically and recorded as an undoable revision authored by "AI".
- A less confident proposal goes to the inbox as a suggestion the owner accepts or rejects.
- When the owner sets or changes a field, that field is pinned and AI never changes it again.
- AI never deletes or merges items and never rewrites the owner's own text.
- The confidence threshold and how it is presented are decided when 32-SS5 is planned.

### Views, saved searches and smart collections (32-SS5)

- Any type, notebook or collection can be shown as a saved database view: table, list, kanban, calendar or gallery, with sorting, grouping and filters.
- A search can be saved and reopened.
- A smart collection is a collection whose membership is a saved query rather than a hand-picked list.

## Search and the Personal Knowledge Copilot

Defined by [PD-136](../delivery/PHASE32SS_PLAN.md) and [PD-135](../delivery/PHASE32SS_PLAN.md).

### What is indexed

Titles, rich text, properties, tags and metadata from 32-SS2; extracted text of attachments, OCR of images and scans, and transcripts of audio and video as the processing pipeline delivers them (32-SS3 to 32-SS5); recognized handwriting and PDF annotations from 32-SS4. Vault content is never indexed ([The vault](#the-vault)). The OCR and transcription engines, and whether they run locally or in the cloud, are decided when 32-SS5 is planned.

### Search

- Full-text search (32-SS2) with exact phrases, filters (type, tag, notebook, date and property) and highlighted snippets. A hit opens at the matching block or page.
- Hybrid search (32-SS5) adds vector similarity and link traversal to full-text matching.
- Search is available from the SaveSphere destination and the command palette.

### Copilot (32-SS5)

- **Questions with citations.** The owner asks questions about their own content ("what have I saved about X", "where did I see Y", "what did I decide about Z"). Answers name the source items and blocks. Every citation is checked against what was actually retrieved, and an unverifiable citation is dropped rather than shown.
- **Summaries** of an item, a notebook or a search result. A summary is stored as a derived artifact and never replaces the original.
- **Related items and suggested links** for the item the owner is looking at.
- **Resurfacing** of forgotten but relevant items ([Reminders and resurfacing delivery](#reminders-and-resurfacing-delivery)).

### Safety, disclosure and cost

- Captured content is passed to models as delimited data, never as instructions. The Copilot has no tools that write, fetch, send or open the vault, so injected text in a captured page can at worst produce a wrong answer or a rejectable proposal.
- Every AI task discloses what it sends and to which provider.
- The owner sets a spend cap, and usage is tracked.
- The vault is excluded unless the owner explicitly allows a specific item.
- With no AI provider configured, capture, editing, organization by hand and full-text search all keep working; AI-only features show as unavailable.
- Which providers are used, and whether embeddings, OCR and transcription run locally or in the cloud, is deliberately deferred to 32-SS5 planning.

## Reminders and resurfacing delivery

Defined by [PD-137](../delivery/PHASE32SS_PLAN.md) (32-SS5). Due reminders, resurfaced items and digests reach the owner through:

- a SaveSphere panel on DUDE Home and the existing shell bell;
- Android push notifications;
- a daily or weekly email digest;
- Windows desktop notifications, through the existing desktop notification path.

Notification payloads carry no item content. The Android push transport and the outbound email path are decided when 32-SS5 is planned.

## Preservation, history and portability

### Originals and derived artifacts (32-SS2 onward)

- Captured and imported originals are kept for good: never thinned, replaced or modified ([PD-130](../delivery/PHASE32SS_PLAN.md)).
- Derived artifacts (extracted text, OCR, recognized handwriting, transcripts, thumbnails, previews, summaries) are stored alongside the original.
- Video saves store the link and its metadata by default; a per-item "Archive original" toggle downloads the media where technically and legally possible (32-SS3, [PD-131](../delivery/PHASE32SS_PLAN.md)).

### Version history and trash (32-SS2)

- Every saved version of an item is kept for 90 days, then thinned to one per day, then one per month. The exact tier boundaries are set when 32-SS2 is planned, and the owner can change them.
- The owner can browse an item's versions, compare two, and restore one. Restoring applies the old version as a new forward edit; it never rewrites history.
- AI revisions (32-SS5) appear in history with "AI" as the author and can be undone like any other edit.
- Deleted items stay in the trash for 30 days and can be restored. Permanent purge is previewed and requires step-up.

### Portability

- **Export (32-SS2).** A full export is always available: Markdown for content, JSON for structure, the original files, and a checksummed manifest. Vault content is excluded unless the owner explicitly includes it.
- **Markdown mirror (32-SS3).** A desktop can mirror SaveSphere into a folder the owner chooses, as Markdown with front matter plus original attachments, usable from Obsidian and VS Code. The mirror syncs both ways: an external edit returns as a new version, and a conflict produces a conflict copy rather than overwriting anything. Mirror writes run under a standing authorization the owner grants per folder, per the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract), and the mirror never deletes outside its folder. The Linux laptop gets no mirror until Phase 39 ([PD-133](../delivery/PHASE32SS_PLAN.md), [PD-127](../delivery/PHASE32SS_PLAN.md)).
- **Backup (32-SS1).** DUDE's backup v2 covers SaveSphere content, including every original in the blob store, without a size cap, to a local or second drive, an S3-compatible bucket, another DUDE device acting as a warm standby, or Google Drive or OneDrive. Every backup is verified before it counts, a restore drill is scheduled, and an overdue or failed backup raises a Hub notification ([PD-124](../delivery/PHASE32SS_PLAN.md)).

## The vault

Defined by [PD-138](../delivery/PHASE32SS_PLAN.md) (32-SS2).

- The vault holds sensitive notes and files, plus structured records such as credentials and ID documents, with copy-to-clipboard for their fields.
- It is encrypted at rest on the Hub with its own key, separate from the backup passphrase and from the canonical database.
- Opening the vault requires step-up, and it locks again when idle.
- Vault content is excluded from AI (unless the owner explicitly allows a specific item for AI), from OCR and indexing, from the Markdown mirror, from export unless explicitly included, from ingest tokens and from sharing.
- It is not a browser-autofill password manager.
- It is not end-to-end encrypted; end-to-end encrypted sync remains Phase 82.
- How the vault is found and navigated while unlocked, given that its content is not indexed, is decided when 32-SS2 is planned.

## Sharing

Defined by [PD-139](../delivery/PHASE32SS_PLAN.md) (32-SS6). Until 32-SS6, SaveSphere has exactly one user, the owner.

- **Guests.** The owner invites named Google accounts as guest principals with view, comment or edit access to the notebooks or items the owner selects. Guests with edit access co-edit through the same Yjs collaboration as the owner's devices.
- **Public links.** Read-only, expiring and revocable links to selected content. They are among the few unauthenticated paths on the domain.
- **Limits.** Guests never see the vault, AI settings, devices, tool state or admin pages, and cannot invite others. The owner remains the sole admin.
- **Audit.** Every grant, link and access is audited, and the owner can review and revoke any grant or link.
- Full multi-tenant or family spaces stay out of scope ([Scope ceilings](#scope-ceilings)). General participants for the rest of DUDE remain Phase 53.

## Scope ceilings

More capabilities are expected to come up. Each enters scope only through a dated decision added to the [program decisions](../delivery/PHASE32SS_PLAN.md) and the roadmap, never by being implied in a phase description ([PD-140](../delivery/PHASE32SS_PLAN.md)).

Out of scope unless a later dated decision reverses it:

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

The discarded SaveSphere specification also described capabilities that no planned phase includes: rule-based automations, calendar, GitHub, RSS and Jira integrations, formula, lookup and rollup properties, a text query language, separate workspaces and starter-workspace templates. They are not decided out of scope, but they are not planned either; each would need its own dated decision under PD-140. A web clipper is the exception: it is a roadmap item of the [Phase 38 browser extension](../delivery/ROADMAP.md#phase-38), not part of the SaveSphere phases.

Messaging and social sources (WhatsApp, Instagram, TikTok) are captured only through the Android share sheet and their official data exports ([PD-132](../delivery/PHASE32SS_PLAN.md)). Connecting an employer's Microsoft 365 tenant is an opt-in mode used only when the employer permits it ([PD-127](../delivery/PHASE32SS_PLAN.md)).

## Acceptance themes

The first SaveSphere release gate closes at the end of 32-SS5 ([PD-117](../delivery/PHASE32SS_PLAN.md)); 32-SS6 has its own exit gate. At the product level, the gate must prove:

- **No lost captures or edits offline.** Captures and edits made offline on desktop and Android, and captures queued in the PWA, survive restarts and reach the Hub when it returns.
- **No duplicates on retry.** Retried captures and re-run imports never create duplicate items.
- **Originals preserved.** Every original is retrievable byte for byte after capture, import, editing, annotation, AI processing, backup and restore.
- **Search finds recognized text.** Content that exists only in handwriting, OCR of images and scans, or transcripts is found by search.
- **Citations are real.** Every Copilot citation points at an item and block that was actually retrieved.
- **The vault never leaks.** Vault content never reaches AI (without explicit per-item consent), indexes, the mirror, ingest tokens, sharing or an export that did not explicitly include it.
- **Restore works.** Restoring a version, restoring from trash and restoring a backup onto a Hub all bring back exactly what was saved.
- **AI stays within its limits.** AI changes are undoable revisions, pinned fields are never changed, and AI never deletes, merges or rewrites the owner's text; with no provider configured, SaveSphere still works.
- **Sign-in gating holds.** No SaveSphere content is reachable on the owner's domain without a session, except through a public link the owner created.

The formal checklist is the [SaveSphere First Release Definition of Done](../delivery/QUALITY_AND_RELEASE.md#savesphere-first-release-definition-of-done--all-planned). Performance targets are measured and recorded during each phase.
