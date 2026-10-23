# AGENTS.md — apps/mobile/

Android companion, Expo SDK 57 / React Native 0.86 / React 19.2, Hermes and Expo Router. Read the root instructions, [Phase 31H decisions](../../docs/delivery/PHASE31H_PLAN.md) and [Phase 31I decisions](../../docs/delivery/PHASE31I_PLAN.md) (PD-084 to PD-097 and its deviations section). Phase 31H built the shell and sync; Phase 31I added 40 executable tools, the kit, the off-thread runtime, Share-to-DUDE and the Maestro harness (implementation milestones 729–785 landed; acceptance is pending, so do not describe 31I or DUDE 2.0 as complete). Adding a tool starts with the Android section of [ADDING_A_TOOL.md](../../ADDING_A_TOOL.md).

## Layout and import regions

`scripts/check-mobile-boundaries.mjs` (part of `npm run check:mobile`) puts every file in one of three regions:

- **Shell**: everything outside the two below, including `src/kit`, `src/tools-host`, `src/share` and `app/`. It may import only `@dude/tool-engine/core/registry/tool-search`, `core/paste-detect/paste-detect` and, with a lazy `import()`, `core/paste-detect/paste-detectors` (Share-to-DUDE). It imports no `@dude/crypto`.
- **Tools** (`src/tools/<id>/`): lazily bound tool screens. They may import `@dude/tool-engine/tools/**` and `shared/**` subpaths and specific `@dude/crypto` subpaths (never the barrel). Each tool is its own chunk; the entry chunk must hold no engine.
- **Host** (`src/engine-host/`): the polyfill and worker host. It imports no tool engine and only `@dude/crypto/host`.

Everywhere: consume compiled `@dude/*` package exports, never Angular, Electron, Node-only packages, another application's sources or the heavy engine entrypoint, and no host globals (`window`, `document`, `Worker`, `Buffer`) or non-literal `import()`.

## Rules

- Declare dependencies in this workspace and update the single root lockfile. Keep SDK packages aligned with `expo/bundledNativeModules.json`.
- Use shared design tokens, stable setting definitions and persistence codecs. Android adapters own native facilities; portable packages own policies and contracts. Never edit the generated `src/registry/mobile-bindings.generated.ts` or `packages/tool-registry/src/mobile-tool-ids.generated.ts`; `npm run generate:registry` owns both.
- Generate `android/` locally with `npm run mobile:prebuild`. Put native changes in `modules/` and `plugins/`; generated files, keys and credentials are never committed. No EAS/cloud build or OTA update service.
- Permissions are a security decision. The merged release manifest requests only `CAMERA`, `INTERNET`, `VIBRATE` and `ACCESS_NETWORK_STATE`; storage, media, microphone, overlay and `ACCESS_WIFI_STATE` are removed by `plugins/with-android-privacy.cjs` and asserted by the native privacy test. Use the Photo Picker and the Storage Access Framework instead.

## Kit and tools

- Build screens from `src/kit` (`defineTextTool`, `ToolScreen`, `InputEditor`, `SingleLineField`, `SecretField`, `OptionsSheet`, `KeyValueList`, `OutputViewer`, `useToolPreference`/`useToolPreferences`). The kit never imports a tool engine. Controls keep 48 dp targets and honor font scale 1.5. Reuse the web preference keys; mobile-only values get a new key.
- Tool input is in memory only (`useToolInput`), cleared after 5 minutes in the background. Recents are `mobile.local` / `session` / `local-only`. Never persist a scanned Wi-Fi password, an `otpauth` secret or shared content; a new in-memory store must be listed in `scripts/data-scope-inventory.mjs`.
- Call the engine functions the Angular component uses, never pipeline steps. Every output needs Copy, Share and Save through the kit; every input needs a stated cap.
- Share-to-DUDE: a tool whose main field is not `input` needs one entry in `TEXT_INPUT_KEYS` (`src/share/share-model.ts`). Share never auto-runs a tool; deep links stay navigation-only.

## Off-thread work

