# AGENTS.md — apps/web/src/app/core/usage/

Framework layer for Local Usage Frequency / Recently Used Tools (`DUDE_PRD.md` §21 Phase 24 Items
5/6, subject to Item 14's privacy constraint). Like the rest of `core/`, no file here ever names a
specific tool by id.

## Uniform across all 277 tools — deliberately not modeled on History's opt-in

`core/history/` is opt-in per tool (`historyEligible: true`) because it records a tool's actual
*content* — a real sensitivity question. `UsageService` only ever records `{toolId, count,
lastUsedAt}`: no state, no input, no output. There is no sensitivity gradient over a bare tool id
and a timestamp, so every tool participates automatically, with no per-tool adapter file and no
exclusion list. Don't add one later without a real justification — it would be exactly the kind of
silent-default drift `DUDE_PRD.md` §30 warns about, just in the opposite direction (excluding a tool
from a *content-free* signal for no concrete reason).

## Storage

One `local`-policy blob under the synthetic pseudo-tool-id `'__usage__'` (the same trick
`'__workspace__'`/`'__pipelines__'` already use), via `PersistenceService.signal(...)` — not
IndexedDB. Unlike History (a genuinely growing, unbounded log of past *content* snapshots), usage
data is small and self-capping: `counts` has at most one entry per tool ever opened, and
`recentLog` is capped at `MAX_RECENT_LOG` (`usage.model.ts`). This is why it fits `PersistenceService`'s
"one JSON blob per key" model instead of needing a second IndexedDB database.

## Daily buckets (Phase 30H, schema v2)

`UsageStore` v2 adds `dailyBuckets` (`{date, opens, perTool}`, ascending, pruned to the rolling
`MAX_DAILY_BUCKETS` = 30 local days on every write) and `trackingStartedOn` (the local day of the
first open recorded under v2). `perTool` is tool id → count only — enough for unique-tools and
time-bounded category views, never content. `UsageService` stays the **only** recorder: the buckets
are written by the same `recordUsage` call as `counts`/`recentLog`.

- **Migration:** `migrateUsageStore` upgrades v1 keeping `counts` and `recentLog`, with no buckets and
  `trackingStartedOn: null`. The recent log is deliberately **never** used to backfill days — it is
  capped at 200 and can't guarantee a complete period. A newer/unknown schema that still has the v1
  fields keeps its lifetime data instead of resetting. Persisted buckets are re-validated on load
  (real local dates, non-negative integers, slug tool ids).
- **Local days:** day keys come from `local-day.ts` (calendar arithmetic, DST-safe), never
  `toISOString().slice(0, 10)`, which is a UTC date.
- **Periods:** `selectActivityPeriod` (`activity-summary.ts`) returns days before the tracking start as
  `opens: null` ("not tracked", never zero) and `complete: false` until the start day is at least the
  window length before today. Total, unique tools and per-tool counts cover exactly the tracked days,
  so a summary can't disagree with its chart.
- **Backup:** usage — buckets included — is never exported (see `core/backup/AGENTS.md`).
- **Privacy audit:** `phase24-privacy-audit.spec.ts` asserts the bucket key allow-list plus value
  shapes (date format, integer counts, registry tool ids, ≤ 30 buckets, tracking-start format).

## Recording point

`UsageService.recordOpen(toolId)` is called from `ToolShell`'s constructor — the "open" counterpart
to the same component's existing `ngOnDestroy` History-capture hook. This fires identically whether
a tool is reached via its own direct route or mounted inside a Workspace panel (`ToolHost`), since
`ToolShell`'s `definition()` computed already resolves correctly in both contexts via
`WORKSPACE_HOST_CONTEXT` — no new resolution logic needed here.

## Consumers

`recentLogRaw()` exposes the ordered (oldest-first) open log specifically for later sequence-mining
consumers — Related-Tool Suggestions, Pipeline Suggestions, and Unified Recents (`core/suggestions/`,
`core/recents/`) all read from here rather than each maintaining their own tracking.
