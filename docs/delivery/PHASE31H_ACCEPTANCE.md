# Phase 31H implementation and acceptance evidence

**Status: exit gate pending.** Milestones 720–728 implement the Android shell and durable favorites/settings synchronization. Local debug and disposable-key release APK/AAB builds passed; native security instrumentation and bundled-app journeys passed on API 29 and API 36. Protected preview signing/install evidence and physical Android acceptance are outstanding; neither executable mobile tools nor the Android-inclusive DUDE 2.0 release is declared complete. Phase 31I may begin only after this exit gate closes.

## Implemented scope

| Milestone | Implementation |
|---|---|
| 720 | Expo SDK 57.0.26 / RN 0.86.3 / React 19.2.3 bootstrap, local build/config/plugin ownership and mobile boundary checks |
| 721 | Generated portable theme tokens, native semantic resolution and stable-ID mobile binding discovery |
| 722 | Home, Tools, Search, Favorites and Settings, shared catalog/search, appearance axes and navigation-only deep links |
| 723 | Native Keystore-wrapped Ed25519 signing, pinned HTTPS/WebSocket ports, QR/paste pairing and signed challenge sessions |
| 724 | Hub filtering capability, validated category queries, server filtering/pagination and typed API-client parity |
| 725 | Isolated SQLite contexts, migrations, atomic durable outbox, claimed operation replay and recovery storage |
| 726 | First-sync preview, foreground/resume sync, offline replay and guarded cursor reconciliation |
| 727 | Revocation, category changes, disconnect/archive, recovery export/import, cache clear and restore/re-pair lifecycle |
| 728 | Signed preview packaging and CI integration, native/emulator journeys, measurement commands and documentation |

