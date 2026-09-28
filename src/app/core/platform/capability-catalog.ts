import { PlatformCapabilityId, RuntimeId, ToolCapability } from '../../shared/models/tool-capability.model';

/**
 * Shell-facing labels for the closed capability vocabulary (DUDE_PRD.md §21 Phase 26 Item 6).
 * Tool-agnostic by design: a tool's own `note` says what *it* does with the capability; this says
 * what the capability *is*, for the matrix, badges, and SECURITY.md.
 */
export interface PlatformCapabilityInfo {
  readonly label: string;
  readonly description: string;
  /** Renderer service that exposes it — conformance enforces "imports this ⇔ declares it". */
  readonly service: string;
  /** Other renderer entry points that also count as using it (a shared component wrapping the service). */
  readonly alsoVia?: readonly string[];
}

export const PLATFORM_CAPABILITIES: Readonly<Record<PlatformCapabilityId, PlatformCapabilityInfo>> = {
  'native-fs': {
    label: 'Native filesystem access',
    description: 'Reads user-granted folders/files directly from disk through the desktop bridge.',
    service: 'NativeFsService',
    alsoVia: ['FsJobService', 'FsRootPicker'],
  },
  'native-fs-write': {
    label: 'Native filesystem write',
    description: 'Changes files in user-granted folders only through a previewed, confirmed, journaled and undoable plan.',
    service: 'FsMutationService',
    alsoVia: ['MutationPreview'],
  },
  'file-watch': {
    label: 'File watching',
    description: 'Watches user-granted files or folders on disk for external changes.',
    service: 'FileWatchService',
    alsoVia: ['FolderWatchService'],
  },
  'llm-proxy': {
    label: 'Local LLM proxy',
    description: 'Talks to a user-configured local/self-hosted LLM endpoint through the desktop proxy.',
    service: 'LlmProxyService',
  },
  'collab-relay': {
    label: 'Collaboration relay',
    description: 'Hosts a local collaboration session, optionally via a self-hosted relay.',
    service: 'CollabService',
  },
  'native-network': {
    label: 'Native network diagnostics',
    description: 'Runs explicit network checks and reads local network state through the desktop bridge.',
    service: 'NetworkDiagnosticsService',
  },
  'secure-keychain': {
    label: 'OS keychain storage',
    description: 'Stores secrets encrypted by the operating system keychain (Electron safeStorage).',
    service: 'SecureLocalService',
  },
};

export interface RuntimeInfo {
  readonly label: string;
  /** The `ngsw-config.json` asset group that caches this runtime on the web. */
  readonly assetGroup: string;
}

export const RUNTIMES: Readonly<Record<RuntimeId, RuntimeInfo>> = {
  pyodide: { label: 'Pyodide (Python/WASM)', assetGroup: 'pyodide' },
  sqljs: { label: 'sql.js (SQLite/WASM)', assetGroup: 'sql.js' },
  xmllint: { label: 'xmllint (libxml2/WASM)', assetGroup: 'xmllint-wasm' },
  ejs: { label: 'EJS template engine', assetGroup: 'ejs' },
};

export function platformCapabilities(capabilities: readonly ToolCapability[] | undefined) {
  return (capabilities ?? []).filter((c) => c.kind === 'platform');
}

export function runtimeCapabilities(capabilities: readonly ToolCapability[] | undefined): readonly RuntimeId[] {
  return (capabilities ?? []).flatMap((c) => (c.kind === 'runtime' ? [c.runtime] : []));
}
