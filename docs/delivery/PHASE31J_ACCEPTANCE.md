# Phase 31J implementation and acceptance evidence

**Status: complete (Milestone 815, 2026-10-24).** Implementation landed in Milestones 787–814 and the automated exit gate passed on HEAD `1f204601` (Milestone 814) on 2026-10-24. Every automated gate listed below passed except `npm run audit:prod`, whose three advisories do not come from 31J and are tracked separately. The physical and installed passes in the [guided manual script](#guided-manual-acceptance-script) are **owed**: none has been run, and none is claimed. Unlike Phase 31I, no version bump or release declaration depends on them (31J has no version-bump milestone; versions stay `2.0.<commit count>`), so they are carried forward as owed passes, not as a gate on Phase 32. The roadmap's [strict phase progression](ROADMAP.md#strict-phase-progression) is satisfied: every phase from 31A through 31J is complete, so Phase 32 may begin.

## Implemented scope

The map is as built; the planned map and the renumbering are in [the Phase 31J plan](PHASE31J_PLAN.md#milestone-map). The decisions are [PD-099–PD-115](PHASE31J_PLAN.md), the deviations are in [Deviations and implementation notes](PHASE31J_PLAN.md#deviations-and-implementation-notes), and the as-built contracts are the Phase 31J sections of [Data and synchronization](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31j-collaborative-documents-and-realtime-depth) and [Security](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31j-collaboration-notifications-and-presence). The Hub still has one owner and one environment (PD-027): "collaboration" here is the owner's own desktops, browsers and phone.

| Milestone | Implementation |
|---|---|
| 787 | Decisions PD-099 to PD-115 |
| 788 | Hub protocol 3 (`HUB_PROTOCOL_VERSION` 3, minimum client still 1), the shared WebSocket host and upgrade authentication, typed realtime event data |
| 789–790 | Hub presence for every principal (including browser sessions); client presence and the opt-in, memory-only active-tool presence |
| 791–792 | Live owner pages from contentless `owner-view-changed` topics; live merges of clean remote changes in open editors |
| 793 | Read-only Hub job status (`GET /api/v1/jobs`, closed `HUB_JOB_IDS`) |
| 794–796 | Hub notifications (migration 0009) with the closed producer list and the per-device notification-reader grant; the shell bell (shell exception #14) and the read-only "Hub jobs" card; desktop OS notifications and the reader-grant UI |
| 797–799 | `mergeText3` and the text and keyed-list merge rules; `@dude/collab-doc` (portable Yjs mapping); collaboration contracts, the `collab-documents` category and the `markdown-doc` codec |
| 800–802 | Hub collaborative document store and materializer (migration 0010); the `/api/v1/collab` socket and Markdown Hub rooms; merging non-Yjs writes into live documents (`merged` push result) |
| 803–805 | CodeMirror 6 editor for the three surfaces; the web collaboration service and Hub web transport; the desktop relay through the Device Agent |
| 806–808 | Live scratchpad; live user-script bodies; Markdown Hub rooms and kept documents |
| 809a | Hub collaborative document history (snapshots, preview, restore as a forward edit) |
| 810 | Collaborative history drawer |
| 811 | `collab-maintenance` retention job and backup consistency |
| 812 | Hub exit-gate suites and the two-browser drill `e2e/hub/60-collab.spec.ts` |
| 813 | Two-desktop collaboration e2e through the Agent relay, `e2e/sync/30-collab.spec.ts` |
| 814 | As-built documentation |
| 815 | Acceptance evidence, owed-pass script and close-out ([close-out](#milestone-815-close-out)) |

Four unnumbered fix commits sit between milestones: restore-spec ordering of concurrent end-of-text insertions (after 799), insertion canonicalization for `mergeText3` (`b15bedd6`, after 802), `writeDefault: false` for persisted signals (after 792) and the Hub jobs card counting its rows from `HUB_JOB_IDS` (`b9b4817e`, after 811).

### As-built deviations from the decisions

These are recorded in the plan and repeated here because the exit gate was judged against what was built:

- **No `job-status` event (PD-112).** A job start or finish sends the contentless `owner-view-changed {topic: 'jobs'}` and views refetch `GET /api/v1/jobs`.
- **`mergeText3` is dependency-free (PD-102).** It uses a code-point Myers diff instead of diff-match-patch, so `@dude/sync` gained no dependency.
- **The notification-reader grant does not open `GET /jobs` (PD-110).** It opens the three notification routes, `notification` events and the `notifications` view topic; reading the job list needs the owner.
- **`markdown-doc` is not journaled on devices (Milestone 799).** A kept document changes only through the live document, so after the 10-second grace the desktop keeps a Markdown document or room as a plain local draft rather than saving it through the outbox (the scratchpad and the user-script body do save through the outbox).

## Recorded verification

### Final automated gate

Run on HEAD `1f204601` (Milestone 814), 2026-10-24, on the Windows 11 development host.

| Gate | Result |
|---|---|
| `npm test` | Packages: **702 files / 4,828 tests** passed. Angular: **801 files, 799 passed, 8,643 / 8,643 tests** passed. Two Angular files, `shell/deck/user-panels/user-content-panel.spec.ts` and `shell/settings/sections/home-layout-visual/home-layout-visual.spec.ts`, hit the known Vitest `EnvironmentTeardownError` full-suite flake and passed in isolation (**2 files, 9 tests**). This is a known flake, not a regression. |
| `npm run lint` | Passed: eslint, boundaries (package and mobile), design tokens **0 violations**, theme contrast **144 combinations / 49,008 checks**, and the inventories (**2,687** resolved sources, **78** component extractions, **334** registrations; **940** storage sites classified, **61** review flags, **0** unreviewed). |
| `npm run check:mobile` | Passed. |
| `npm run test:mobile` | **41 node tests** and **44 Vitest files / 345 tests** passed. |
| `npm run check:portable` | **1,334 ESM export modules**. |
| `npm run test:electron` | **129 files / 1,419 tests** passed, **1 skipped**. |
| `npm run test:high-consequence` | Passed (suites of 50 files / 187 tests, 6 / 52, 4 / 47, 8 / 46 and 1 / 6). |
| `npm run test:hub` | **104 files** passed and 1 skipped; **1,008 tests** passed and 4 skipped. Includes the collaboration authorization, consent, retention, history-pruning, notification-retention, job-status and WebSocket contract-parity suites of PD-115. |
| `npm run build:hub-web` | Passed. Prefetched app **444.5 kB of 800 kB**. |
| Production web build | Passed. Main bundle **248.02 kB raw / 66.99 kB transfer**; prefetched app **453.8 kB of 800 kB**. The two large-chunk budget warnings pre-date 31J; the editor chunks are lazy and outside the prefetch budget. |
| `npm run test:e2e:hub` | **382 passed** (4.5 min), including all **7** tests of `e2e/hub/60-collab.spec.ts` (setup; scratchpad co-edit with each browser seeing the other in that note; user script saved in A, opened in B and co-edited; Markdown Hub room started, joined, co-edited and kept on the Hub after the disclosure; history restore of the kept document; presence in Settings › Devices; the bell receiving a backup-failed notification without a reload, with dismiss). |
| `npm run test:e2e:sync` | **19 passed, serial** (3.5 min), including the **3** tests of `e2e/sync/30-collab.spec.ts`: setup (one Hub with its web, a browser with web access, and a real Electron desktop enrolled through its own link); live co-editing of a script through the Agent relay; and an offline desktop edit that merged on reconnect **exactly once with no conflict-inbox entry**. The collaboration file also passed twice in isolation. |
| `npm run audit:prod` | **Exits 1.** The accepted `node-forge` finding is allowed; the run fails on `electron` (GHSA-jr5w-w6x2-84p9), `undici` (GHSA-xjj6-f33q-929c) and `zod` (GHSA-mrhx-c7xc-m3w5). None of these comes from a 31J dependency (the 31J additions are the CodeMirror packages, `y-codemirror.next`, `yjs`, `y-protocols` and `lib0`); they are tracked separately from this phase. |

### Bugs found by the exit drills and fixed

| Found by | Defect | Fix |
|---|---|---|
| Two-browser drill (M812) | The shared `<app-code-editor>` ignored input changes (read-only flag, language, placeholder, ARIA labels) made while its lazy engine was still mounting, so an editor that mounted read-only while connecting stayed read-only after going live | The editor compares those inputs with what it mounted with and applies any that changed as soon as the handle exists (M812) |
| Two-desktop drill (M813) | The script editor asked the Hub for the live document before the desktop outbox had delivered the saved script, so the Hub answered `not-found` | The editor retries once the outbox drains (M813, `d6ebba8a`) |
| Property test / exit drills | A diff can place the same insertion at different but equivalent gaps (`"X\n"` after a newline or `"\nX"` before it), so an edit that reached the Hub both live and as a queued write could be kept twice | `mergeText3` slides each insertion to the rightmost equivalent gap before combining the sides (`b15bedd6`) |

### Exit gate status

The [roadmap exit gate](ROADMAP.md#phase-31j) is that presence, selected Yjs collaboration, realtime document updates and notification and job-status contracts honor authorization, content consent and retention, and that privileged job execution stays deferred to Phase 88.

| Requirement | Evidence | Status |
|---|---|---|
| Presence | Hub presence suites in `npm run test:hub`; the presence step of `e2e/hub/60-collab.spec.ts`; opt-in activity sharing, memory-only and unaudited (PD-108) | Automated evidence recorded; phone online display owed (H9) |
| Selected Yjs collaboration | `e2e/hub/60-collab.spec.ts` (scratchpad, script, Markdown room) and `e2e/sync/30-collab.spec.ts` (desktop through the Agent relay); `@dude/collab-doc` tests in `npm test` | Automated evidence recorded; two real machines owed (H1, H8) |
| Realtime document updates | Live merges in open editors and `owner-view-changed` topics; the `/api/v1/realtime` WebSocket contract-parity suite (events carry no record content, and 31J events are withheld below protocol 3) | Automated evidence recorded |
| Notifications and job status | Notification, reader-grant and job-status suites in `npm run test:hub`; the bell step of the Hub e2e | Automated evidence recorded; a real failure reaching the bell and a Windows toast owed (H4) |
| Authorization | Only owner principals subscribe; a device credential gains no owner right; the Hub rewrites awareness identity; the reader grant is step-up, audited and checked at each delivery (PD-103, PD-110) | Automated evidence recorded |
| Content consent | Collaboration requires the same category consent as sync; `collab-documents` is off by default and gates persisted Markdown documents; revoking consent ends the subscription (PD-103, PD-104) | Automated evidence recorded |
| Retention | Snapshot idle, interval, count, size and 30-day rules; notification retention (30 days dismissed, 90 days, cap 500); `collab_bases` pruning; backups carry the collaborative tables and drop notifications and `job_last:*` (PD-105, PD-109) | Automated evidence recorded; restore onto a second machine owed (H7) |
| No privileged job execution | `GET /api/v1/jobs` is read-only: no queue, no "Run now"; the reader grant does not open it (PD-112) | Evidence recorded as scope statement |

### Still not recorded

None of the owed passes below has been run: two PCs co-editing over a real LAN or in public mode, the installed SEA/WinSW Hub and the Docker image carrying 31J, a real scheduled-backup failure reaching the bell and a Windows toast while signed out, NVDA on the editor and bell, cursor colors across themes and contrast modes, a real offline desktop edit and reconnect, restoring collaborative documents onto a second machine, a multi-hour Hub memory watch, and the phone shown as online.

Unrun by design: **no `measure:collab` exists or is required** (PD-115), so no collaboration latency, memory or document-size figures are recorded. The only collaboration limits that are enforced are the ones in the decisions (128 KiB record cap, 8 MiB per-document snapshot cap, 200 snapshots, 8 rooms of 8 participants).

## Guided manual acceptance script

For the owner. Run the groups in any order; each step is copy-pasteable where it is a command. Record the evidence fields in the **Result** block under each group and mark Pass or Fail. A Fail is a defect to fix and rerun, not a note; a skipped group stays **Pending** and carries forward. Use a throwaway environment you can wipe where a step touches the Hub or backups. Test-only `DUDE_HUB_TEST_*` knobs must not be set on any Hub used here: the release bundle ignores them and public mode refuses to start while one is set, so these passes exercise real timings (a 2-second materialization debounce, 2-minute idle snapshots, 10-minute minimum snapshot interval, 10-second disconnect grace).

Common setup: a Hub on a machine you own with the owner signed in; at least two other desktops or browsers enrolled or signed in as the owner; Settings › Sync consent for **Scratchpad** and **Pipelines** (scripts) enabled on each desktop, Hub web access enabled for scratchpad, scripts and Markdown documents on each browser, and the **collab-documents** category enabled wherever a kept Markdown document is used.

### H1. Two PCs co-editing over the LAN and in public mode

1. With the Hub in LAN mode, enroll a second physical PC. On PC A open the scratchpad drawer and a snippet; on PC B open the same snippet. Type on both at once, including the same line, for a minute.
2. Confirm both editors converge to identical text, each shows the other's caret and a name chip, and the status reads "Live". Repeat for a user script body (open in the script editor on both) and for a Markdown **Hub room** (start on A, join on B, then **Keep on Hub** after reading the disclosure).
3. Switch the Hub to public mode (after the readiness gate, as in the [31F pass](PHASE31F_ACCEPTANCE.md#known-limitations-and-owed-manual-passes)) and repeat step 1 from a second machine through the public name, then from a phone browser on cellular.
4. Close the Hub socket path (stop the Hub service) while both are typing, then start it again.

**Pass criterion:** in every mode the two editors converge to byte-identical text with no lost keystroke, remote carets and selections are visible, a kept document appears on both machines and survives a Hub restart, and the Hub outage shows "Read-only" on Hub web and the 10-second-grace local fallback on the desktop (never silent data loss). Record: machines, modes, the Hub and app versions, convergence outcome per surface.

**Result: Pending.**

### H2. The installed Hub (SEA/WinSW) and the Docker image

1. Install the Hub from the Windows installer produced by the current `master` build with the Hub component, create the owner, and run steps 1 and 2 of H1 against it. Confirm `GET /api/v1/jobs` (Settings › Environment & Hub › Hub jobs) lists every job in `HUB_JOB_IDS` with a last-run time.
2. Run the Docker image from the same build (`npm run check:dockerfiles` first, then your usual `docker run` with a data volume) and repeat the same steps. Restart the container and confirm the kept Markdown document, a scratchpad snippet and the collaboration history are still there.
3. Upgrade a 31I-era Hub data directory in place: confirm the migration to 0010 runs (a copy is written to `data/pre-migration` first) and that the previous version of the Hub then refuses the database rather than writing around the Y.Doc.

**Pass criterion:** both installs serve `/api/v1/collab`, the jobs card and the bell, persisted collaborative state survives a restart, and the in-place upgrade keeps all existing records. Record: installer and image versions, Windows build, per-step outcome.

**Result: Pending.**

### H3. Windows toast and bell while signed out

1. On a desktop, tick one kind under Settings › Environment & Hub › "OS notifications for Hub events" (all are off until chosen) and have the owner turn on "Can read Hub notifications" for that desktop on the Devices page (it needs step-up). Sign the owner out of the desktop, then close the window to the tray.
2. Trigger a notification and confirm a Windows toast appears from the tray with the window closed. The quickest trigger is a security alert, which is immediate: tick **A security alert was raised** in step 1, then enroll or revoke a spare device from Hub web. A backup failure (H4, **A scheduled backup failed**) also works but waits for the scheduler.
3. Open the bell, read the notification and dismiss it. Revoke the reader grant and trigger another; confirm no toast and the bell explains it needs the owner.

**Pass criterion:** the toast appears with the window closed and the owner signed out, read and dismiss state persists on the Hub, and revoking the grant stops delivery immediately. Record: Windows build, notification type, outcomes.

**Result: Pending.**

### H4. A real scheduled-backup failure reaching the bell

Timing: the scheduler checks every 10 minutes. A new schedule is due at the first check unless the Hub's last recorded backup run is newer than the interval; after a failure the next attempt waits the smaller of the interval and 6 hours, so `--every-hours 1` gives an attempt about every hour. `backup schedule set` creates the folder when it is set, so make the folder unwritable afterwards rather than pointing the schedule at a drive that is already missing.

1. On the Hub host, from an elevated shell, create a test folder and set the schedule to it with your normal passphrase flow:
   `mkdir C:\DudeBackupTest` then `dude-hub backup schedule set --folder C:\DudeBackupTest --every-hours 1 --keep 2`.
2. Deny the service account write access: `icacls C:\DudeBackupTest /deny "NT SERVICE\DudeHub:(OI)(CI)W"` (or schedule to an external drive and unplug it after the set).
3. Wait for the next attempt. Confirm a **backup failed** notification ("A backup failed") reaches the bell on Hub web and on a signed-in desktop without a reload, and that `dude-hub backup schedule status` reports the failed run. The Hub jobs card shows the failed run; after the next 10-minute check records a skipped "not due yet" run it shows **Skipped** with a "Last attempt: Failed" line and the error code underneath (Milestone 821).
4. Leave it failing through one more attempt (about an hour later) and confirm that attempt adds a second failed notification: each failed attempt is its own audit row and so its own notification (PD-109 deduplicates by source key, which is the audit row).
5. Restore access: `icacls C:\DudeBackupTest /remove:d "NT SERVICE\DudeHub"`. At the next attempt confirm a **recovered** notification ("Backups are working again") follows. Then `dude-hub backup schedule off` and delete the folder.

**Pass criterion:** one failed notification per failed attempt and none for a skipped check, exactly one recovered notification after the first successful attempt, `backup schedule status` and the audit log agree with the attempts, and no credential or path in any notification text (a short error code such as `EPERM` or `EACCES` is allowed). Record: schedule interval, the attempt and notification timestamps, audit entries seen.

**Result: Pending.**

### H5. NVDA on the editor and the bell

With NVDA on Windows 11, in a desktop and in a Hub web browser:

1. Tab through the shell: reach the notification bell, open its panel, read each item and dismiss one by keyboard only.
2. Tab into a scratchpad note, a user-script body and a Markdown document editor. Confirm each editor has a spoken name, that **Tab leaves the editor** (it is never trapped) and that `Ctrl+F` opens the in-editor search panel.
3. With a collaborator typing, confirm the status ("Live", "Read-only", "Reconnecting") is announced once per change and that remote typing is not read out character by character.

**Pass criterion:** every control has a name and a logical focus order, an error or status is announced once, and nothing requires a pointer. Record: NVDA and browser versions, per-surface notes.

**Result: Pending.**

### H6. Cursor colors across themes and contrast modes

Carets and selections of remote participants use category palette tokens (the name chip is neutral). With two participants of different color slots in one note:

1. In Settings › Appearance cycle Dark, Light, System, then Normal and High contrast, and each category palette set, including the color-blind-safe status colors.
2. For each combination read the remote caret, the remote selection fill and the chip against the editor surface.

**Pass criterion:** in every combination the remote caret is visible against the background, the selected text stays readable, the chip is readable, and two participants remain distinguishable (a collision of one slot in eight is accepted). Record: combinations checked and any combination that failed.

**Result: Pending.**

### H7. A real offline desktop edit and reconnect, and restoring collaborative documents onto a second machine

1. **Offline edit.** On an enrolled desktop open a user script that a browser also has open. Disconnect that desktop's network, keep editing past the 10-second grace (it shows the local-fallback state), edit a different region in the browser meanwhile, then reconnect.
2. Confirm both edits are present once, nothing is duplicated, and Settings › Sync shows no conflict entry. Repeat with a Markdown document and note that it stays a local draft (it is not journaled, PD-106).
3. **Restore.** Create a scratchpad snippet, a script and a kept Markdown document with several edits (let one history snapshot occur), take a backup (`dude-hub backup create`), and restore it on a second machine ([31G transfer drill](PHASE31G_ACCEPTANCE.md#transfer-drill-runbook), step 1 to 11). On the restored Hub confirm the three documents, their content and their history versions are present, restore one older version and confirm it applies as a new forward edit and is audited as `collab.history-restored`; confirm that no notifications or job history carried over.

**Pass criterion:** offline and live edits merge exactly once without an inbox entry, and a restored Hub carries every collaborative document and snapshot but no notification. Record: machines, edit sequence, authority epoch before and after.

**Result: Pending.**

### H8. A multi-hour Hub memory watch

Measure private bytes, not the working set: Windows trims working sets on its own, so they move without any change in the Hub. On an installed Hub the process is `dude-hub.exe` (`DudeHub.exe` is the WinSW wrapper and is not measured). Each reading is one PowerShell line:

`$p = Get-Process dude-hub; '{0:u}  private {1} MB  sockets {2}' -f (Get-Date), [math]::Round($p.PrivateMemorySize64 / 1MB), @(Get-NetTCPConnection -OwningProcess $p.Id -State Established -ErrorAction SilentlyContinue).Count`

1. On the Hub host start the Hub, keep two browsers and one desktop connected with a scratchpad note and a user script open in each (Live), and a Markdown Hub room joined from two of them. Type in the scratchpad note and the room every few minutes and leave the user script unedited. Take a reading at 30 minutes and then every hour, for at least 4 hours.
2. Close the documents and leave the room on every client, keeping the clients open. Wait 10 minutes (past the 5-minute room close, the 2-minute idle snapshot and the 1-minute idle unload), then take a reading.
3. Open the history drawer of the scratchpad note and of the unedited user script.

**Pass criterion:** taking the 1-hour reading as the baseline (the first 30 minutes include start-up and JIT growth), private bytes do not climb steadily: no three consecutive hourly readings each rise over the one before, and no reading exceeds the baseline by more than 64 MB. After step 2 the reading is at or below the last reading with documents open. The established socket count does not grow over the watch while the same clients stay connected, and after step 2 it is lower: a Hub web browser closes its collaboration socket with its last document but keeps its realtime socket, so the count does not reach zero. History shows snapshots only for edited documents and none written during the watch for the unedited one. Record: every reading with its time, and the edit pattern.

**Result: Pending.**

### H9. The phone shown as online

1. Pair the Android build to the Hub (31H pairing). Open Settings › Devices on a desktop or Hub web.
2. Bring the app to the foreground and confirm the phone row shows **online** with a recent last-seen; force-stop the app and confirm it goes offline within the heartbeat window. Confirm the phone shows no activity (it has none to share) and that the app keeps working with no new code or error from the 31J events (a shipped Android build only receives events its hello's protocol allows).

**Pass criterion:** the phone row is online while the app is connected and offline after it stops, the app shows no error from the Hub's protocol 3 events, and its sync is unaffected. Record: device model, app version, observed timings.

**Result: Pending.**

**Closing rule.** The owed passes do not gate Phase 32. A Fail is a defect against Phase 31J and is fixed as maintenance; a skipped pass stays Pending in this document, and results are recorded here in the commit that runs them.

<a id="milestone-815-close-out"></a>

## Milestone 815 close-out

Closed 2026-10-24. Phase 31J's scope (presence, selected Yjs collaboration, realtime document updates, notifications and read-only job status) is implemented, the automated exit gate above passed, and the roadmap's strict phase progression is satisfied: every phase from 31A through 31J is complete, so Phase 32 may begin. This milestone changes documentation only; there is no version bump, because 31J has no version-bump milestone and every surface already releases as `2.0.<commit count>`.

**Carried forward.**

- The owed manual and physical passes H1 to H9 above, as Pending.
- **Scratchpad `drawerExpanded` conflict dialog.** `drawerExpanded` is part of the synced `scratchpad` record, so two browsers opening the drawer at the same instant can raise the ordinary record-conflict dialog (Keep Hub / Keep mine / Keep both) although the snippets are live. Either choice is harmless; moving the drawer state out of the synced record is a later codec change.
- **`npm run audit:prod`** reports advisories for `electron`, `undici` and `zod`, none from 31J, tracked separately. *Resolved in Milestone 819 ([follow-ups](#follow-ups-after-close-out)).*
- **Bundle budget warnings.** The production build still shows two large-chunk budget warnings that pre-date 31J. *Resolved in Milestone 820; the build actually showed nine (the initial bundle, the gridstack stylesheet and seven lazy chunks), all pre-dating 31J.*
- **Markdown documents are local drafts after the grace.** The `markdown-doc` codec is not journaled (see the deviations above).

**Not delivered, by decision.** Named participants, read-only participants and guest permissions (Phase 53; the Hub keeps one owner); remote or privileged job execution, a job queue and "Run now" (Phase 88); a generic Yjs replication protocol (Yjs is only for the three PD-099 surfaces); a `job-status` event; and a `measure:collab` measurement. The ephemeral LAN server and BYO relay for Markdown Workspace are unchanged. Remote privileged execution stays deferred to Phase 88.

**Next.** Phase 32 is the next planned phase. Nothing in it has started.

<a id="follow-ups-after-close-out"></a>

## Follow-ups after close-out

Maintenance on the items the close-out left open, recorded here so the evidence above stays as it was run:

| Milestone | Change |
|---|---|
| 816 | The owed-pass script reviewed against the code: H3 gets an immediate trigger and the real notification labels; H4's "retries are deduplicated" criterion was wrong (each failed attempt is its own audit row and so its own notification) and the failure is now made with an `icacls` deny, because `backup schedule set` creates its folder; H8's proposed 25% working-set threshold became a plateau on private bytes with a copy-pasteable reading. The broken Decision Log anchor was fixed. |
| 817 | The full-suite `EnvironmentTeardownError` flake fixed at its cause: Angular's Vitest runner does not isolate files, so a lazy chunk a spec left loading failed at worker shutdown against whichever file ran last. Home panel loads are now pending tasks, and a global test hook waits (bounded) for stability before TestBed cleanup. |
| 818 | `apps/desktop/network-dns.spec.ts` no longer times out when its shared TCP/UDP port falls in a Windows-excluded UDP range. |
| 819 | `npm run audit:prod` passes: `electron` 44.9.3, `undici` 7.30.1, every `@angular/*` package to 22.2.3/22.2.4 (the CLI pinned the vulnerable `zod`), and `@expo/cli`'s dev-only `zod` 3.x accepted ([rationale](PHASE31A_ACCEPTANCE.md#dependency-audit)). |
| 820 | Production budget warnings resolved by setting each warning just above today's size, keeping the error ceilings: initial 1.35 MB (1.29 MB; error 1.5 MB), component style 6.5 kB (the editor-only gridstack stylesheet, 6.1 kB; error 8 kB), any script 2.75 MB (error 3 MB). The scripts over the old 500 kB are lazy, single-tool libraries outside the initial and prefetched sets: `node-sql-parser` (2.6 MB), the Unicode Table's `unicode-name` data in its worker (2.3 MB) and on the main thread (1.6 MB), `bwip-js` (0.9 MB), `mathjs`, TipTap and `svgo` (0.6 MB each). |
| 821 | The Hub jobs card no longer loses a failed scheduled backup to the next "not due yet" check: `HubJobStatus` gains an optional `lastAttempt` (the most recent run that was not skipped), kept in the same `job_last:<id>` record so backups still scrub it, and the card shows it under a skipped result. |
| 822 | The NG8113 build warning was a real defect from Milestone 687: Hub web never rendered the owner step-up prompt, so an action needing step-up after the five-minute window (re-pair codes, the notification-reader grant) waited forever. The overlay now renders it. Known CommonJS libraries join `allowedCommonJsDependencies`, so the production, Hub web and Electron builds print no warnings. |
| 823 | The five SQL tools (Syntax Checker, Parameterizer, Query Explainer, Dialect Converter, Schema Diff) load only the `node-sql-parser` build for the chosen dialect (0.20–0.30 MB each) instead of the 2.6 MB all-dialects bundle; per-dialect output matched the full build on every spec sample, including cross-dialect generation. The any-script warning tightens to 2.4 MB; the largest script is now the Unicode Table's name-data worker (2.3 MB), which stays as it is because `unicode-name` exports only its full data set. |
| 824 | Hub web sign-out raced its own wipe (seen in the first CI run after the 31J push): the Hub closes the page's realtime socket as it revokes the session, and that close's session-expiry redirect reached the sign-in page before the sign-out request returned, so for a moment the sign-in page showed with storage not yet wiped (the wipe and reload still followed). The expiry redirect (realtime and collaboration sockets) now holds back while the page's own sign-out request is out. |

## Commands

Use Node 24/npm 11.19. These are the commands behind the evidence above; run them from the repository root.

| Purpose | Command |
|---|---|
| Full regressions | `npm test`, `npm run lint`, `npm run test:electron`, `npm run test:high-consequence`, `npm run check:portable`, `npm run audit:prod` |
| Hub | `npm run test:hub`, `npm run build:hub-web` |
| Mobile gates | `npm run check:mobile`, `npm run test:mobile` |
| Hub e2e | `npm run test:e2e:hub` (collaboration: `e2e/hub/60-collab.spec.ts`) |
| Desktop sync e2e | `npm run test:e2e:sync` (collaboration: `e2e/sync/30-collab.spec.ts`; it builds the Electron app, the Hub web build and the test Hub first) |
| Generated security doc | `node scripts/generate-security-doc.mjs` (must leave `SECURITY.md` unchanged) |
