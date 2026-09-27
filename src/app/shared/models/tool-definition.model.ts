import { ToolCategory } from './tool-category.model';
import { PersistencePolicy } from './persistence-policy.model';
import { ToolIOCapabilities } from './tool-io.model';
import { ToolCapability } from './tool-capability.model';

export interface ToolPersistencePolicy {
  readonly input?: PersistencePolicy;
  readonly preferences?: PersistencePolicy;
}

export interface ToolExecutionPolicy {
  readonly worker?: 'none' | 'optional' | 'required';
}

export interface ToolNetworkPolicy {
  readonly required: boolean;
  readonly detail?: string;
}

/**
 * Backs the 'verified' confidence tier (DUDE_PRD.md §21 Phase 23 Item 1) — what was actually
 * tested, not a formal certification claim. `summary` is the compact, non-vague explanation
 * shown in the Verified Tool Badge (Phase 23 Item 14) and generated security doc (Item 13).
 */
export interface ToolVerificationMetadata {
  readonly vectors?: readonly string[];
  readonly crossChecked?: readonly string[];
  readonly propertyTested?: boolean;
  readonly summary?: string;
}

/**
 * High-Consequence Tool Matrix (DUDE_PRD.md §21 Phase 23 Item 7). `filesystem-write`,
 * `process-management`, `registry`, `network-scanning`, and `database-write` are reserved now
 * even though no shipped tool uses them yet, so Phase 27+ native tools tag themselves against a
 * stable, already-reviewed vocabulary from day one instead of inventing one per phase.
 */
export type ConsequenceClass =
  | 'crypto'
  | 'authentication'
  | 'code-execution'
  | 'filesystem-write'
  | 'process-management'
  | 'registry'
  | 'network-scanning'
  | 'database-write'
  | 'secret-management';

/**
 * The tool's primary text input can be loaded straight from a text file (Universal File Input —
 * see `core/text-file-input/AGENTS.md`). One declaration drives three consumers generically:
 * Smart File Drop ranks the tool for these extensions and writes the dropped file's text into
 * `key` before navigating; Smart Paste text-format matches prefill the same key; and the shared
 * `app-open-text-file` button defaults its picker filter to `extensions`. Distinct from
 * `desktopOpen`, which also registers Windows file associations (one owner per extension) —
 * `fileInput` extensions may be shared by any number of tools.
 */
export interface ToolFileInput {
  /** The tool's own `PersistenceService.signal(...)` key for its primary text input. */
  readonly key: string;
  /** Lower-case, dot-prefixed (`'.md'`), matched against a dropped/opened file's name. */
  readonly extensions: readonly string[];
  /** Persistence policy `key` is declared with in the component — defaults to `'session'`. */
  readonly policy?: 'session' | 'user-choice';
}

/**
 * A preference the owning tool lets a saved workspace/template/project override (Settings
 * extension point — see `core/workspace/workspace-preference.ts`). `key` is one of the tool's own
 * `local`-policy `PersistenceService.signal(...)` keys holding a string; the Workspace settings
 * popover renders one input per declaration, generically, straight from the registry.
 */
export interface WorkspaceOverridablePreference {
  readonly key: string;
  readonly label: string;
  readonly type: 'text' | 'url';
}

/**
 * A tool-contributed Settings section, rendered under the Settings page's "Tools" group at
 * `/settings/tools/<toolId>` (`shell/settings/`). `load` resolves a standalone component, exactly
 * like `ToolDefinition.load`. `onboarding: true` also renders it in the first-run wizard.
 */
export interface ToolSettingsSection {
  readonly title: string;
  readonly keywords?: readonly string[];
  readonly desktopOnly?: boolean;
  readonly onboarding?: boolean;
  readonly load: () => Promise<unknown>;
  readonly workspaceOverridable?: readonly WorkspaceOverridablePreference[];
}

/**
 * A one-time move of a legacy `local` storage value into this tool's own namespace, run once at
 * bootstrap by `core/persistence/storage-migrations.ts` (copy only when the target is empty, then
 * delete the source). The target namespace is always the declaring tool's id.
 */
export interface ToolStorageMigration {
  readonly fromNamespace: string;
  readonly fromKey: string;
  readonly toKey: string;
}

export interface ToolDefinition {
  readonly id: string;
  readonly title: string;
  readonly shortTitle?: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly keywords: readonly string[];
  readonly route: string;
  readonly icon?: string;
  readonly load: () => Promise<unknown>;
  readonly persistence?: ToolPersistencePolicy;
  readonly execution?: ToolExecutionPolicy;
  readonly network?: ToolNetworkPolicy;
  readonly io: ToolIOCapabilities;
  /** Desktop Explorer file/folder opening, interpreted generically by the platform bridge. */
  readonly desktopOpen?: { readonly extensions?: readonly string[]; readonly inputKey?: string; readonly directory?: boolean };
  /** Primary text input loadable from a file — see `ToolFileInput`. */
  readonly fileInput?: ToolFileInput;
  readonly status?: 'experimental' | 'stable' | 'verified';
  readonly verification?: ToolVerificationMetadata;
  readonly consequenceClass?: readonly ConsequenceClass[];
  /**
   * Web Capability Matrix (DUDE_PRD.md §21 Phase 26 Item 6; supersedes Phase 25's free-string
   * `desktopCapabilities`) — native platform capabilities and optional runtimes this tool uses, from
   * a closed vocabulary (see `ToolCapability`). Drives the capability badges, the generated matrix in
   * README/SECURITY.md, offline readiness, and pipeline gating. Distinct from `desktopOpen`, which is
   * about *file types this tool can open*, not general desktop-only capability.
   */
  readonly capabilities?: readonly ToolCapability[];
  /**
   * Listed as a jump-list shortcut of the installed PWA (Phase 26 Item 9), generated into
   * `manifest.webmanifest` by `scripts/generate-web-manifest.mjs` in ascending `order`. Browsers
   * show only a handful, so conformance caps opt-ins at 10. Reserve it for the most-used tools.
   */
  readonly pwaShortcut?: { readonly order: number };
  /** A Settings section this tool contributes — see `ToolSettingsSection`. */
  readonly settingsSection?: ToolSettingsSection;
  /** Legacy storage keys moved into this tool's namespace at bootstrap — see `ToolStorageMigration`. */
  readonly storageMigrations?: readonly ToolStorageMigration[];
}