Heavy engines run through `defineOffThreadTask` plus `useOffThreadRun` (or `runOffThread`) on the `react-native-worklets` Bundle Mode runtime, and there is no JS-thread fallback.

- Define the task in the tool folder with the `'worklet'` directive. Imports in the task body must be forwarded in `babel.config.cjs` (`importForwarding.moduleNames`: `@dude/tool-engine`, `@dude/crypto`, `@dude/shared-types`, `@dude/domain`; `relativePaths`: `src/tools`, `src/kit`, `src/engine-host`); anything else is a closure value and is not callable on the worker.
- The worker is bare Hermes: no `URL`, no expo native modules, no React Native `NativeModules`, and `crypto.getRandomValues` throws. `src/engine-host/worker-host.ts` installs only `fast-text-encoding`, the digest/HMAC host and that throwing random source. Payloads and results cross as JSON text. Jobs run one at a time; an aborted running job cannot be interrupted, its result is dropped.
- `request`, `compression`, `sanitizeHtml`, `htmlEntities`, `decodeImage` and `xxhash` throw `HostFacilityUnavailableError`; do not stub them.
- `babel-preset-expo` adds the worklets plugin without options, so `babel.config.cjs` disables it (`worklets: false`) and registers the plugin with `bundleMode`; `metro.config.cjs` uses `getBundleModeMetroConfig`. Do not remove either.

## Gotchas

- **Metro cache.** Worklet bodies are generated modules under `node_modules/react-native-worklets/.worklets/`, written during the Babel transform. After a fresh `npm ci` with a warm Metro cache they can be missing: start or export with `--clear` (for example `expo export --clear`) on fresh installs.
- **All SQLite access goes through `src/storage/serial-gate.ts`.** In expo-sqlite 57.0.3 a statement call is several native calls on a thread pool, `closeAsync` finalizes statements without marking the Kotlin side finalized and `getColumnNamesAsync` does not check the database is open, so a statement chain in flight at close uses freed memory (SIGSEGV in `getColumnNames`; fixed at Milestone 782). Never call expo-sqlite statements directly, and never close the connection while work is queued: the gate is FIFO for every statement and exclusive transaction, and `close()` drains it and then refuses new work. A change that touches storage must keep `serial-gate.spec.ts` passing.
- **Measurement flag.** The on-device measurement screen (`src/tools/_measure/`, `dude://dev/measure`) exists only in a build made with `EXPO_PUBLIC_DUDE_MEASURE=1`. Never import it from the shell or a tool, never set the flag for a shipped build and keep the `check-mobile-bundle` rule that fails a normal bundle containing it. Use it through `npm run measure:mobile -- --tools`.
- **Soft keyboard Back.** `hideKeyboard` in Maestro sends Back; `useKeyboardBack` (mounted once at shell level in `app/_layout.tsx`, so it covers every screen including the Search tab) makes the first Back dismiss the keyboard. The tool input uses `keyboardType="visible-password"` so Gboard on API 29 does not rewrite double spaces.
- **Deep links.** A link delivered while the cold-started app is mounting the router is dropped; flows wait for "This workbench" first. Links stay navigation-only.

## Verify

- Run `npm run check:mobile`, `npm run test:mobile` and `npm run mobile:bundle` for relevant changes. Local native builds need JDK 17, an Android SDK and an emulator/device; report absent prerequisites plainly.
- Every tool has `.maestro/tools/<id>.yaml`: `clearState`, wait for "This workbench", `openLink` `dude://tools/<id>`, `scrollUntilVisible` before off-screen assertions (add `centerElement: true` before tapping something that may stop at the bottom edge, or the tap can land on the navigation bar), expected values cited from an engine spec or computed with the same engine function. Maestro cannot type non-ASCII text, newlines or some quotes; use a Sample button. Run one with `npm run test:e2e:mobile -- --flow <id>`, the tool set with `-- --tools-only`, everything with no flag, on API 29 and API 36 (`ANDROID_SERIAL` selects the device). Camera scanning is not exercised on emulators.
