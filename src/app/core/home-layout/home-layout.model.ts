import type { PanelConfig } from '../../shared/models/panel-definition.model';
import type { GridItem } from './grid-engine';

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
