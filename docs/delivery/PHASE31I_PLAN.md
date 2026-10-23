# Phase 31I implementation decisions

Status: in progress. Implementation milestones 729–785 landed; acceptance pending. The exit gate is open; DUDE 2.0 is declared only at the final milestone (786 as built; planned as 784, see [Deviations](#deviations-and-implementation-notes)) after every Definition of Done item has recorded evidence. [Phase 31H acceptance](PHASE31H_ACCEPTANCE.md) records the carried passes; [Phase 31I acceptance](PHASE31I_ACCEPTANCE.md) records the final automated gate, the Definition of Done status and the guided manual script; the [DUDE 2.0 release definition](QUALITY_AND_RELEASE.md#dude-20-distributed-release-definition-of-done--all-planned) governs the final gate.

- **PD-084 — Single final gate.** Phase 31H's automated scope is declared implemented. Its owed passes (protected signed install, physical LAN/off-LAN/offline/restore/re-pair, failure cases, TalkBack, native measurements and first CI runs) are not closed separately; they are carried into the single 31I/DUDE 2.0 final gate, so 31I implementation starts before they run. Nothing in 31H or 31I is represented as accepted until that gate records evidence.
- **PD-085 — Locked tool list.** Forty tools, by group below. Every row is an existing stable registry ID except `device-info`, which is new and available on every surface (category `developer`). Nothing else is promised to Android in this phase.

  | Group | Tools |
  |---|---|
  | Native (5) | qr-code-scanner, barcode-reader, qr-code-generator, barcode-generator, device-info |
  | Encoding (6) | base64, url-encode, hex-text-converter, number-base, color-converter, contrast-checker |
  | Text (6) | text-inspector, case-converter, slug-generator, whitespace-cleaner, diff, unicode-normalization |
  | Data (5) | json, yaml-json, xml-formatter, csv-viewer, json-flatten |
  | Security (6) | jwt, hash, hmac-generator, uuid, password-generator, password-strength-analyzer |
  | Date-time (4) | unix-timestamp, cron, timezone-offset-comparator, duration-formatter |
  | Web (4) | url-inspector, http-status, user-agent, cookie-tools |
  | Developer (4) | regex, cidr-calculator, chmod-converter, semver-comparator |

  Bespoke screens: the four QR/barcode tools, device-info, json, jwt, regex, diff, color-converter, cron, unix-timestamp and cidr-calculator; every other tool uses the declarative kit. The **reserve list** is ip-address-inspector, programmer-calculator, basic-auth-generator, escape-unescape-toolkit, json-sort-keys and base-n-encoder. **Swap rule:** a tool that fails its off-thread requirement (PD-088) or cannot meet its Maestro journey is replaced by the first fitting reserve entry; the swap is recorded as a dated deviation in this file with the reason and the measured result, and the list above is not silently edited.
- **PD-086 — Presentation.** A mobile-owned declarative kit (`defineTextTool`) covers text-in/text-out tools; flagship tools are bespoke screens. Screens call the engine functions the Angular components already use (for example `encodeBase64`/`decodeBase64` from `@dude/crypto/base64-codec`), never pipeline steps, which are one-way and take no parameters. Engine imports are allowed only from lazily loaded `apps/mobile/src/tools/**` modules (which may import `@dude/tool-engine/tools/**` and `shared/**` subpaths and specific `@dude/crypto` subpaths); each tool is its own lazy chunk and the shell entry chunk contains no tool engine. The shell keeps only the `tool-search` and `paste-detect` subpaths, plus the curated `paste-detectors` list that Share-to-DUDE loads lazily with `import()`. Shared metadata, per-tool bindings and the "never edit shell/routes/generated map per tool" rule are unchanged; only the framework milestones in the [as-built map](#milestone-map) touch the shell, and a tool milestone edits no shell file.
- **PD-087 — Host facilities.** A fixed polyfill set is installed at app entry through an `EngineHostPorts` adapter: `expo-crypto` (`getRandomValues`/`randomUUID`), `@noble/hashes` (a `subtle.digest`/HMAC subset), `react-native-url-polyfill` and `fast-text-encoding`. `request`, `sanitizeHtml`, `decodeImage`, `compression` and `xxhash` are unavailable on mobile and fail explicitly with `HostFacilityUnavailableError`; none is stubbed. The mobile hash tool hides the xxhash variants (Hermes has no WebAssembly) and shows the reason. Adding a polyfill later is a recorded decision, not an incidental dependency.
- **PD-088 — Off-thread work.** hash, json, yaml-json, xml-formatter, csv-viewer and diff MUST run on a `react-native-worklets` worker runtime through one `runOffThread` path with cancellation of stale results. A tool whose engine cannot run there is swapped for a reserve entry under PD-085; it is not allowed to run on the JS thread instead.
- **PD-089 — Tool state.** Manifest `local` preferences persist in the active environment or standalone context and ride the existing settings sync category with the same key names as web so preferences converge; no new sync category and no new scope. `session` and `none` inputs live in memory only; `secure-local` values are not persisted on mobile. In-memory tool inputs are wiped after the app has been in the background for 5 minutes (default).
- **PD-090 — Input and output.** Every output offers Copy, the Share sheet and Save through the Storage Access Framework; QR and barcode generators also share and save images. File input uses the SAF document picker honoring each manifest's `fileInput` extensions and, because `fileInput` has no size field yet, a 2 MiB default cap (see [Deviations](#deviations-and-implementation-notes)); scan-from-image uses the Android Photo Picker. The storage and media permissions stay blocked, and the native privacy test keeps asserting that.
- **PD-091 — Share-to-DUDE inbound.** Android accepts `ACTION_SEND` for `text/plain`, `image/*`, `text/*`, `application/json`, PEM/CRT/key and `application/octet-stream`. Content is capped at the target tool's cap, which is 2 MiB for every tool because no manifest declares a `fileInput` size, and larger content is rejected. A share route shows Smart Paste `detectShapes` suggestions filtered to runnable tools above a searchable picker. Sharing never auto-runs a tool and the content is never persisted or synchronized; it lives in memory and is subject to PD-089's wipe. Deep links remain navigation-only: they cannot enroll, import input or execute.
- **PD-092 — Native tools.** Scanning uses `expo-camera`; the camera permission is requested only when the user starts a scan, and paste and image fallbacks always remain. QR generation keeps the `qrcode` matrix rendered with `react-native-svg`; barcodes use **bwip-js, which replaces `jsbarcode` on every surface** and adds DataMatrix, PDF417, Aztec and GS1-128. Scan payload classification (URL, Wi-Fi, vCard, TOTP, GS1) is new portable `tool-engine` code that web and mobile share; the web scanners had no classifier to move, and web now also shows the payload kind, barcode format and check-digit result. A scanned Wi-Fi password or `otpauth` secret is masked behind Reveal and never persisted, and a scanned URL opens only after an explicit confirmation. `device-info` is the only new tool: a portable report model and formatter, with web reading `navigator`/`screen`/`Intl`, desktop reading OS facts through one new read-only IPC (`dude:deviceInfo:osFacts`, platform, OS name/release, architecture, CPU model and count, total memory) and Android reading device, network, pixel-ratio and locale facts. None of them reports a device name, serial, Android ID, IP address, MAC address or SSID.
- **PD-093 — Catalog and controls.** Tools and Search list runnable tools first and hide desktop/web-only tools behind a "Show desktop/web-only" toggle; synced favorites of non-runnable tools stay visible with the reason. Home gains local-only Recents that never synchronize. Native controls are haptics on copy, scan and errors, an options sheet on RN `Modal` (no sheet library) and an explicit Paste button. Web and desktop tool pages show an "Also on Android" badge generated from the binding IDs, so a later tool earns it without a core edit.
- **PD-094 — Verification.** Every tool ships an on-device Maestro journey that drives its UI with known inputs and asserts outputs on API 29 and API 36 in CI on every push; the journeys block release. The same journeys run on the physical phone at the final gate. Expected values are copied from the engine's existing spec vectors with a source comment beside each, so the UI is checked against the shared engine, not against itself. The harness also covers camera-permission denial with paste retained, an engine failure staying local behind the tool error boundary, the background wipe and the share-intent route.
- **PD-095 — Versioning.** The final DUDE 2.0 milestone (planned as 784, 786 as built) bumps the root major/minor to 2.0, so every surface releases as `2.0.<commit count>`; Android `versionCode` stays the commit count. The bump happens only after every Definition of Done item has recorded evidence; before it the version stays `0.0.<commit count>`.
- **PD-096 — Exclusions.** Deferred to Phase 91: the NFC inspector, BLE scanner, camera OCR, network diagnostics, pipelines and the Smart Paste page on mobile, background work (sync stays foreground-only) and iOS. Request-bearing tools are out of scope until a `request` port is decided.
- **PD-097 — Owed earlier passes.** The owed 31B–31G manual passes (installed NSIS migration, second-desktop sync and transfer, real Let's Encrypt and off-LAN reachability, elevated service runs) run in the acceptance-evidence close-out (planned as 783, 785 as built) through a guided script: the owner runs the hardware steps and the result of each is recorded in `PHASE31I_ACCEPTANCE.md`. DUDE 2.0 does not ship while any of them is unrecorded.

### Milestone map

The map below is as built. The numbering drifted from the plan written at Milestone 729 (the framework milestones were reordered, each tool took its own milestone, and the close-out moved by two), so the table replaces the planned one rather than amending it.

| Milestones | Work |
|---|---|
| 729 | Decisions PD-084–PD-097 and the merged 31H/31I gate |
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
| 782 | Landed: serial SQLite gate (`apps/mobile/src/storage/serial-gate.ts`) that fixes the first-launch native crash, shell-level keyboard Back, harness retries default 1 and batches of 8 flows |
| 783 | Landed: flag-gated on-device measurement screen and `measure-mobile.mjs --tools`, measured input budgets, kit main-thread budget, emulator-fixture release thresholds |
| 784 | As-built documentation, recipe, deviations, measured budgets and thresholds |
| 785 | Acceptance evidence, Definition of Done status and the guided manual script ([acceptance](PHASE31I_ACCEPTANCE.md)) |
| 786 | Planned, not landed: DUDE 2.0 (only after every Definition of Done item and every guided-script row has evidence) |

Two unnumbered fix commits sit between milestones: gate findings after 772 (Device Info coverage exclusions and mobile lint directives) and the data-scope inventory declaration for the Share-to-DUDE in-memory store after 779.

Per-tool input caps were first set while each tool was built and then measured at Milestone 783; the [measured input budgets](#measured-input-budgets) and [release thresholds](#emulator-fixture-release-thresholds) below replace the build-time numbers. They come from emulator runs only. Physical-phone timings are still owed to the physical pass.

## Deviations and implementation notes

Recorded after Milestone 783. Each item is a fact about the shipped code, not a plan.

- **Milestone numbering.** The as-built map above replaces the planned one. The planned 784 (DUDE 2.0) is now 786, documentation moved from 782 to 784 and acceptance evidence from 783 to 785. Milestones 782 and 783 are new: the first-launch SQLite crash fix and the measurement and budget pass. Both have landed; nothing in 784–786 has.
- **No reserve swaps.** All 40 tools shipped as listed. None of ip-address-inspector, programmer-calculator, basic-auth-generator, escape-unescape-toolkit, json-sort-keys or base-n-encoder was used, so the swap rule was never invoked and the list in PD-085 is unedited. All six PD-088 tools (hash, json, yaml-json, xml-formatter, csv-viewer, diff) produced output identical to the JS-thread result on API 29 and API 36 in the [off-thread spike](#off-thread-spike), with the JS thread staying responsive.
- **Worker runtime limits.** The worker is bare Hermes: no `URL`, no expo native modules, no React Native `NativeModules`, and a random source that throws. `worker-host.ts` installs only `fast-text-encoding`, that throwing source and the digest/HMAC engine host. A task that needs `URL` or random values is not an off-thread candidate; the six PD-088 tools need neither. Aborting cannot interrupt a running worker job, so a stale result is dropped and the queue waits for the worker before dispatching the next job.
- **Host facilities as built.** `expo-crypto` supplies random values and UUIDs; `@noble/hashes` supplies a SHA-1/256/384/512 digest and HMAC subset. `request`, `compression`, `sanitizeHtml`, `htmlEntities`, `decodeImage` and `xxhash` throw `HostFacilityUnavailableError`. The mobile Hash tool shows XXH32 and XXH64 as "Unavailable on Android (needs WebAssembly)" instead of hiding them; MD5, SHA-3 and BLAKE3 run through `@dude/crypto` on the worker.
- **Input caps.** Milestone 783 measured every cap on API 29 and API 36 and changed three things. Hash drops from 2 MiB to 128 KiB (its 13 algorithms run in pure JS on the worker: 2 MiB took 22.9 s, 128 KiB took 1.6 s) and csv-viewer from 512 KiB to 384 KiB (4.0 s became 2.3 s). The JS-thread tools, which had no enforced cap, gain a kit main-thread budget: `defineTextTool` takes `maxInputBytes`, default `DEFAULT_MAIN_THREAD_INPUT_BYTES` (128 KiB), with base64 at 256 KiB and case-converter at 64 KiB; bespoke screens (whitespace-cleaner, slug-generator, jwt, hmac-generator) call `checkInputBudget` against the same default. Json, yaml-json and xml-formatter keep 2 MiB, diff keeps 512 KiB per side and regex keeps 64 KiB of text, a 2000-character pattern, 200 rendered matches and a nested-quantifier guard. File open and Share-to-DUDE still default to 2 MiB, so the hash, csv-viewer, base64, case-converter and default-budget tools show their own oversize message after a file is opened or content is shared. These numbers are emulator-fixture observations, not hardware guarantees, and the physical pass may tighten them.
- **`fileInput` has no size field.** A manifest `fileInput` declares extensions only, so the "honor `fileInput` limits" wording of PD-090 and PD-091 resolves to the 2 MiB default (`DEFAULT_FILE_INPUT_BYTES`) for every tool. Adding a per-manifest size is deferred; the kit's file reader already honors a `maxBytes` if one is ever declared.
- **Preference scope behaviour.** The kit's `useToolPreference` resolves scope with `resolveKvScope` and the manifest `settingScopes`. A `local` preference resolves to `environment` scope, is written under the same namespace and key as web and is journaled as a `setting` operation in the existing settings sync category, so no new category or scope exists. Every other policy is memory-only. The Timezone Comparator's Android-only "Zones" view is in memory, so the synced `mode` key holds only values web also understands.
- **Recents and the recovery export.** Recents use the `mobile.local` kv namespace with policy `session` and scope `local-only`; they are never journaled, queued or synchronized. They are non-secret kv rows, so the credential-free recovery export includes them; that export already states that it contains personal cached data.
- **Background wipe.** The in-memory tool input store is cleared after at least 5 minutes in the background, and the Share store is wiped with it.
- **`ACCESS_WIFI_STATE` is blocked.** A library merges it into the manifest; the privacy plugin removes it (`tools:node="remove"`) together with the storage, media, `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` permissions. Device Info therefore reports no SSID or Wi-Fi details. The merged release manifest requests `CAMERA`, `INTERNET`, `VIBRATE` and `ACCESS_NETWORK_STATE`, plus AndroidX's `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` signature permission.
- **False bundle-bug finding.** An exploration pass reported a body-less `if` in `scripts/check-mobile-bundle.mjs`. That claim was false. Milestone 730 restructured the script for per-region boundaries for unrelated reasons; nothing was broken or fixed.
- **Barcode `format` persistence.** The persisted `format` key keeps its old values through a decode mapping (CODE128 to code128, EAN13 to ean13, EAN8 to ean8, UPC to upca, CODE39 to code39, ITF14 to itf14, codabar to codabar), so no stored preference is migrated. The barcode pipeline step moved into the engine with bwip-js 4.11.4 (`bwip-js/generic` `toSVG`, no canvas).
- **Not mirrored on Android.** The URL Inspector editable parts form, the Text Inspector grammar check (needs the network) and selection metrics, a CSV auto delimiter (web has none), the Diff ignore-whitespace option (the engine has none) and the User-Agent "use this device" action (React Native has no `navigator.userAgent`). These are recorded gaps against the web tools, not shared-engine parity failures.
- **Verification as run.** 43 Maestro flows (shell 01 and 02, the 03-share special case and 40 tool flows) pass on API 29 and API 36 release fixtures at font scale 1.5. At Milestone 781 two flows passed only on a re-run on API 36 and most flows needed re-runs on API 29, mostly as cascades after the first-launch crash (fixed in 782, see the resolved note below). At Milestone 782, with retries disabled (`DUDE_E2E_RETRIES=0`), API 36 passed all 43 flows on the first attempt; API 29 passed every flow, but in several pieces because the emulator lost its adb connection when the host suspended, which is not an app failure. The harness now defaults to one retry and runs flows in batches of 8 per Maestro session (`DUDE_E2E_BATCH`) so an adb drop costs one batch. Camera scanning is not exercised on emulators (paste, image and denial paths only), so it is a physical-phone item. Maestro cannot type non-ASCII text, newlines or some quotes, so those flows use Sample buttons.
- **Resolved at Milestone 782: first-launch SQLite crash and Search-tab Back.** Root cause: a use-after-free in expo-sqlite 57.0.3. One statement call is several native calls on a thread pool; `closeAsync` finalizes every statement without marking the Kotlin side finalized, and `getColumnNamesAsync` does not check that the database is still open, so any statement chain in flight when the connection closes touches freed memory (SIGSEGV in `NativeStatementBinding::getColumnNames`). It reproduced on demand with six `getAllAsync` calls racing `closeAsync`: 2 of 2 runs of 300 iterations crashed, against 3 of 3 clean runs through the gate. Fix: `apps/mobile/src/storage/serial-gate.ts`, a FIFO gate that every statement and exclusive transaction passes through; `close()` drains the queue and then refuses new work. After the fix there were 0 crashes in 40 fresh-data launches on each API. Before it the harness crashed about one launch in 8–10, but 80 organic pre-fix launches never reproduced it, so the on-demand race is the evidence, not the launch count. Back with the soft keyboard open now dismisses the keyboard on every screen, including the Search tab, because `useKeyboardBack` is mounted once at shell level in `app/_layout.tsx` instead of per tool. Neither item is carried forward. Physical-phone launch evidence is still part of the physical pass.
- **Preview ABI (after Milestone 785).** `mobile:package` builds the signed preview APK and AAB for `arm64-v8a` only, to cut the CI packaging time. Draft `v0.0.1018` and earlier carried every ABI. 32-bit ARM and x86 devices cannot install the preview; emulator acceptance keeps using the x86_64 fixture build.

### Measured input budgets

Recorded at Milestone 783 on x86_64 emulators (API 29 and API 36, release builds, Windows 11 host). Rule: a cap stays if its 100 percent run finishes in 3 s or less on API 29 with a longest JS-thread tick gap under 100 ms; otherwise the largest measured size meeting both becomes the cap. API 29 decides, and API 36 agreed within about 20 percent. Every figure is an emulator-fixture observation and not a hardware guarantee: a phone CPU will be slower.

| Tool | Cap | API 29 wall time at the cap | Thread |
|---|---|---|---|
| hash (all algorithms) | 128 KiB (was 2 MiB, which took 22.9 s) | 1,599 ms | worker |
| json | 2 MiB | 212 ms (fresh process; tick gap 71 ms API 29, 85 ms API 36) | worker |
| yaml-json | 2 MiB | 1,383 ms YAML to JSON; 2,272 ms JSON to YAML | worker |
| xml-formatter | 2 MiB | 2,131 ms | worker |
| csv-viewer | 384 KiB (was 512 KiB, which took 4.0 s) | 2,286 ms | worker |
| diff | 512 KiB per side | 646 ms; 1,081 ms with no common lines | worker |
| regex | 64 KiB text | 4 ms match; 6 ms replace | JS thread |
| base64 | 256 KiB | 66 ms encode; 19 ms decode | JS thread |
| case-converter | 64 KiB | 58 ms (alternating, the slowest style); 14 ms camel | JS thread |
| text-inspector | 128 KiB (kit default) | 75 ms readability; 36 ms metrics | JS thread |
| whitespace-cleaner, slug-generator, jwt, hmac-generator | 128 KiB (kit default, `checkInputBudget`) | not measured individually | JS thread |

At 2 MiB with no cap the JS-thread tools froze the UI for 0.4–1.6 s (case-converter alternating 1.6 s, text-inspector readability 1.0 s, base64 encode 0.4 s). Off-thread tools kept the JS thread free (longest tick gap under 100 ms at every cap); the diff worst case plateaus near 1.1 s because diff-match-patch bounds itself at 1 s. Json's tick gap margin is thin, so treat it as a watch item. The figures come from the flag-gated measurement screen: build with `EXPO_PUBLIC_DUDE_MEASURE=1`, open `dude://dev/measure?scope=...` and run `npm run measure:mobile -- --tools`, which parses the `DUDE_MEASURE` logcat lines into `dist/measurements/mobile-tools-<api>.json`. The screen and its inputs (`apps/mobile/src/tools/_measure/`) are compiled only into a build made with the flag; `check:mobile` fails if they appear in a normal bundle, and the shipped bundle carries no `DUDE_MEASURE` string.

### Emulator-fixture release thresholds

Each threshold is the worst observed sample times 1.25, rounded up. They gate regressions on the emulator fixture and are not promises about phones; thresholds for physical devices come from the physical pass, which has not run.

| Metric | API 29 measured | API 29 threshold | API 36 measured | API 36 threshold |
|---|---:|---:|---:|---:|
| Cold start `am start -W` TotalTime, worst of three (ms) | 983 | 1,229 | 1,503 | 1,879 |
| PSS after startup (KiB) | 129,793 | 162,242 | 92,821 | 116,027 |
| PSS after formatting 2 MiB of JSON (KiB, measurement build) | 237,747 | 297,184 | 180,457 | 225,572 |
| Peak RSS after the full tool run (KiB, measurement build) | 447,028 | 558,785 | 383,952 | 479,940 |
| Hermes bytecode (bytes) | 7,759,356 | 9,699,195 | same | same |
| APK, x86_64-only fixture (bytes) | 99,263,946 | 124,079,933 | same | same |
| AAB, x86_64-only fixture (bytes) | 43,467,879 | 54,334,849 | same | same |

Per-tool wall time and tick gap at the budgets above, in milliseconds. The wall threshold is the worse of the two APIs times 1.25; the gap threshold is the lower of the measured gap times 1.25 and 100.

| Tool / variant | Wall threshold | Gap threshold |
|---|---:|---:|
| hash | 1,999 | 28 |
| json | 315 | 100 |
| yaml-json: yaml to json / json to yaml | 2,090 / 2,877 | 69 / 63 |
| xml-formatter | 2,865 | 54 |
| csv-viewer | 2,937 | 25 |
| diff: line diff / no common lines | 808 / 1,370 | 25 / 35 |
| base64: encode / decode | 83 / 28 | 84 / 28 |
| case-converter: alternating / camel | 74 / 20 | 74 / 25 |
| text-inspector: readability / metrics | 104 / 52 | 100 / 52 |
| regex: match / replace | 13 / 13 | 25 / 25 |

Startup times are activity display, not JS-interactive readiness. Still owed and not measured: physical-device timings and PSS, the APK and AAB size of the published arm64-v8a preview, JS-interactive startup readiness, and the enrolled sync catch-up on a phone.

### Off-thread spike

Recorded at Milestone 750 on x86_64 emulators (Expo SDK 57.0.26, React Native 0.86.3, react-native-worklets 0.10.1 Bundle Mode, release builds) with inputs of about 200 KB (yaml 121 KB; diff two 200 KB sides). Every off-thread result matched the JS-thread reference by JSON equality.

| Engine | Main thread (API 36 / 29) | Off-thread, warm (API 36) | JS-thread longest gap while off-thread (API 36 / 29) |
|---|---|---|---|
| `processJson` | 15–28 ms / 150 ms | 25 ms | 20–29 ms / 37 ms |
| `convertYaml` | 86–93 ms / 196 ms | 92 ms | 18 ms / 36 ms |
| `processXml` | 259–269 ms / 509 ms | 262–268 ms | 18–20 ms / 22 ms |
| `parseCsv` (papaparse) | 4160–4536 ms / 5758 ms | 4084–4342 ms | 22 ms / 28 ms |
| `computeLineDiff` | 136–140 ms / 155 ms | 137–182 ms | 18–20 ms / 22 ms |
| `computeHashes` (SHA-256/512, MD5, SHA3-256, BLAKE3) | 803–877 ms / 1106 ms | 802–845 ms | 19–22 ms / 20 ms |

Error propagation (a thrown `RangeError`) and cancellation (running and queued jobs aborted, a fresh job afterwards) also passed on both APIs. A longest gap of one or two 10 ms ticks means the JS thread stayed free while the engine ran. Off-thread execution does not make an engine faster; it keeps the UI responsive, which is why csv-viewer still needs an input cap.

References: [Phase 31I scope](ROADMAP.md#phase-31i), [Phase 31H decisions](PHASE31H_PLAN.md), [Phase 31H acceptance](PHASE31H_ACCEPTANCE.md), [DUDE 2.0 release definition](QUALITY_AND_RELEASE.md#dude-20-distributed-release-definition-of-done--all-planned), [Mobile product specification](../product/PRODUCT_SPEC.md).
