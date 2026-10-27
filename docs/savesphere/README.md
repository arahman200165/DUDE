# SaveSphere

SaveSphere is the owner's personal knowledge system inside DUDE: one place to capture, preserve, organize and find anything the owner decides to keep, whatever its source or format. It also replaces Samsung Notes, Evernote and OneNote for everyday typed notes, handwriting, PDF annotation and canvases. It is not a separate product or stack; it runs on the owner's own Hub, is reached over the owner's own domain, and reuses DUDE's Hub, identity, sync, backup, desktop app, Android app and design system.

**Status:** Planned: Phases 32-SS1 to 32-SS6; nothing is implemented yet. Every statement in this folder is a planned requirement, not an as-built claim.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; the [SaveSphere program decisions](../delivery/PHASE32SS_PLAN.md) (PD-116–PD-140) govern the program, and the documents in this folder own the detailed SaveSphere contracts within them.

Related: [SaveSphere program decisions](../delivery/PHASE32SS_PLAN.md) · [Roadmap: SaveSphere program](../delivery/ROADMAP.md#savesphere-program) · [DUDE Product Specification](../product/PRODUCT_SPEC.md) · [DUDE UX Specification](../product/UX_SPEC.md) · [Data, Persistence and Synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md) · [DUDE Security Architecture](../architecture/SECURITY_ARCHITECTURE.md) · [Decision Log](../history/DECISION_LOG.md#savesphere-program-decision--2026-10-25).

## Contents

- [Documents](#documents)
- [Authority](#authority)
- [Phase map](#phase-map)
- [Glossary](#glossary)
- [Reading order](#reading-order)

## Documents

| Document | Owns | Link |
|---|---|---|
| SaveSphere Product Specification | Vision and principles, target journeys, surfaces and offline behavior, the domain model, editing, organization, search and the Copilot, reminders, preservation and history, the vault, sharing, scope ceilings and product-level acceptance themes | [SAVESPHERE_PRODUCT_SPEC.md](SAVESPHERE_PRODUCT_SPEC.md) |
| Capture and Import | Every capture channel, the ingest API and its tokens, email capture, the per-source importer catalog, the import framework (stage, preview, commit, report), dedupe and idempotency | [CAPTURE_AND_IMPORT.md](CAPTURE_AND_IMPORT.md) |
| SaveSphere Architecture | Hub provisioning, the SaveSphere content store, indexes, blob store, job queue and processing pipeline, replicas and Yjs merge, the AI provider interface, the Markdown mirror, the vault's encryption, and how SaveSphere uses the shared Hub contracts | [SAVESPHERE_ARCHITECTURE.md](SAVESPHERE_ARCHITECTURE.md) |
| SaveSphere program decisions | The dated decisions PD-116–PD-140, the phase map, the open items each phase decides, and per-phase deviations | [PHASE32SS_PLAN.md](../delivery/PHASE32SS_PLAN.md) |

## Authority

1. [The master PRD](../DUDE_PRD.md) governs product direction, durable boundaries and architectural invariants. SaveSphere changes none of the [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries).
2. The [SaveSphere program decisions](../delivery/PHASE32SS_PLAN.md) govern the program. A capability enters scope only through a dated decision added there and to the roadmap ([PD-140](../delivery/PHASE32SS_PLAN.md)); a phase description never implies one.
3. The specifications in this folder sit at the product and architecture level for SaveSphere. They elaborate the decisions and must not contradict them; where a detail is unspecified, it is decided when the relevant phase is planned and recorded in the plan.
4. The existing DUDE specifications keep authority over every contract SaveSphere shares with the rest of DUDE: [Data, Persistence and Synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md) for authority, scopes, sync, Yjs documents and backup; [DUDE Security Architecture](../architecture/SECURITY_ARCHITECTURE.md) for identity, credentials, exposure, step-up and the [Destructive-Action Contract](../architecture/SECURITY_ARCHITECTURE.md#destructive-action-contract); [DUDE UX Specification](../product/UX_SPEC.md) for appearance, navigation and accessibility.
5. [Quality and Release](../delivery/QUALITY_AND_RELEASE.md) governs acceptance and holds the formal [SaveSphere First Release Definition of Done](../delivery/QUALITY_AND_RELEASE.md#savesphere-first-release-definition-of-done--all-planned). The [Roadmap](../delivery/ROADMAP.md#savesphere-program) governs sequencing.

## Phase map

The phases run strictly in order after Phase 31J; Phase 32 begins after 32-SS6. The first SaveSphere release gate closes at the end of 32-SS5 ([PD-117](../delivery/PHASE32SS_PLAN.md)).

| Phase | Delivers |
|---|---|
| [32-SS1](../delivery/ROADMAP.md#phase-32-ss1) Hub Platform | Provisioning wizard and embedded storage and services, Google sign-in with linked accounts, bare-domain hosting, managed Cloudflare Tunnel, sign-in gating for the whole domain, resumable chunked uploads, durable job queue, backup v2, the cached Hub-offline state |
| [32-SS2](../delivery/ROADMAP.md#phase-32-ss2) Notes Core | Item model, notebooks, collections, tags, links and backlinks, rich-text editor on Yjs, attachments, tiered history and trash, full-text search, the vault, desktop and Android replicas, web read cache, export, the `/savesphere` destination and Home panels |
| [32-SS3](../delivery/ROADMAP.md#phase-32-ss3) Capture and Inbox | Every capture channel, the import framework and importers, inbox triage, dedupe, the SSRF-safe link and metadata fetcher, the video archive toggle, watched folders, the Markdown mirror, the external-editor round-trip |
| [32-SS4](../delivery/ROADMAP.md#phase-32-ss4) Ink and PDF | Pen ink on Android and Windows, hybrid ink and text, PDF viewer and annotation layer, document scanner, infinite canvas, handwriting recognition for search, the Samsung Notes PDF fidelity pass |
| [32-SS5](../delivery/ROADMAP.md#phase-32-ss5) Structure and Copilot | Types, properties and database views, tasks and reminders, graph, journal, flashcards, the AI provider and processing pipeline, confidence-gated organization, the Copilot, resurfacing, notification channels; **first SaveSphere release gate** |
| [32-SS6](../delivery/ROADMAP.md#phase-32-ss6) Sharing | Guest principals and public read-only links |

## Glossary

- **Item.** Any SaveSphere entry: a note, document, file, bookmark, task, journal entry, flashcard, person, event or an entry of an owner-defined type. Every item has a stable ID that survives renames and moves.
- **Type.** What kind of item something is. Built-in types and owner-defined types are both data, not hard-coded schema, and each carries a set of properties.
- **Property.** A typed field on an item (text, number, date, select, link to another item and similar kinds), defined by the item's type.
- **Notebook.** A named container the owner files items into. It holds items by reference, so an item can sit in several.
- **Collection.** A named grouping of items, also by reference. A smart collection is defined by a saved query rather than by hand.
- **Tag.** A free-form label on an item, independent of notebooks and collections.
- **Link / backlink.** A connection from one item (or block) to another: a typed link, a `[[wikilink]]` or a mention. A backlink is the same link seen from its target.
- **Capture.** Saving something into SaveSphere from any channel (quick capture, share sheet, email, ingest API, watched folder, upload) without first deciding where it belongs.
- **Inbox.** The triage view for captures that are not yet filed and for AI proposals that were not confident enough to apply automatically.
- **Original.** The file, message or archive exactly as captured or imported. Originals are never thinned, replaced or modified.
- **Derived artifact.** Content produced from an original and stored alongside it: extracted text, OCR, recognized handwriting, transcripts, thumbnails, previews and summaries.
- **Version.** A saved state of an item in its history. Versions are kept in tiers; restoring one applies it as a new forward edit.
- **Vault.** The step-up protected area for sensitive notes, files and structured records, encrypted at rest on the Hub with its own key and excluded from AI, indexing, the mirror, ingest, sharing and (by default) export.
- **Mirror.** A desktop folder holding SaveSphere as Markdown files with front matter and original attachments, kept in sync both ways.
- **Ingest token.** A scoped credential for the capture API at `/api/v1/ingest/…`, which accepts these tokens only and never cookies. Ingest tokens never reach the vault; their scopes are defined in [Capture and Import](CAPTURE_AND_IMPORT.md).
- **Guest.** A named Google account the owner invites, from 32-SS6, with view, comment or edit access to selected notebooks or items.
- **Public link.** A read-only, expiring and revocable link to selected content, from 32-SS6.
- **Copilot.** The Personal Knowledge Copilot: search, questions answered with verified citations, summaries, related items and resurfacing, all over the owner's own content.
- **Resurfacing.** Bringing back forgotten but relevant items to the owner's attention.
- **Provisioning.** The Hub setup wizard step that creates, and the Hub then supervises, SaveSphere's storage tiers and services; it is re-runnable and reports each component's status.

## Reading order

1. [The master PRD](../DUDE_PRD.md), for DUDE's boundaries and invariants.
2. [SaveSphere program decisions](../delivery/PHASE32SS_PLAN.md), for what is decided and what is still open.
3. [SaveSphere Product Specification](SAVESPHERE_PRODUCT_SPEC.md), for what the owner gets.
4. [Capture and Import](CAPTURE_AND_IMPORT.md), for how content arrives.
5. [SaveSphere Architecture](SAVESPHERE_ARCHITECTURE.md), for how the Hub and clients deliver it.
6. The [Roadmap entries](../delivery/ROADMAP.md#savesphere-program) for the phase being planned, then the shared DUDE architecture specifications that phase touches.
