# DUDE Android Preview

Phase 31H is in progress. This workspace initially contains an executable Expo Router scaffold; navigation, Hub connection, durable cache and synchronization arrive in subsequent milestones. Tool execution belongs to 31I.

From the repository root, `npm ci` installs the owning workspace dependencies and `npm run mobile:bundle` builds portable packages and exports the Android JavaScript/assets into `dist/mobile`. `npm run check:mobile` checks TypeScript and host boundaries; `npm run test:mobile` exercises that boundary gate.

For native development, install JDK 17 and the Android SDK required by the Expo SDK 57 template (including platform/build tools), set `JAVA_HOME` and `ANDROID_HOME`, then attach an Android API 29+ device or start an emulator. `npm run mobile:prebuild` generates Android; `npm run mobile:android` builds and runs it locally with Gradle. `npm run mobile:start` starts Metro for an installed development build. Expo Go is insufficient for the planned local native modules.

Application configuration is owned by `app.config.ts`: **DUDE Preview**, `io.github.arahman200165.dude.preview`, `dude://`, Hermes, API 29 minimum / 36 target. Native source goes in `modules/` and config plugins in `plugins/`; `android/` and `.expo/` are generated and ignored. CNG uses the SDK template's compile/build tools; target 36 is explicit. OTA is disabled and no cloud build account is required. See [implementation decisions](../../docs/delivery/PHASE31H_PLAN.md).
