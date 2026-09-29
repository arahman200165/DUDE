import type { PanelConfig } from '../../shared/models/panel-definition.model';
import type { GridItem } from './grid-engine';
import type { UserContent } from './user-content.model';

/**
 * One placed panel. `id` is the stable instance id (also the `GridItem.id` in both placement
 * lists); `kindId` names a registry panel kind. Instances and their content are shared between the
 * wide and narrow layouts — only placements differ per width.
 */
export interface PanelInstance {
  readonly id: string;
  readonly kindId: string;
  readonly config: PanelConfig;
  readonly visible: boolean;
}

export interface HomeLayout {
  readonly instances: readonly PanelInstance[];
  readonly wide: readonly GridItem[];
  readonly narrow: readonly GridItem[];
}

export type LayoutWidth = 'wide' | 'narrow';

/** A layout being edited (Settings › Home layout). Saved atomically via `HomeLayoutService.save`. */
export interface HomeLayoutDraft {
  readonly instances: readonly PanelInstance[];
  readonly wide: readonly GridItem[];
  readonly narrow: readonly GridItem[];
  /** False until the user deliberately arranges the narrow layout; it then follows the wide one. */
  readonly narrowCustomized: boolean;
  readonly content: Readonly<Record<string, UserContent>>;
}