The source and test files below describe implementation; pending rows are not pass claims. Decisions are [PD-075–PD-083](PHASE31H_PLAN.md). Contracts are the Phase 31H sections of [System](../architecture/SYSTEM_ARCHITECTURE.md#as-built-in-phase-31h-android-shell-and-sync), [Data and sync](../architecture/DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31h-android-persistence-and-synchronization) and [Security](../architecture/SECURITY_ARCHITECTURE.md#as-built-in-phase-31h-android-identity-and-recovery).

## Recorded verification

| Gate | Evidence and status |
|---|---|
| Bootstrap export | Android Hermes export succeeded during 720: 1,236 modules, approximately 2.7 MB bytecode and 27 assets. This records the bootstrap export, not the final bundle size or final boundary gate. |
| Native compilation | Local x86_64 debug APK and disposable-key release APK/AAB compiled with JDK 17. Final release build: 804 tasks, 1m35s (`tmp/phase31h-font-scale-fixture-artifacts.log`). These fixtures do not establish protected preview packaging. |
| Native identity/TLS | `DeviceIdentityTest.kt` and `PinnedHubTransportTest.kt` under `apps/mobile/modules/dude-hub/android/src/androidTest/`: seven tests on API 29 and seven on API 36, **14 tests total, zero failures/errors/skips** (`tmp/phase31h-native-short-clean-deps.log`). Physical trust rotation/public/VPN validation remains outstanding. |
| Durable repositories | `apps/mobile/src/storage/store.spec.ts`: 23 focused tests passed at 725, including shared KV/entity contracts, real SQLite close/reopen, disk-full rollback, outbox ceiling, claimed edit/delete and exact acknowledgment races, isolation, downgrade refusal, scope/secret rejection, filtered snapshot/recovery and credential-free import. Native Expo SQLite restart acceptance is separate. |
| Mobile declarations/lint | Repository `npm run lint` passed, including both host boundary gates, zero design-token violations, 144 theme combinations / 49,008 contrast checks and the generated inventory (`tmp/phase31h-final-lint.log`). Final `check:mobile`, scoped mobile lint and refreshed inventory also passed after the acceptance fixes (`tmp/phase31h-final-check-mobile.log`, `tmp/phase31h-final-tab-check.log`). |
| Hub filtering | `apps/hub/src/server/routes/sync-category-filtering.spec.ts`, contracts and API-client specs cover filter validation, pagination, tombstones, empty/mixed results and unfiltered compatibility. Full Hub suite: **87 files / 855 tests passed, one file / four tests skipped** (`tmp/phase31h-hub.log`). |
| Sync/lifecycle | Mobile driver/session and `apps/mobile/src/lifecycle/confirmation-boundary.spec.ts` cover replay, recovery and local confirmation boundaries. Final batch after acceptance fixes: **22 Node tests and 72 Vitest tests passed** (`tmp/phase31h-final-mobile-followup.log`), including archive selection, stale-session rejection and failed-key-deletion recovery. Packaging/release-writer tests also passed **20/20**; an offline Gradle fixture rejected unsigned aggregate and abbreviated release tasks while permitting debug assembly. |
| Bundle privacy/boundaries | Production Android Hermes export passed: **2,372 modules, approximately 3.7 MB bytecode, 27 assets**. Source-map inspection passed **2,359 entries**, alongside mobile dependency gates (`tmp/phase31h-final-bundle.log`). The export and boundary check also passed after acceptance source fixes (`tmp/phase31h-final-bundle-followup.log`, `tmp/phase31h-final-bundle-tabs.log`). |
| Emulator journeys | Final bundled-app Maestro **2/2 journeys passed on each device** (four total): API 29 **78.019 s**, API 36 **87.796 s**. Reports: `tmp/mobile-acceptance/api29-font-scale-final/maestro.xml` and `api36-font-scale-final/maestro.xml`. At font scale 1.5, verified all five destinations, search, SQLite favorite/outbox restart persistence, warm/cold navigation-only links, unknown IDs, Light/Dark/High/Reduce preferences and camera denial with paste retained. Screenshots confirmed corrected tab labels on both APIs. Prior timing failures were resolved by waiting for storage/navigator readiness before sending a warm link. |
| Existing regressions | `npm test`: **686 package files / 4,591 tests and 775 Angular files / 8,357 tests passed** (`tmp/phase31h-npm-test.log`). Electron: **113 files / 1,209 tests passed**, one skipped; one renderer-key scan exceeded its 5 s timeout under concurrent load. Its focused retry with a 30 s CLI timeout passed all **10 tests** (scan 532 ms), without changing repository timeouts (`tmp/phase31h-electron.log`, `tmp/phase31h-electron-retry.log`). `check:portable` passed **1,305 ESM exports** (`tmp/phase31h-portable.log`). Production web and Hub-web builds passed with cache-prefetch sizes **429.1 KB / 430.9 KB** against the 800 KB budget (`tmp/phase31h-web-build.log`, `tmp/phase31h-hub-web-build.log`). All **16 desktop/Hub sync e2e journeys passed**, including stale restore, offline pending edits and authority transfer (`tmp/phase31h-final-sync-e2e.log`). |
| Signed preview artifacts | The owner confirmed protected signing is not configured on October 6, 2026. Protected signed preview APK, AAB, checksums and install evidence remain pending. Missing signing fails `mobile:package` explicitly; no unsigned/debug-key fallback. |
| Physical Android | The owner confirmed no physical phone is available on October 6, 2026. LAN plus off-LAN VPN/public connection, offline force-stop/restart/replay and restore/re-pair remain required. |

## Commands and build/install evidence

Use Node 24/npm 11.19, JDK 17 and `ANDROID_HOME`. `mobile:prebuild` generates Android build outputs from tracked modules/plugins; `mobile:android` produces a local development build. `mobile:bundle` exports Hermes bytecode/source maps. Select an installed bundled build with `ANDROID_SERIAL` for `test:e2e:mobile`; configure `MAESTRO_PATH` when Maestro is not on PATH. The runner temporarily enlarges font scale and restores the previous value. Journeys start by clearing the preview app test state; run them only on an acceptance device/profile. Reports and screenshots are stored per device under `test-results/mobile/<serial>/`; `DUDE_E2E_OUTPUT_DIR` can select another workspace-local evidence directory. A development client waiting for Metro is not a production-install acceptance result.

`mobile:package` requires `DUDE_ANDROID_KEYSTORE_PATH`, `DUDE_ANDROID_KEYSTORE_PASSWORD`, `DUDE_ANDROID_KEY_ALIAS` and `DUDE_ANDROID_KEY_PASSWORD`, full Git history and `master`. CI uses `android-preview` secrets `DUDE_ANDROID_KEYSTORE_BASE64` plus the three password/alias variables. It produces `dist/mobile-package/DUDE-Preview-<version>.apk`, the corresponding `.aab` and `SHA256SUMS.txt`; the existing single release writer attaches assets to a draft. Disposable emulator keys are acceptance fixtures and do not substitute for the protected preview key. No signing secrets are committed or printed.

Disposable local acceptance artifacts were built from `fb2254ff` plus the final 728 working-tree source, using version **0.0.947 / code 947**, JDK 17 and x86_64. Both release APK and AAB built successfully (804 tasks, 1m35s); the APK was installed on both emulators. They are verification fixtures, with no protected release upload or distribution claim. Artifacts are under ignored `tmp/mobile-acceptance/artifacts/`:

| Fixture | Bytes | SHA256 |
|---|---:|---|
| `DUDE-Emulator-Verification-0.0.947-font-scale.apk` | 91,820,548 | `d559263d4e267082be47fe6ce6bbfba5c91033763a460e267629e01d74bb60a0` |
| `DUDE-Emulator-Verification-0.0.947-font-scale.aab` | 40,362,854 | `290f9c2508c1378b5d227f384b77d34f85cd5c3286924927446284da08f842ac` |

The disposable signer certificate SHA256 is `eed970cc5ed0657fa7783a1ca2581d443c782fc7d8a67d24daa51483d62161eb`. This identifies these local fixtures only (`tmp/phase31h-font-scale-fixture-artifacts.log`). Subsequent clean-master protected packaging derives its own commit-count version.

Record the exact commit, version name/code, signer certificate fingerprint, APK/AAB hashes, install/launch result and draft asset verification when protected packaging becomes available. Preserve desktop, Hub and Pages release gates. No Play publication, hosted Expo builds, OTA updates, owner-admin mobile UI, background workers or executable tool screens are part of this phase.

## Measurements

`npm run measure:mobile` writes `dist/measurements/mobile.json` for the selected device. Activity display timing (`am start -W TotalTime`) is distinct from JavaScript interactive readiness. The command records memory and, when the debug app-private database is accessible through `run-as`, database/WAL size and record/outbox/claimed counts. It does not root devices or print payloads. Enrolled catch-up timing remains a required physical/network observation when unavailable to the command.

The final host fixture runs using the actual mobile driver and file-backed Node SQLite measured **1,000-record catch-up in 298.7–309.5 ms / 63 pull pages**, and **100 queued edits replayed to zero in 61.7–62.0 ms / one push and seven pull pages**, with a **344,064-byte database** (`dist/measurements/mobile-sync.json` and the `hostSync` fields of the device reports, October 6, 2026). This excludes native bridge, authentication, network latency and Android hardware; it is not a phone performance result. `npm run measure:mobile -- --host-only` runs this fixture alone.

The final disposable-key release fixture, version 0.0.947, produced these standalone emulator observations on October 6, 2026. Font scale was restored to 1.0 after acceptance. These are activity display times and PSS immediately after startup, not interactive-readiness or peak-memory measurements:

| Emulator | Cold activity display samples (ms) | Total PSS (KiB) | Report |
|---|---|---:|---|
| API 29, Android SDK built for x86_64, `emulator-5582` | 464, 585, 592 | 91,331 | `dist/measurements/mobile-api29.json` |
| API 36, sdk_gphone64_x86_64, `emulator-5580` | 722, 825, 735 | 96,398 | `dist/measurements/mobile-api36.json` |

`run-as` correctly refuses app-private database access on these release fixtures. Native database/WAL bytes and enrolled outbox/catch-up measurements therefore remain pending; no device was rooted or treated as a debug build. The restart screenshots do show a cached favorite and one pending operation surviving force-stop. The tab bar was also visually checked at font scale 2.0 on both emulators (`tmp/mobile-acceptance/api29-font-scale-2.png`, `api36-font-scale-2.png`).

Physical device measurements remain separate. Record hardware, API, app version, dataset, pending count, network path, measured samples and whether the build is an emulator fixture or protected preview. Set release thresholds after representative measurements; no hardware-independent budget is inferred from the bundle or host fixture.

## Remaining native and physical acceptance

- Install the protected signed preview on a physical Android device; exercise LAN and off-LAN VPN/public endpoints with the reviewed pin and active/next rotation.
- Enroll, consent, edit offline, force-stop/restart and reconnect; verify durable replay, idempotent duplicate delivery and convergence with desktop while preserving newer edits.
- Restore/import/re-pair using a fresh signing key; preserve the restored device ID, cached records and pending operations; repeat category consent.
- Exercise missing Keystore material, confirmed revocation, incompatible Hub capability/protocol, pin mismatch with no credential transmission, changed authority, expired cursor/regressed history and corrupt/full storage recovery.
- Complete manual TalkBack and visual accessibility acceptance, and repeat camera denial/paste, bare links, enlarged text, reduced motion and appearance combinations on the physical phone. API 29/API 36 focused emulator journeys have passed; their automation does not replace screen-reader acceptance.
- Record signed artifact/install evidence and startup/catch-up/memory/database/outbox measurements; complete first CI runs; existing local regression results are recorded above.

31H remains open until these requirements and the final automated gates pass. Completion authorizes Phase 31I; approximately 30–50 named executable mobile tools and the complete DUDE 2.0 gate remain that phase's work.
