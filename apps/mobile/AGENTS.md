# AGENTS.md — apps/mobile/

Android companion, Expo SDK 57 / React Native 0.86 / React 19.2, Hermes and Expo Router. Read the root instructions and [Phase 31H decisions](../../docs/delivery/PHASE31H_PLAN.md). Phase 31H built the shell and sync; tool execution is in progress in 31I under [its decisions](../../docs/delivery/PHASE31I_PLAN.md) (read PD-085 to PD-094 before adding a tool screen).

- Consume compiled `@dude/*` package exports. Never import Angular, Electron, Node-only packages, another application's sources or the heavy engine entrypoint. Only `@dude/tool-engine/core/registry/tool-search` is allowed in the shell.
- Declare dependencies in this workspace and update the single root lockfile. Keep SDK packages aligned with `expo/bundledNativeModules.json`.
- Use shared design tokens, stable setting definitions and persistence codecs. Android adapters own native facilities; portable packages own policies and contracts.
- Generate `android/` locally with `npm run mobile:prebuild`. Put native changes in `modules/` and `plugins/`; generated files, keys and credentials are never committed. No EAS/cloud build or OTA update service.
- Run `npm run check:mobile`, `npm run test:mobile` and `npm run mobile:bundle` for relevant changes. Local native builds need JDK 17, an Android SDK and an emulator/device; report absent prerequisites plainly.
