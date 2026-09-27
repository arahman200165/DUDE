import { ToolCategory } from './tool-category.model';
import { PersistencePolicy } from './persistence-policy.model';
import { ToolIOCapabilities } from './tool-io.model';

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
  /** Optional application-menu role; declared by the owning tool manifest. */
  readonly nativeMenu?: { readonly preferences?: boolean };
  readonly status?: 'experimental' | 'stable' | 'verified';
  readonly verification?: ToolVerificationMetadata;
  readonly consequenceClass?: readonly ConsequenceClass[];
  /**
   * Desktop Capability Indicators (DUDE_PRD.md §21 Phase 25 Item 10) — free-string labels of what
   * this tool does better on desktop (e.g. `'native filesystem access'`), deliberately loose like
   * `ToolVerificationMetadata.vectors` since Phase 26's "Web Capability Matrix" may reshape this
   * later. Distinct from `desktopOpen`, which is about *file types this tool can open*, not general
   * desktop-only capability.
   */
  readonly desktopCapabilities?: readonly string[];
}
