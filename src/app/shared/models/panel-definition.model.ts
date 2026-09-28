import type { PlatformCapabilityId, WebAvailability } from './tool-capability.model';

/**
 * Home panel-kind manifest (DUDE_PRD.md Phase 30I). Each first-party Home panel declares one of
 * these in a colocated `<kind-id>.panel-manifest.ts`; `npm run generate:registry` assembles them
 * into `PANEL_DEFINITIONS` (`core/registry/panel-definitions.ts`, generated — never hand-edited).
 * The Home renderer, the layout editor, the available-panel picker, the default layout and layout
 * validation all read that one registry, so a new feature contributes a panel without touching
 * Home, Settings or any shell component. Registering a tool does not create a panel; a panel
 * contribution is always its own explicit declaration.
 */

/** Authoritative sources a panel may read live. Panels compose these; they never copy their state. */
export const PANEL_DATA_SOURCES = [
  'tool-registry',
  'usage',
  'favorites',
  'recents',
  'pipelines',
  'workspaces',
  'projects',
  'command-sources',
  'smart-paste',
  'platform',
  'user-content',
] as const;

export type PanelDataSource = (typeof PANEL_DATA_SOURCES)[number];

/** Same vocabulary as tools: a capability a panel needs beyond the browser-safe core. */
export interface PanelCapability {
  readonly id: PlatformCapabilityId;
  /** `unavailable` = the panel cannot work on the web; `fallback` = it works in a weaker form. */
  readonly web: WebAvailability;
  /** User-facing explanation of what desktop adds (shown in the web capability explanation). */
  readonly note: string;
}

/** What Home does with a panel whose required capability is unavailable on the current platform. */
export type PanelWebBehavior = 'omit' | 'explain';

export interface PanelSizeLimits {
  readonly minW: number;
  readonly minH: number;
  readonly maxW?: number;
  readonly maxH?: number;
}

/** Position in the shipped default layout. Packed in `order` with first-fit, so no coordinates. */
export interface PanelDefaultPlacement {
  readonly order: number;
  readonly w: number;
  readonly h: number;
}

/** A small typed per-instance configuration field (validated on restore/import). */
export type PanelConfigField =
  | { readonly key: string; readonly label: string; readonly type: 'number'; readonly min: number; readonly max: number; readonly default: number }
  | {
      readonly key: string;
      readonly label: string;
      readonly type: 'select';
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly default: string;
    }
  | { readonly key: string; readonly label: string; readonly type: 'boolean'; readonly default: boolean };

export type PanelConfigValue = string | number | boolean;
export type PanelConfig = Readonly<Record<string, PanelConfigValue>>;

/** User-authored panel kinds hold their content in the layout store, keyed by instance id. */
export type UserContentKind = 'text' | 'link' | 'shortcut';

export interface PanelDefinition {
  /** Stable kind id, referenced by persisted layouts. Kebab-case; equals the manifest file name. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Renderer, lazily loaded (same contract as `ToolDefinition.load`). */
  readonly load: () => Promise<unknown>;
  readonly size: PanelSizeLimits;
  /** Omit to keep the kind out of the shipped default layout (still available in the picker). */
  readonly defaultPlacement?: PanelDefaultPlacement;
  /** True only where per-instance configuration makes duplicates distinct. */
  readonly multiInstance?: boolean;
  readonly config?: readonly PanelConfigField[];
  readonly capabilities?: readonly PanelCapability[];
  /** Default `omit`. */
  readonly webBehavior?: PanelWebBehavior;
  /** Live sources this panel reads; must be authoritative services, never a copied store. */
  readonly dataDependencies: readonly PanelDataSource[];
  /** Set on the three user-authored kinds; their content lives in the layout store. */
  readonly userContent?: UserContentKind;
  /** Prior kind ids this one replaces, so persisted layouts survive renames. */
  readonly replaces?: readonly string[];
}
