import { Injectable, InjectionToken, Type, inject } from '@angular/core';
import type { PanelDefinition, PanelSizeLimits } from '../../shared/models/panel-definition.model';
import { PlatformService } from '../platform/platform.service';
import { HomeLayout } from '../home-layout/home-layout.model';
import { buildDefaultLayout } from '../home-layout/default-layout';
import { PanelAvailability, panelAvailability } from '../home-layout/panel-availability';
import { PANEL_DEFINITIONS } from './panel-definitions';
import { withLoadFallback } from './tool-routes';

/** Overridable in tests; production always resolves the generated registry. */
export const PANEL_DEFINITIONS_TOKEN = new InjectionToken<readonly PanelDefinition[]>('PANEL_DEFINITIONS', {
  providedIn: 'root',
  factory: () => PANEL_DEFINITIONS,
});

const FALLBACK_SIZE: PanelSizeLimits = { minW: 2, minH: 1 };

/**
 * Single source for Home's renderer, the layout editor, the available-panel picker, the default
 * layout and layout validation. Knows no panel kind by name — it only indexes the generated
 * declarations.
 */
@Injectable({ providedIn: 'root' })
export class PanelRegistryService {
  private readonly definitions = inject(PANEL_DEFINITIONS_TOKEN);
  private readonly platform = inject(PlatformService);
  private readonly byId = new Map<string, PanelDefinition>();
  private readonly byReplaced = new Map<string, PanelDefinition>();

  constructor() {
    for (const def of this.definitions) {
      this.byId.set(def.id, def);
      for (const old of def.replaces ?? []) this.byReplaced.set(old, def);
    }
  }

  getAll(): readonly PanelDefinition[] {
    return this.definitions;
  }

  getById(id: string): PanelDefinition | undefined {
    return this.byId.get(id);
  }

  /** Current definition for a persisted kind id, following `replaces` after a rename. */
  resolveKind(persistedKindId: string): PanelDefinition | undefined {
    return this.byId.get(persistedKindId) ?? this.byReplaced.get(persistedKindId);
  }

  limitsOf(kindId: string): PanelSizeLimits {
    return this.resolveKind(kindId)?.size ?? FALLBACK_SIZE;
  }

  availability(def: PanelDefinition): PanelAvailability {
    return panelAvailability(def, this.platform.isDesktop());
  }

  defaultLayout(): HomeLayout {
    return buildDefaultLayout(this.definitions);
  }

  /** Lazy renderer for a kind, degrading to the shared load-failure component on a failed chunk. */
  loadComponent(def: PanelDefinition): Promise<Type<unknown>> {
    return withLoadFallback(`panel "${def.id}"`, def.load)();
  }
}
