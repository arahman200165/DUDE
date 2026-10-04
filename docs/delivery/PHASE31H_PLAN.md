# Phase 31H implementation decisions

Status: implementation started at Milestone 720; the phase exit gate is pending. No tools are executable on Android until Phase 31I.

- **PD-075 — Android build baseline.** Expo SDK **57.0.26**, React Native **0.86.3**, React **19.2.3**, Hermes, Expo Router and local Continuous Native Generation/Gradle. SDK libraries follow the installed Expo `bundledNativeModules.json`. The root remains Node 24 / npm 11.19 with one lockfile; mobile consumes compiled workspace package exports. Android's supported floor is API 29 and its target is API 36; compile/target SDK are pinned to API 36; build tools follow the SDK template. JDK 17 is the native toolchain requirement. The system currently has JDK 23; a checksum-verified portable JDK 17 is available under ignored `tmp/mobile-toolchain/` for local verification without a system install.
- **PD-076 — Preview identity and delivery.** The initial package is `io.github.arahman200165.dude.preview`, display name **DUDE Preview**, `dude` deep-link scheme. No EAS/cloud build, vendor backend or OTA runtime; `updates.enabled` is false. Generated Android files remain untracked. Native changes live in local Expo modules/config plugins.
- **PD-077 — Mobile host boundary.** TypeScript/TSX gates prohibit Angular, Electron, Node built-ins and Node-only workspaces, browser-only storage/DOM globals, application-source imports and source aliases into packages. The shell permits the lightweight `@dude/tool-engine/core/registry/tool-search` subpath, with no other engine imports. Native ports are mobile-owned; shared registry, tokens, policies and sync contracts remain package-owned.

SDK alignment includes root npm overrides for `react-native-worklets` **0.10.1** and `react-native-reanimated` **4.5.1**: Expo Router's wildcard optional peers otherwise hoist newer incompatible native versions beside the declared workspace versions. This creates mismatched Babel/runtime instances. Update these overrides together with the owning mobile dependency pins during an SDK upgrade.

The root build-tool dependencies explicitly pin `@babel/generator` **7.29.7**. Worklets 0.10's plugin requires this module without declaring it; with Angular's generator 8 hoisted, generating Expo's Babel 7 TypeScript AST failed in `Printer.TSFunctionType` during the first Android export. This build-only compatibility pin makes that undeclared lookup deterministic; Angular retains generator 8 under its owning Babel packages. It grants no application import permission.

These decisions lock the bootstrap and do not claim registration, synchronization, native security or device acceptance. Later milestones add the shell, secure signer/HTTPS transport, cache and sync adapters before the phase-wide verification.

References: [Expo CNG](https://docs.expo.dev/workflow/continuous-native-generation/), [build properties](https://docs.expo.dev/versions/latest/sdk/build-properties/), [Phase 31H scope](ROADMAP.md#phase-31h).
