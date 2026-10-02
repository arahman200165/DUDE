import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
declare global { interface Window { readonly dude?: PlatformBridge; } }
export {};
