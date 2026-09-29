/**
 * Web Capability Matrix (DUDE_PRD.md §21 Phase 26 Item 6) — a closed vocabulary of what a tool
 * needs beyond the shared, browser-safe core. Replaces Phase 25's free-string
 * `desktopCapabilities` so desktop/web differences are declared, generated into README/SECURITY.md,
 * and enforced by the conformance harness (a tool importing a native service must declare it)
 * rather than living in prose.
 *
 * Closed like `ConsequenceClass`: adding an id is a framework change (update
 * `core/platform/capability-catalog.ts`, the conformance harness, and the doc generator together).
 * `secure-keychain` is reserved — no shipped tool stores a tool-level secret yet. `native-fs-write`
 * (Phase 29) marks tools that change files on disk, always through the mutation engine's preview →
 * confirm → journal contract (DUDE_PRD.md §5.2.1).
 */
export type PlatformCapabilityId = 'native-fs' | 'native-fs-write' | 'file-watch' | 'llm-proxy' | 'collab-relay' | 'secure-keychain' | 'native-network' | 'native-system' | 'native-system-write';

export const PLATFORM_CAPABILITY_IDS: readonly PlatformCapabilityId[] = [
  'native-fs',
  'native-fs-write',
  'file-watch',
  'llm-proxy',
  'collab-relay',
  'secure-keychain',
  'native-network',
  'native-system',
  'native-system-write',
];

/**
 * Optional runtime payloads cached on demand by the web service worker (`ngsw-config.json`'s lazy
 * groups) and shipped locally by the desktop build. Each maps to exactly one asset group in
 * `core/offline/runtime-catalog.ts`.
 */
export type RuntimeId = 'pyodide' | 'sqljs' | 'xmllint' | 'ejs';

export const RUNTIME_IDS: readonly RuntimeId[] = ['pyodide', 'sqljs', 'xmllint', 'ejs'];

/**
 * How the capability behaves on the web companion:
 * - `fallback` — the tool still does the job in a browser, via a weaker path (e.g. a
 *   `<input webkitdirectory>` file list instead of a real folder on disk). Badged "Desktop-enhanced".
 * - `unavailable` — this specific feature is absent on the web; the rest of the tool still works.
 *   Badged "Desktop-only feature".
 */
export type WebAvailability = 'fallback' | 'unavailable';

export interface PlatformToolCapability {
  readonly kind: 'platform';
  readonly id: PlatformCapabilityId;
  readonly web: WebAvailability;
  /** Tool-specific, user-facing explanation of what desktop adds (shown in badges/tooltips). */
  readonly note: string;
}

export interface RuntimeToolCapability {
  readonly kind: 'runtime';
  readonly runtime: RuntimeId;
}

export type ToolCapability = PlatformToolCapability | RuntimeToolCapability;
