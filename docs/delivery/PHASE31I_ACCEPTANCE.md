# Phase 31I implementation and acceptance evidence

**Status: implementation complete (Milestones 729–784); the exit gate and DUDE 2.0 are pending the manual passes below.** Forty executable Android tools, the Share-to-DUDE inbound route, camera scanning and the on-device Maestro harness are built, and the final automated gate passed on `9f0575ce` on 2026-10-22. Protected signing ([group A](#a-protected-signing)) passed on 2026-10-23, and `master` was pushed the same day: the first CI run of the Android tool journeys (run 39889069778 on `dd0a801a`) is green, with all 43 journeys passing on API 29 and API 36 (Regex Tester needed its one retry on API 36). On 2026-10-23 the physical-phone passes ran on a Galaxy S25 Ultra (SM-S938W, Android 17 / API 37, arm64) against the protected `0.0.1017` build: groups C, D, E and most of B are recorded below, group F is partly recorded, and the owed 31B–31G passes (group G) are **not** recorded and are not claimed here. Each physical result says whether it was verified by the agent (adb, Hub database, Hub audit log) or reported by the owner, and what is still open; the 31H-carried passes are folded into the same gate ([PD-084](PHASE31I_PLAN.md)). DUDE 2.0 is declared only at Milestone 786, after every row in [section 3](#dude-20-definition-of-done-status) and every step in the [guided manual script](#guided-manual-acceptance-script) passes.

## Implemented scope

The map is as built in [the Phase 31I plan](PHASE31I_PLAN.md#milestone-map); the decisions are [PD-084–PD-097](PHASE31I_PLAN.md), and the as-built contracts are the Phase 31I sections of [System](../architecture/SYSTEM_ARCHITECTURE.md), [Data and sync](../architecture/DATA_SYNC_ARCHITECTURE.md) and [Security](../architecture/SECURITY_ARCHITECTURE.md). The locked tool list had no reserve swap.

| Milestone | Implementation |
|---|---|
| 729 | Decisions PD-084 to PD-097 and the merged 31H/31I gate |
| 730–735 | Framework: mobile engine host, polyfills and per-region boundaries (730); portable QR/barcode scan classification (731); tool host, runnable-first catalog, local Recents and background wipe (732); bwip-js barcode engine on every surface with DataMatrix, PDF417, Aztec and GS1-128 (733); generated "Also on Android" badge (734); kit, `defineTextTool`, haptics and synced tool preferences (735) |
| 736–744 | base64, url-encode, hex-text-converter, number-base, case-converter, slug-generator, whitespace-cleaner, unicode-normalization, text-inspector |
| 745 | device-info on web and desktop, with the read-only `dude:deviceInfo:osFacts` bridge |
| 746–749 | uuid, password-generator, password-strength-analyzer, hmac-generator |
| 750 | worklets Bundle Mode off-thread runtime and its spike evidence |
| 751–756 | url-inspector, http-status, user-agent, cookie-tools, color-converter, contrast-checker |
| 757–762 | unix-timestamp, cron, timezone-offset-comparator, duration-formatter, jwt, json-flatten |
| 763–766 | regex, cidr-calculator, chmod-converter, semver-comparator |
| 767–772 | hash, json, yaml-json, xml-formatter, csv-viewer, diff (the six off-thread tools) |
| 773 | File open, Photo Picker, save and share, with the storage and media permissions blocked |
| 774 | device-info on Android |
| 775–778 | qr-code-scanner, barcode-reader, qr-code-generator, barcode-generator |
| 779 | Share-to-DUDE inbound with Smart Paste suggestions and in-memory prefill |
| 780 | On-device tool-journey harness on API 29 and API 36, with keyboard-back and input fixes |
| 781 | Kit consolidation: `SecretField`, `SingleLineField` and `useOffThreadRun` with cancellation |
| 782 | Serial SQLite gate (`apps/mobile/src/storage/serial-gate.ts`) that fixes the first-launch native crash, shell-level keyboard Back, harness retries default 1 and batches of 8 flows |
| 783 | Flag-gated on-device measurement screen and `measure-mobile.mjs --tools`, measured input budgets, kit main-thread budget, emulator-fixture release thresholds |
| 784 | As-built documentation, recipe, deviations, measured budgets and thresholds |
| 785–786 | Not landed: acceptance evidence from the guided script (785) and DUDE 2.0 (786, only after every Definition of Done item has evidence) |

Two unnumbered fix commits sit between milestones: gate findings after 772 (Device Info coverage exclusions and mobile lint directives) and the data-scope inventory declaration for the Share-to-DUDE in-memory store after 779. Not built, by decision (PD-096): the NFC inspector, BLE scanner, camera OCR, network diagnostics, pipelines and the Smart Paste page on mobile, background work, request-bearing tools and iOS.

## Recorded verification

### Final automated gate

Run on HEAD `9f0575ce`, 2026-10-22, on the Windows 11 development host.

| Gate | Result |
|---|---|
| `npm test` | **691 package files / 4,686 tests** passed, and **778 Angular files / 8,380 tests** passed. One Angular file, `home-paste-drop-hero.spec.ts`, hit a Vitest `EnvironmentTeardownError` in the full run and passed **5/5** on an isolated rerun. This is a known full-suite flake, not a regression. |
| `npm run lint` | Passed: eslint, boundaries (package and mobile), design tokens **0 violations**, theme contrast **144 combinations / 49,008 checks**, and the workspace and data-scope inventories. |
| `npm run check:mobile` | Passed. |
| `npm run test:mobile` | **41 node tests** and **44 Vitest files / 345 tests** passed. |
| `npm run mobile:bundle` | Hermes export passed with the mobile production bundle boundaries checked over **3,049 source-map entries**. The measurement harness is absent from the normal bundle (the shipped bundle carries no `DUDE_MEASURE` string). |
| `npm run check:portable` | **1,312 ESM export modules**. |
| `npm run test:electron` | **115 files / 1,213 tests** passed, **1 skipped**. |
| `npm run test:high-consequence` | Passed. |
| Production web build | Passed. Hard-navigated `/DUDE/tools/barcode-generator`, `/DUDE/tools/device-info` and `/DUDE/tools/qr-code-scanner` on the production build: each rendered, the "Also on Android" badge showed and there were no console errors. |

### On-device evidence (emulator fixtures)

**These are disposable-key emulator fixtures, not protected preview artifacts.** The APK and AAB below are signed with a throwaway key, are x86_64-only and carry no distribution claim. They do not satisfy the protected signing, signed-install or physical-phone requirements, which stay pending.

| Evidence | Result |
|---|---|
| Maestro journeys | **43 flows** (shell 01 and 02, 03-share through an `adb` SEND intent, and **40 tool flows**) passed on the **API 36** release fixture **on the first attempt with retries disabled** (`DUDE_E2E_RETRIES=0`), at font scale 1.5. On **API 29** every flow passed, but in several pieces, because the emulator lost its `adb` connection when the host suspended; that is not an app failure. The harness now defaults to one retry and batches 8 flows per Maestro session (`DUDE_E2E_BATCH`). At Milestone 781, before the crash fix, two API 36 flows and most API 29 flows needed re-runs, mostly as cascades after the first-launch crash. |
| First-launch SQLite fix | Root cause: a use-after-free in expo-sqlite 57.0.3 (`closeAsync` finalizes statements the Kotlin side does not know are finalized, and `getColumnNamesAsync` does not check the database is open). Reproduced on demand (six `getAllAsync` calls racing `closeAsync`: 2 of 2 runs of 300 iterations crashed) and fixed by the serial statement gate. **0 crashes in 40 fresh-data launches on each API.** The physical-phone launch evidence is part of the physical pass. |
| Off-thread spike (M750) | react-native-worklets 0.10.1 Bundle Mode, release builds, inputs of about 200 KB. The six heavy engines (`processJson`, `convertYaml`, `processXml`, `parseCsv`, `computeLineDiff`, `computeHashes`) ran on the worker and matched the JS-thread reference by JSON equality on both APIs; error propagation (`RangeError`) and cancellation (running and queued jobs aborted, fresh job afterwards) also passed. The longest JS-thread tick gap while a job ran was 18–37 ms (a 10 ms timer), so the JS thread stayed free. Off-thread work does not make an engine faster: csv-viewer took 4.1–5.5 s for about 200 KB either way, hence its input cap. Full table in the [plan](PHASE31I_PLAN.md#off-thread-spike). |
| Measured input budgets (M783) | Rule: a cap stays if its 100 percent run finishes in 3 s or less on API 29 with a longest tick gap under 100 ms. hash dropped from 2 MiB (22.9 s) to **128 KiB** (1.6 s); csv-viewer from 512 to **384 KiB** (4.0 s to 2.3 s); JS-thread tools gained a kit budget (default 128 KiB, base64 256 KiB, case-converter 64 KiB); json, yaml-json and xml-formatter keep 2 MiB, diff 512 KiB per side, regex 64 KiB. Json's tick-gap margin is thin (71 ms API 29, 85 ms API 36 in a fresh process). See [measured input budgets](PHASE31I_PLAN.md#measured-input-budgets). |
| Startup and memory | Cold activity display (`am start -W`, worst of three): **983 ms API 29, 1,503 ms API 36** (these are activity display times, not JS-interactive readiness). PSS after startup: **129,793 KiB API 29, 92,821 KiB API 36**. Measurement build, after formatting 2 MiB of JSON: PSS 237,747 / 180,457 KiB; peak RSS after the full tool run 447,028 / 383,952 KiB. |
| Artifact sizes (x86_64-only fixtures) | APK **99,263,946 B**, AAB **43,467,879 B**; Hermes bytecode **7,759,356 B** (ABI independent, the portable number). The published arm64-v8a preview will differ. |
| Emulator-fixture thresholds | Measured plus 25 percent, recorded in the [plan](PHASE31I_PLAN.md#emulator-fixture-release-thresholds). They gate regressions on the emulator fixture and are not promises about phones; physical thresholds come from [section F](#f-physical-measurements). |
| Merged-manifest permissions | The merged release manifest requests `CAMERA`, `INTERNET`, `VIBRATE` and `ACCESS_NETWORK_STATE`, plus AndroidX's non-exported-receiver signature permission. Removed with `tools:node="remove"`: `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, every `READ_MEDIA_*`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW` and `ACCESS_WIFI_STATE`. The native privacy test asserts the list. File open and Save use the Storage Access Framework, image scanning uses the Photo Picker, and Share-to-DUDE accepts only `content:` URIs. |

### Per-tool Maestro result (condensed)

Build: disposable-key release fixture, font scale 1.5. All 40 tool flows and the three shell flows passed on both APIs at the final run above. The per-flow table below is from the Milestone 780–781 batch run (42 flows per API; every flow passing on its final attempt), kept to show the per-tool coverage and durations; the retries it records were mostly cascades after the first-launch crash fixed in Milestone 782.

| Group | Tool flows (final attempt API 36 / API 29, seconds) |
|---|---|
| Native (5) | Barcode Generator 44 / 43; Barcode Reader 74 / 75; QR Code Generator 42 / 45; QR Code Scanner 66 / 70; Device Info 45 / 46 |
| Encoding (6) | Base64 36 / 36; URL Encode 34 / 36; Hex/Text 32 / 35; Number Base 31 / 34; Color Converter 53 / 58; Contrast Checker 73 / 76 |
| Text (6) | Text Inspector 39 / 47; Case Converter 33 / 38; Slug 33 / 34; Whitespace 24 / 22; Text Diff 27 / 29; Unicode Normalization 26 / 30 |
| Data (5) | JSON 28 / 28; YAML/JSON 34 / 37; XML 41 / 42; CSV 20 / 21; JSON Flatten 23 / 25 |
| Security (6) | JWT 89 / 85; Hash 12 / 15; HMAC 41 / 41; UUID 45 / 47; Password Generator 34 / 38; Password Strength 29 / 30 |
| Date-time (4) | Unix Timestamp 65 / 64; Cron 53 / 53; Timezone Comparator 78 / 81; Duration 31 / 30 |
| Web (4) | URL Inspector 22 / 24; HTTP Status 28 / 28; User-Agent 16 / 21; Cookie Tools 52 / 52 |
| Developer (4) | Regex 106 / 112; CIDR 41 / 43; chmod 48 / 51; Semver 54 / 55 |
| Shell (3) | 01-shell 25 / 23; 02-settings 57 / 54; 03-share 8 / 7 |

Camera decoding is not exercised on emulators (paste, image and permission-denial paths only), so it is a physical-phone item. Maestro cannot type non-ASCII text, newlines or some quotes, so those flows use Sample buttons.

### Still not recorded

Recorded on the physical phone on 2026-10-23 (see groups B to F): the protected install, the 43 journeys, camera scanning, Share-to-DUDE and file open/save, TalkBack, LAN and Tailscale pairing, offline replay, Hub restore and re-pair, revocation, changed authority with a regressed Hub, the incompatible-Hub refusal, and startup and memory.

Still not recorded: per-tool physical timings and physical thresholds (they need the flag-gated measurement build); enrolled catch-up and database/outbox figures; JS-interactive startup readiness; font scale 2.0 and bare-link checks on the phone; the active/next pin rotation on the phone; the missing-Keystore and corrupt/full-storage failure cases (they need a rooted or debuggable build, so treat them as automated-only unless a way is found); and the owed 31B–31G manual passes (group G).

## DUDE 2.0 Definition of Done status

One row per item of the [DUDE 2.0 Distributed Release Definition of Done](QUALITY_AND_RELEASE.md#dude-20-distributed-release-definition-of-done--all-planned). The **Box** column is the checkbox as it stands in that document; this record does not tick or untick any of them. A box is ticked only when its evidence is recorded in a phase acceptance document, and the remaining boxes are reconciled at Milestone 786 after every row here passes. Status values: **Evidence recorded**, **Automated evidence recorded with manual pass owed** or **Pending**.

| # | Item | Box | Evidence location | Status |
|---|---|---|---|---|
| 1 | Delivered Windows tools, routes, projects/workspaces/pipelines, history, appearance, setup and native safety retain their behavior | [ ] | [31A](PHASE31A_ACCEPTANCE.md) registry baseline; [31B](PHASE31B_ACCEPTANCE.md) store migration; this document: `npm test`, `test:electron`, `test:high-consequence` and the production web build | Automated evidence recorded with manual pass owed (installed NSIS pass, [31B](PHASE31B_ACCEPTANCE.md#owed-manual-verification), step G1) |
| 2 | Standalone Windows and GitHub Pages/PWA usage require neither Hub nor account | [ ] | [31B](PHASE31B_ACCEPTANCE.md) and [31C](PHASE31C_ACCEPTANCE.md) standalone specs; [31E](PHASE31E_ACCEPTANCE.md) Pages `test:e2e`; [31H](PHASE31H_ACCEPTANCE.md) standalone shell; this document: hard-navigated production routes | Automated evidence recorded with manual pass owed (G1) |
| 3 | Framework-neutral engines, domain/contracts/validation/registry/sync packages have enforced platform boundaries and shared fixtures | [ ] | [31A](PHASE31A_ACCEPTANCE.md); this document: lint boundaries (package and mobile), `check:portable` 1,312 modules, `check:mobile`, the 40 Maestro journeys against shared-engine vectors | Evidence recorded |
| 4 | Existing desktop state migrates safely into scoped repositories/Device Store with interruption recovery and secure credential references | [ ] | [31B](PHASE31B_ACCEPTANCE.md): migration runner (interrupted step, checksum, backup), hard-kill, clone; this document: `test:electron` 115 files | Automated evidence recorded with manual pass owed (installed NSIS migration, G1) |
| 5 | A distributed environment has exactly one user-owned authoritative Hub, separate canonical SQLite WAL persistence and independent background-service lifecycle | [ ] | [31C](PHASE31C_ACCEPTANCE.md): canonical WAL repository, service lifecycle `check:hub-service`; [31G](PHASE31G_ACCEPTANCE.md) authority epoch and fence | Automated evidence recorded with manual pass owed (installed service and elevated runs, G2) |
| 6 | Owner authentication, recovery, device registration and revocation work without mandatory external identity/application/database services | [ ] | [31C](PHASE31C_ACCEPTANCE.md): owner identity, recovery, device registry, revocation; [31F](PHASE31F_ACCEPTANCE.md) step-up; [31H](PHASE31H_ACCEPTANCE.md) Android Ed25519 enrollment | Automated evidence recorded with manual pass owed (Windows Hello and installed Hub, G2); physical Android enrollment, re-attach re-pair and revocation recorded in B |
| 7 | At least two enrolled desktop installations synchronize environment preferences, favorites, selected projects/workspaces and pipeline definitions with explicit consent and scope | [x] | [31D](PHASE31D_ACCEPTANCE.md) (`sync-integration.spec.ts`, `10-two-desktops.spec.ts`) | Evidence recorded; the two-physical-machine pass is owed (G3) and stays owed |
| 8 | Offline changes survive restart, replay idempotently and expose revision conflicts, rejected operations and deletes safely | [x] | [31D](PHASE31D_ACCEPTANCE.md) (desktops); [31H](PHASE31H_ACCEPTANCE.md) host and emulator replay | Evidence recorded for desktops; physical Android offline edit, force-stop, reconnect and replay recorded in B (owner-reported, plus Hub-side evidence for the restore case) |
| 9 | Device/private settings, native paths/endpoints, secrets, ephemeral inputs and local journals/history do not leak into ordinary synchronization | [x] | [31D](PHASE31D_ACCEPTANCE.md) (desktops); this document: tool inputs and the share store stay in memory, data-scope inventory passed in `npm run lint` | Evidence recorded |
| 10 | Hub-hosted Angular supports authenticated environment access, browser-local safe tools, direct routes and realtime foundation | [x] | [31E](PHASE31E_ACCEPTANCE.md) (private mode, `40-routes-sweep.spec.ts`) | Evidence recorded; the two-machine browser pass is owed (G3) and stays owed |
| 11 | Private mode is default; deliberate Internet mode passes security/readiness gates without exposing raw native services | [ ] | [31E](PHASE31E_ACCEPTANCE.md) private mode; [31F](PHASE31F_ACCEPTANCE.md) readiness gate, ACME against a fake server, reachability echo | Pending (real Let's Encrypt, off-LAN from a phone on cellular, elevated Hub service runs, G4) |
| 12 | Hub downtime leaves installed local tools/cached state useful and accurately disables unavailable synchronization/collaboration | [ ] | [31D](PHASE31D_ACCEPTANCE.md) Hub downtime and offline outbox; [31E](PHASE31E_ACCEPTANCE.md) read-only start with the Hub unreachable; [31H](PHASE31H_ACCEPTANCE.md) cached favorites after restart; this document: 40 tools run fully offline (no Hub API reachable from a tool screen) | Automated evidence recorded with manual pass owed (physical offline pass, B; installed web offline, G3) |
| 13 | A consistent encrypted backup restores on another machine; controlled transfer retains one authority and safely reconnects/rebases clients | [x] | [31G](PHASE31G_ACCEPTANCE.md) (second data directory, real processes) | Evidence recorded; the real second-machine pass is owed (G5) and stays owed. Android reconnect is part of B |
| 14 | React Native Android APK/AAB artifacts exist; the client authenticates/registers, synchronizes supported state and implements defined offline/cache behavior | [ ] | [31H](PHASE31H_ACCEPTANCE.md): disposable-key APK/AAB, native security tests (14), emulator journeys; this document: x86_64 fixture APK 99,263,946 B / AAB 43,467,879 B; protected signed APK/AAB locally and on draft `v0.0.1018` (A) | Evidence recorded on a physical phone (protected APK installed, enrolled by QR and paste over LAN and Tailscale, offline replay, restore and re-pair; B); the AAB and the arm64 sizes are not yet recorded |
| 15 | Approximately 30–50 named runtime-compatible mobile tools have usable native UI, appropriate input handling and parity verification; platform-specific/native tools are explicitly scoped | [ ] | This document: 40 tools (milestone table), 43 Maestro flows on API 29 and API 36, shared-engine vectors, measured budgets; [plan](PHASE31I_PLAN.md) (PD-085, no reserve swap) | Evidence recorded (all 43 journeys on a physical phone with no retries; camera scan, Share-to-DUDE, SAF and TalkBack passed, the last four as owner-reported results; C, D and E). Remaining: font scale 2.0 on the phone |
| 16 | Cross-client schema/protocol/version compatibility, installer/service lifecycle and upgrade/recovery behavior are verified and documented | [ ] | [31C](PHASE31C_ACCEPTANCE.md) N-1 to N update, version negotiation; [31G](PHASE31G_ACCEPTANCE.md) transfer and reconnect; [31H](PHASE31H_ACCEPTANCE.md) capability checks | Automated evidence recorded with manual pass owed (installer and service lifecycle, G1 and G2); the incompatible-Hub refusal is recorded on the physical phone (B) |
| 17 | [Distributed release verification matrix](QUALITY_AND_RELEASE.md#distributed-release-verification-matrix) risk-based verification and documentation deliverables pass; implementation evidence is recorded per stage | [ ] | 31A–31H acceptance documents and this one; documentation delivered in Milestone 784; first CI run of the Android journeys green (run 39889069778) | Pending (matrix rows depending on the physical, accessibility and owed manual passes) |
| 18 | Deferred remote execution, E2EE credential sync, automatic failover, multi-master, complete mobile tool parity and vendor-operated hosting are not implied by the release | [ ] | [31G](PHASE31G_ACCEPTANCE.md) (no automatic failover); [plan PD-096](PHASE31I_PLAN.md) exclusions; README and PRD scope text | Evidence recorded as scope statements; confirmed at Milestone 786 when the release notes are written |

Honest summary: no item is blocked by a failing automated gate. The pending rows are all physical, accessibility, real-network or installed-build passes that no emulator or host run can replace.

## Guided manual acceptance script

For the owner. Run the groups in order; each step is copy-pasteable. Record the evidence fields in the **Result** block under each group in the Milestone 785 commit, and mark Pass or Fail. A Fail is a defect to fix and rerun, not a note. Use a phone you own, with USB debugging on, and a profile you can wipe: the journeys clear the preview app's state. Node 24/npm 11.19, JDK 17, `ANDROID_HOME` and Maestro (`MAESTRO_PATH` when not on PATH) are required.

### A. Protected signing

1. In the repository's GitHub settings, create or open the `android-preview` environment and set the secrets `DUDE_ANDROID_KEYSTORE_BASE64`, `DUDE_ANDROID_KEYSTORE_PASSWORD`, `DUDE_ANDROID_KEY_ALIAS` and `DUDE_ANDROID_KEY_PASSWORD`. Do not paste any of them into a file in the repository or into a log.
2. On a clean `master` with full history (`git fetch --unshallow` if needed), export the keystore variables in your shell for this session only:

   ```
   export DUDE_ANDROID_KEYSTORE_PATH=<absolute path to the protected .jks>
   export DUDE_ANDROID_KEYSTORE_PASSWORD=<password>
   export DUDE_ANDROID_KEY_ALIAS=<alias>
   export DUDE_ANDROID_KEY_PASSWORD=<key password>
   git status --short   # must print nothing
   git rev-parse HEAD
   npm ci
   npm run mobile:package
   ```

   `mobile:package` fails explicitly when signing is missing; there is no unsigned or debug-key fallback.
3. Confirm the outputs in `dist/mobile-package/`: `DUDE-Preview-<version>.apk`, the matching `.aab` and `SHA256SUMS.txt`.
4. Verify the signer and the hashes:

   ```
   apksigner verify --print-certs dist/mobile-package/DUDE-Preview-<version>.apk
   keytool -printcert -jarfile dist/mobile-package/DUDE-Preview-<version>.apk
   sha256sum dist/mobile-package/DUDE-Preview-<version>.apk dist/mobile-package/DUDE-Preview-<version>.aab
   cat dist/mobile-package/SHA256SUMS.txt
   ```

   The signer certificate SHA-256 must **not** equal the disposable fixture signer `eed970cc5ed0657fa7783a1ca2581d443c782fc7d8a67d24daa51483d62161eb` recorded in [31H](PHASE31H_ACCEPTANCE.md).
5. After the pushed `master` build runs, check that the `android-preview` job attached the same APK, AAB and checksums to the **draft** release, and that the draft asset hashes match step 4. Do not publish the draft in this step.

**Evidence (recorded 2026-10-23):** commit `de506ce4` (clean tree); version name `0.0.1017` / version code `1017`; signer certificate SHA-256 `fb68df1f31f06932193a24358636266b8c81285c139450659e678bed150d097f` (`CN=DUDE Preview, O=DUDE`, RSA 2048, APK Signature Scheme v2; not the disposable fixture signer); APK SHA-256 `847b05ef256c5429e8be520fb0a99d777c425c18f0a970682af77afcd6f751c5`; AAB SHA-256 `8d4b799a00adc09ff4a9dd07c9e677fd8fcd52c9c0f0f0f792591c6085690086`; draft release `v0.0.1018` (unpublished, target `dd0a801a`, CI run 39889069778) carries `DUDE-Preview-0.0.1018.apk` `165f5274ce9c6559b32f5965971ccb4616d292dae22b3a525568ce8da0f176f8` and `DUDE-Preview-0.0.1018.aab` `8d73241caaee455a1457ecf348600fc06e513273451237d3b487cd39a3618ba6`, equal to the `mobile-package` job's `SHA256SUMS.txt`, and both carry the same signer certificate. **Result: Pass**

The draft hashes cannot equal step 4: the draft was built from a later commit (`dd0a801a`, the CI audit and npm-pin fix), and the release build is not byte-reproducible across machines (CI's build of `de506ce4` at `0.0.1017`, run 39883181314, produced APK `1d175e8eb645db1cf97c43302a10eb26432b8f9ee38d5cc012c5860a049894e6` and AAB `6c2a8e5c74f423e50678374d2e15b1a080127264806d7e6f034276ec12c3f94e`). Step 5 is therefore established by signer identity and draft-to-job checksum equality, which also proves the `android-preview` secret holds the same keystore as the local one. On Windows, `mobile:package` needs `JAVA_HOME` pointing at a JDK 17 (Android Studio's `jbr` works), and the variables are set with `$env:NAME = '...'` in PowerShell.

### B. Physical install and the 31H-carried passes

The list below is copied from the 31H remaining acceptance; the source is [PHASE31H_ACCEPTANCE.md](PHASE31H_ACCEPTANCE.md#remaining-native-and-physical-acceptance).

1. Install the protected signed APK from step A on the physical phone (`adb install -r dist/mobile-package/DUDE-Preview-<version>.apk`), launch it and confirm the shell opens with all five destinations. Record the device model, Android version and API level.
2. Exercise **LAN** and **off-LAN VPN/public** endpoints with the reviewed pin and the active/next rotation: pair with the Hub by QR and by paste, sign in, and confirm sync on both paths.
3. **Enroll, consent, edit offline, force-stop, restart and reconnect:** enroll the phone, accept category consent, turn on airplane mode, change a favorite and a setting, force-stop the app, restart it, reconnect and confirm durable replay, idempotent duplicate delivery and convergence with the desktop, with newer desktop edits preserved.
4. **Restore, import and re-pair** using a fresh signing key: keep the restored device ID, cached records and pending operations, and repeat category consent.
5. **Failure cases:** missing Keystore material; confirmed revocation; incompatible Hub capability or protocol; pin mismatch with no credential transmission; changed authority; expired cursor or regressed history; corrupt or full storage recovery.
6. **TalkBack, camera denial and paste, bare links, enlarged text, reduced motion and appearance combinations** on the physical phone (the screen-reader pass itself is in E).
7. Record startup, catch-up, memory, database and outbox measurements (the measurement commands are in F).

**Evidence (recorded 2026-10-23, throwaway test Hub with its data outside the repository; "verified" means checked by the agent over adb or in the Hub database and audit log, "reported" means stated by the owner):** Galaxy S25 Ultra SM-S938W, Android 17 / API 37, arm64; protected `0.0.1017` installed over `0.0.957` (verified).

- **Step 2, endpoints (reported):** paired by QR and by paste, signed in and synced over the LAN (`https://10.0.0.128:47600`) and off-LAN over Tailscale on mobile data (`https://100.103.46.94:47600`); the reviewed pin matched on both. The active/next pin rotation was **not** exercised.
- **Step 3, offline edit (reported):** consent, airplane mode, a favorite and a setting changed, force-stop, restart and reconnect; durable replay, no duplicates and convergence with the newer PC edit preserved.
- **Step 4, restore and re-pair (verified):** the Hub was restored from an encrypted backup (new Hub instance, authority epoch 2, new pin); the phone showed one pending edit, re-paired with a re-attach code and kept device `01a1670f-ea4f-734e-8552-e616ddd06106` and environment `01a16725-7a2a-71d7-b33d-6815bb67e33f`, repeated category consent, and the pending Base64 pin replayed (Hub audit: `device.enrolled`, `sync.snapshot`, `sync.pushed` with 3 applied, 0 duplicate; the Hub holds `tool:base64`).
- **Step 5, failure cases:**
  - *Pin mismatch (reported, consistent with the Hub log):* the app refused a pairing string with one pin character changed; the Hub audit shows no enrollment, redeem or credential use afterwards.
  - *Confirmed revocation (verified):* after `device.revoked` on the Hub the phone showed "The authenticated Hub confirmed this device was revoked", a read-only cache and preserved pending edits.
  - *Changed authority and regressed history (verified):* the older backup was restored over the Hub; the phone showed "Review changed Hub authority" with the previous and new Hub IDs, a recovery copy, and favorites 3 local against 2 on the Hub; after Merge and approval the Hub held the phone's favorites and sync went live with 0 pending and 0 conflicts.
  - *Incompatible Hub (verified):* a fake Hub answering protocol 99 received only `GET /api/v1/hello`; the phone refused with "This Hub needs Android category-filtered synchronization support. Update the Hub before pairing." and sent no credential, device ID or key.
  - *Disconnect (verified):* a disconnect that could not reach the Hub left the Hub row active, as the app warns; the owner revoked the row, a fresh pairing code enrolled the phone again with the same device ID, and consent was repeated. Why that disconnect reported the Hub as unreachable while it was running was not investigated (a VPN drop is the likely cause).
  - *Not exercised:* missing Keystore material, and corrupt or full storage recovery (they need a rooted or debuggable build).
- **Step 6, (reported):** TalkBack, camera denial and re-grant, reduced motion and the appearance combinations passed; font scale 2.0 and bare links were not exercised on the phone.
- **Step 7:** startup and memory are in F; enrolled catch-up, database and outbox figures are not recorded.

**Result: Partial.** Steps 1 to 4 and the revocation, authority, regressed-history and incompatible-Hub cases pass; the pin rotation, the missing-Keystore and storage cases, font scale 2.0, bare links and the measurements remain open.

### C. Tool journeys and camera on the phone

1. Install the same build, enable USB debugging, and confirm the phone is the only intended target:

   ```
   adb devices
   export ANDROID_SERIAL=<phone serial>
   ANDROID_SERIAL=<phone> npm run test:e2e:mobile
   ```

   The runner enlarges font scale, clears the preview app's state before each journey and restores the previous font scale afterwards. Reports and screenshots are written to `test-results/mobile/<serial>/`.
2. Confirm all **40 tool flows** plus the shell flows pass. Record the count of flows that needed a retry (a flow that passes only on retry is listed in `flaky.json` and must be investigated, not accepted).
3. **Camera, QR:** open QR Code Scanner, tap **Scan**, allow the camera when asked, scan a printed or on-screen QR code of a known URL, and confirm the classified kind, the redacted payload for a sensitive one (a Wi-Fi password or an `otpauth` secret) and that a URL opens only after the confirmation card.
4. **Camera, barcode:** open Barcode Reader, scan a real **EAN-13** barcode, and confirm the digits, the format and the check-digit result.
5. **Camera denial and re-grant:** reinstall or clear permissions, tap **Scan**, **deny** the camera, confirm the paste and image paths still work; then tap **Scan** again, grant the permission in system Settings and confirm scanning works without restarting.

**Evidence (recorded 2026-10-23):** `ANDROID_SERIAL` `R5CY22YFHVL`; **43 of 43 flows passed with 0 retries** (verified; `flaky.json` was not written), in 7 batches of at most 8 flows, about 32 minutes in total; report path `test-results/mobile/R5CY22YFHVL/`. Camera, reported by the owner: a URL QR code scanned, was classified as a URL and did not open without confirmation, the Wi-Fi payload was redacted, and an EAN-13 barcode decoded (the scanned values were not recorded). Camera denial and re-grant (reported): scanning worked after granting the permission in Settings without a restart; the denied-state message and the paste and image paths while denied were not explicitly confirmed. **Result: Pass** (the camera steps are owner-reported).

### D. Share-to-DUDE, file open and save from real apps

1. **Text from a browser:** select text (for example a JWT and a JSON snippet) in a browser, Share, choose DUDE, and confirm the suggestions list shows runnable tools only. Confirm nothing ran until you chose a tool, and that a JWT preview is redacted.
2. **Image from Photos:** share a photo of a QR code to DUDE and confirm it routes only to the QR Code Scanner or Barcode Reader and decodes.
3. **A `.pem` file from a file manager:** share a certificate or private-key `.pem` and confirm the preview is redacted and no tool auto-runs.
4. **No persistence:** after sharing, force-stop and reopen the app and confirm the shared content is gone, is not in Recents and does not appear in sync status.
5. **SAF open and save:** in a text tool, use **Open** to pick a small `.txt` or `.json` file through the system document picker (a file over 2 MiB, a binary or a UTF-16 file must be rejected with a message), then **Save** the output through the SAF folder picker and open the saved file in a file manager.
6. Confirm the app shows no storage or media permission prompt at any point.

**Evidence (recorded 2026-10-23, reported by the owner):** steps D1 to D6 all passed on the physical phone: shared text from a browser, an image from Photos and a `.pem` file from a file manager; runnable-only suggestions, redaction and no auto-run; no persistence after force-stop; SAF open and save; no storage or media permission prompt. The source apps, saved file name and location and the oversize and binary rejection messages were not recorded individually. **Result: Pass** (owner-reported).

### E. TalkBack and visual accessibility

Representative tools: **base64, json, jwt, qr-code-scanner, regex**. For each tool, with TalkBack on:

1. Navigate by swipe through the whole screen: every control has a spoken label, the focus order follows the visible order, and an error is announced once (`Error: <message>`).
2. Run the tool's main action with a known input and confirm the result is reachable and read in full.
3. Set **font scale 2.0** (`adb shell settings put system font_scale 2.0`, restore afterwards with `adb shell settings put system font_scale 1.0`) and confirm no clipped text, no controls hidden below the keyboard and the tab bar labels intact.
4. Repeat in **dark**, **light** and **high contrast** appearance (Settings in the app), reading every text and control state.
5. Turn on **reduced motion** in Android and in the app appearance setting and confirm there are no essential animations.

**Evidence (recorded 2026-10-23, reported by the owner):** TalkBack on base64, json, jwt, qr-code-scanner and regex: labels, focus order, error announcement and results passed with no defects seen; dark, light and high contrast and reduced motion passed. **Font scale 2.0 was not set** (the phone stayed at 1.15 and the agent did not apply it), so step 3 is open. The TalkBack version and per-tool details were not recorded. **Result: Partial** (step 3 open; the rest is owner-reported).

### F. Physical measurements

1. Install the protected build for the startup, memory and size figures. For the per-tool runs, install a build made with `EXPO_PUBLIC_DUDE_MEASURE=1` (it adds the `dude://dev/measure` screen; never ship it). Select the phone:

   ```
   export ANDROID_SERIAL=<phone serial>
   npm run measure:mobile
   npm run measure:mobile -- --tools
   ```

   The reports are `dist/measurements/mobile.json` and `dist/measurements/mobile-tools-<api>.json`.
2. Record hardware, API, app version, whether the build is an emulator fixture or the protected preview, dataset, pending count, network path and the samples. `am start -W` is activity display, not JS-interactive readiness.
3. Compare against the [emulator-fixture thresholds](PHASE31I_PLAN.md#emulator-fixture-release-thresholds). Where a phone is slower, **set physical thresholds** at the worst observed sample times 1.25 and tighten any input budget whose 100 percent run exceeds 3 s or whose JS-thread tick gap reaches 100 ms. Record the new numbers in the plan and in this document.

**Evidence (recorded 2026-10-23, verified by `npm run measure:mobile`, report `dist/measurements/mobile-api37.json`):** Galaxy S25 Ultra SM-S938W, API 37, protected preview `0.0.1017` (not an emulator fixture); cold activity display **135, 105 and 106 ms** (`am start -W`, not JS-interactive readiness); PSS after startup **106,384 KiB** (Java heap 18,348, native heap 19,380, code 46,940, graphics 11,700, other 6,964), peak RSS **226,320 KiB**; Hermes bytecode **7,768,352 B**; local `app-release.apk` 179,124,675 B and AAB 92,610,702 B (the all-ABI local build). The published arm64-v8a preview on unpublished draft `v0.0.1029` (CI run 39914165410, target `61c4ea1c`) is **APK 97,681,008 B and AAB 43,081,033 B**, next to the Windows installers, `latest.yml` and `SHA256SUMS.txt`; its signer was not re-verified here. Both figures are below the emulator baselines recorded above (983 and 1,503 ms start; 129,793 and 92,821 KiB PSS on API 29 and API 36), so no input budget was changed; physical thresholds (worst sample times 1.25) were not set because the per-tool runs are still open. The host-side sync figures are 1,000 records caught up in 352 ms and 100 pending replayed in 60 ms (Node SQLite, no network). **Not recorded:** per-tool wall time and tick gap (they need a build made with `EXPO_PUBLIC_DUDE_MEASURE=1`), enrolled catch-up, and database and outbox size (not readable through `run-as` on this build). **Result: Partial.**

### G. The owed 31B–31G passes

Each pass is defined in the cited document; run the steps listed there and record the outcome of every numbered step.

| Step | Pass | Defined in | Evidence to record | Result |
|---|---|---|---|---|
| G1 | Installed NSIS build migration and state service: the 11 checks (state service forks from the asar, legacy import, restart persistence, clone detection, degraded banner, quit flush and `quitAndInstall`, Pyodide and sandbox iframes, LAN collaboration, AI provider, both reset flows, web/PWA installation ID). Build with `npm run electron:package -- --publish never` | [31B Owed manual verification](PHASE31B_ACCEPTANCE.md#owed-manual-verification) | Installer version `____`; per-step outcome `____` | Pass / Fail |
| G2 | Installed Hub and Agent on Windows 11: installer with the Hub component and `NT SERVICE\DudeHub`, local setup wizard and owner creation, **Windows Hello** (and CredUI fallback) device-assisted recovery, per-machine N-1 to N Hub update with data preserved, uninstall and purge, resident agent across sign-out and sign-in and version-skew restart, Smart App Control with unsigned executables; plus **elevated Hub service runs** of `tls ca init`, `tls import`, `network proxy`, `network mode`, `network firewall`, `tls acme issue --open-firewall` and `check:hub-service -- --require`, a real `certutil` root install, and `backup create`, `backup restore` and `backup reactivate` against the real service with the DPAPI schedule key on a real account | [31C](PHASE31C_ACCEPTANCE.md#owed-manual-verification), [31E](PHASE31E_ACCEPTANCE.md#known-limitations-and-owed-manual-passes), [31F](PHASE31F_ACCEPTANCE.md#known-limitations-and-owed-manual-passes) and [31G](PHASE31G_ACCEPTANCE.md#known-limitations-and-owed-manual-passes) | Windows build `____`; Hub version `____`; per-step outcome `____`; elevated command log (no secrets) `____` | Pass / Fail |
| G3 | **Second desktop sync and the LAN browser pass:** two physical desktops over the LAN (enrollment, first-sync preview and apply, a favorite and theme change appearing live, an offline edit replaying after restart, a conflict resolved in Settings › Sync, revocation leading to Continue standalone); a second PC or phone browser against the Hub over the LAN; the local-CA root on a second PC and in Firefox; a real Caddy reverse proxy end to end with `network proxy on` | [31D](PHASE31D_ACCEPTANCE.md#owed-manual-verification), [31E](PHASE31E_ACCEPTANCE.md#known-limitations-and-owed-manual-passes) | Machines `____`; per-step outcome `____` | Pass / Fail |
| G4 | **Real Let's Encrypt and off-LAN reachability:** issue a certificate for a public name with `tls acme issue`, run the readiness gate, then reach the port-forwarded Hub from a **phone on cellular** through the real DNS name and confirm the pin, sign-in and sync | [31F Known limitations and owed manual passes](PHASE31F_ACCEPTANCE.md#known-limitations-and-owed-manual-passes) | Public name `____`; CA and certificate fingerprint `____`; readiness gate output `____`; cellular result `____` | Pass / Fail |
| G5 | **Second-machine transfer drill** (steps 1–11: transfer backup on OLD, restore on NEW, re-enable exposure, per-device re-pair, first-sync preview Merge, verify OLD retired and NEW live, rollback rule), with a real device pointed at the restored Hub with a new certificate | [31G transfer drill runbook](PHASE31G_ACCEPTANCE.md#transfer-drill-runbook) | OLD and NEW machines `____`; authority epoch before and after `____`; per-step outcome `____` | Pass / Fail |

**Closing rule.** Milestone 786 bumps the root version to 2.0 and marks DUDE 2.0 complete only after **every row in section 3 and every step in this script (A–G) passes**, the results are recorded here in the Milestone 785 commit, and the first CI run of the Android tool journeys is green. Until then the version stays `0.0.<commit count>`, no box in the Definition of Done is ticked on this phase's authority, and DUDE 2.0 is not represented as delivered. A failed or skipped step is carried forward, not waived.

## Commands

Use Node 24/npm 11.19, JDK 17 and `ANDROID_HOME`. These are the commands behind the evidence above; run them from the repository root.

| Purpose | Command |
|---|---|
| Full regressions | `npm test`, `npm run lint`, `npm run test:electron`, `npm run test:high-consequence`, `npm run check:portable` |
| Mobile gates | `npm run check:mobile`, `npm run test:mobile`, `npm run mobile:bundle` |
| Local development build | `npm run mobile:prebuild`, `npm run mobile:android` |
| Signed preview packaging | `npm run mobile:package` (needs `DUDE_ANDROID_KEYSTORE_PATH`, `DUDE_ANDROID_KEYSTORE_PASSWORD`, `DUDE_ANDROID_KEY_ALIAS`, `DUDE_ANDROID_KEY_PASSWORD`, full Git history and `master`) |
| On-device journeys | `ANDROID_SERIAL=<serial> npm run test:e2e:mobile` (`--tools-only`, `--flow <id>`, `--shard <i>/<n>`, `DUDE_E2E_RETRIES`, `DUDE_E2E_BATCH`, `DUDE_E2E_OUTPUT_DIR`; reports in `test-results/mobile/<serial>/`) |
| Measurements | `npm run measure:mobile`, `npm run measure:mobile -- --tools` (measurement build with `EXPO_PUBLIC_DUDE_MEASURE=1`), `npm run measure:mobile -- --host-only` |

`mobile:package` produces `dist/mobile-package/DUDE-Preview-<version>.apk`, the matching `.aab` and `SHA256SUMS.txt`; CI uses the `android-preview` secrets and the single release writer attaches the assets to a draft. Disposable emulator keys are acceptance fixtures and never substitute for the protected preview key; no signing secret is committed or printed. The journeys clear the preview app's state, so run them only on an acceptance device or profile. A development client waiting for Metro is not a production-install acceptance result. Existing desktop, Hub and Pages release gates are preserved. No Play publication, hosted Expo build, OTA channel, background worker or owner-admin mobile UI is part of this phase.
