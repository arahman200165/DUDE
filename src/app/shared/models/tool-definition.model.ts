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
  readonly status?: 'experimental' | 'stable' | 'verified';
  readonly verification?: ToolVerificationMetadata;
}
